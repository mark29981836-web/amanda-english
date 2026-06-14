const state = {
  words: [],
  filter: "all",
  query: "",
  learned: new Set(JSON.parse(localStorage.getItem("learnedWords") || "[]")),
  dailyOffset: 0,
  dailyWords: [],
  quiz: [],
  quizIndex: 0,
  quizScore: 0,
  quizLevel: 1,
  quizResults: [],
  shadowIndex: 0,
  audio: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const labels = { hair: "髮廊英文", life: "生活英文" };
const assetUrl = (path) => window.AMANDA_ASSETS?.[path] || path;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function init() {
  try {
    const response = await fetch("words.json");
    if (!response.ok) throw new Error("資料讀取失敗");
    state.words = await response.json();
    const hero = document.querySelector("#heroImage");
    if (hero) hero.src = assetUrl("assets/images/hero-publish.jpg");
    $("#totalCount").textContent = state.words.length;
    updateLearnedCount();
    updateStreak();
    bindEvents();
    renderCards(state.words, $("#cardGrid"));
    renderDaily();
    renderShadow();
    registerPwa();
  } catch (error) {
    document.body.innerHTML = `<main class="error"><h1>頁面需要透過啟動器開啟</h1><p>請雙擊資料夾內的「啟動英文學習.command」，不要直接雙擊 index.html。</p></main>`;
  }
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderFiltered();
  });
  $("#filters").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    $$("#filters button").forEach((item) => item.classList.toggle("active", item === button));
    state.filter = button.dataset.filter;
    renderFiltered();
  });
  $$(".bottom-nav button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));
  $("#refreshDaily").addEventListener("click", () => {
    state.dailyOffset += 17;
    renderDaily();
    startQuiz();
    showToast("今日圖卡與測驗已同步換成新的一組");
  });
  $("#shadowPlay").addEventListener("click", playShadow);
  $("#previousShadow").addEventListener("click", () => changeShadow(-1));
  $("#nextShadow").addEventListener("click", () => changeShadow(1));
}

function switchView(view) {
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  $$(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "quiz") startQuiz();
  const section = document.getElementById(view);
  window.scrollTo({ top: Math.max(0, section.offsetTop - 88), behavior: "smooth" });
}

function renderFiltered() {
  const results = state.words.filter((item) => {
    const categoryMatch = state.filter === "all"
      || item.category === state.filter
      || (state.filter === "customer" && item.customer);
    const text = `${item.word} ${item.chinese} ${item.sentence} ${item.translation}`.toLowerCase();
    return categoryMatch && text.includes(state.query);
  });
  renderCards(results, $("#cardGrid"));
  $("#emptyState").hidden = results.length > 0;
}

function renderCards(words, container) {
  container.innerHTML = "";
  words.forEach((item) => {
    const fragment = $("#cardTemplate").content.cloneNode(true);
    const card = fragment.querySelector(".word-card");
    const image = fragment.querySelector("img");
    image.src = assetUrl(item.image);
    image.alt = `${item.chinese}的情境插圖`;
    fragment.querySelector(".category-pill").textContent = item.customer ? "客戶對話" : labels[item.category];
    fragment.querySelector("h3").textContent = item.word;
    fragment.querySelector(".chinese").textContent = item.chinese;
    fragment.querySelector(".english-sentence").textContent = item.sentence;
    fragment.querySelector(".translation").textContent = item.translation;
    const learned = fragment.querySelector(".learn-button");
    learned.classList.toggle("learned", state.learned.has(item.id));
    learned.addEventListener("click", () => toggleLearned(item.id, learned));
    fragment.querySelector(".word-audio").addEventListener("click", (event) => playAudio(item.wordAudio, event.currentTarget));
    fragment.querySelector(".sentence-audio").addEventListener("click", (event) => playAudio(item.sentenceAudio, event.currentTarget));
    card.dataset.id = item.id;
    container.appendChild(fragment);
  });
}

function playAudio(path, button, onEnded) {
  if (state.audio) {
    state.audio.pause();
    $$(".playing").forEach((item) => item.classList.remove("playing"));
  }
  const audio = new Audio(assetUrl(path));
  state.audio = audio;
  button?.classList.add("playing");
  audio.addEventListener("ended", () => {
    button?.classList.remove("playing");
    onEnded?.();
  }, { once: true });
  audio.addEventListener("error", () => {
    button?.classList.remove("playing");
    showToast("音訊載入失敗，請重新整理頁面");
  }, { once: true });
  audio.play().catch(() => showToast("請再按一次播放按鈕"));
}

function toggleLearned(id, button) {
  if (state.learned.has(id)) state.learned.delete(id);
  else state.learned.add(id);
  localStorage.setItem("learnedWords", JSON.stringify([...state.learned]));
  button.classList.toggle("learned", state.learned.has(id));
  updateLearnedCount();
  showToast(state.learned.has(id) ? "已加入熟悉清單" : "已取消標記");
}

function updateLearnedCount() {
  $("#learnedCount").textContent = state.learned.size;
}

function updateStreak() {
  const today = localDateKey();
  const saved = JSON.parse(localStorage.getItem("learningStreak") || "{}");
  let count = saved.count || 1;
  if (saved.date && saved.date !== today) {
    const gap = Math.round((new Date(today) - new Date(saved.date)) / 86400000);
    count = gap === 1 ? count + 1 : 1;
  }
  localStorage.setItem("learningStreak", JSON.stringify({ date: today, count }));
  $("#streakCount").textContent = count;
}

function seededSelection(count, offset = 0) {
  const dateKey = Number(localDateKey().replaceAll("-", ""));
  const scored = state.words.map((word, index) => ({
    word,
    score: Math.sin((index + 1) * 999 + dateKey + offset) * 10000 % 1,
  }));
  return scored.sort((a, b) => a.score - b.score).slice(0, count).map((item) => item.word);
}

function renderDaily() {
  const date = new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
  $("#todayDate").textContent = date;
  state.dailyWords = seededSelection(5, state.dailyOffset);
  renderCards(state.dailyWords, $("#dailyGrid"));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - .5);
}

function startQuiz() {
  state.quiz = shuffle(state.dailyWords);
  state.quizIndex = 0;
  state.quizScore = 0;
  state.quizLevel = 1;
  state.quizResults = [];
  resetQuizPanel();
  renderQuiz();
}

function resetQuizPanel() {
  $("#quizPanel").innerHTML = `
    <div class="quiz-progress"><span id="quizProgress">1 / 5</span><span id="quizScore">完成 0 題</span></div>
    <div class="quiz-image-window">
      <img id="quizImage" alt="">
    </div>
    <div class="quiz-word-heading">
      <div>
        <span class="difficulty-badge" id="difficultyBadge"></span>
        <h3 id="quizChinese"></h3>
      </div>
      <button class="audio-button quiz-audio" id="quizAudio" aria-label="播放單字發音">▶</button>
    </div>
    <p class="quiz-instruction" id="quizInstruction"></p>
    <form id="spellingForm">
      <div class="spelling-area" id="spellingArea"></div>
      <button class="primary-button full" type="submit">檢查拼字</button>
    </form>
    <div class="quiz-result" id="quizResult" aria-live="polite"></div>
    <div class="quiz-actions">
      <button class="text-button" id="easierQuiz" type="button">給我多一點提示</button>
      <button class="text-button reveal-answer" id="revealAnswer" type="button" hidden>顯示答案</button>
    </div>
    <button class="primary-button full" id="nextQuiz" type="button" hidden>下一題</button>
  `;
  $("#spellingForm").addEventListener("submit", checkSpelling);
  $("#quizAudio").addEventListener("click", (event) => {
    playAudio(state.quiz[state.quizIndex].wordAudio, event.currentTarget);
  });
  $("#easierQuiz").addEventListener("click", lowerQuizDifficulty);
  $("#revealAnswer").addEventListener("click", revealQuizAnswer);
  $("#nextQuiz").addEventListener("click", nextQuiz);
}

function renderQuiz() {
  const item = state.quiz[state.quizIndex];
  $("#quizProgress").textContent = `${state.quizIndex + 1} / ${state.quiz.length}`;
  $("#quizScore").textContent = `完成 ${state.quizResults.length} 題`;
  $("#quizImage").src = assetUrl(item.image);
  $("#quizImage").alt = item.chinese;
  $("#quizChinese").textContent = item.chinese;
  $("#quizResult").textContent = "";
  $("#nextQuiz").hidden = true;
  $("#spellingForm").hidden = false;
  $("#easierQuiz").hidden = state.quizLevel >= 3;
  $("#revealAnswer").hidden = state.quizLevel < 3;
  renderSpellingLevel(item);
}

function renderSpellingLevel(item) {
  const badge = $("#difficultyBadge");
  const instruction = $("#quizInstruction");
  const area = $("#spellingArea");
  const levelConfig = {
    1: ["第 1 級・困難", "不看字母提示，完整拼出英文。可以先按喇叭聽發音。"],
    2: ["第 2 級・中等", "首字母和母音已經出現，請填入缺少的子音。"],
    3: ["第 3 級・簡單", "子音已經出現，請聽發音填入母音：A、E、I、O、U，有時也包含 Y。"],
  };

  badge.textContent = levelConfig[state.quizLevel][0];
  badge.dataset.level = state.quizLevel;
  instruction.textContent = levelConfig[state.quizLevel][1];
  area.innerHTML = "";

  if (state.quizLevel === 1) {
    const input = document.createElement("input");
    input.className = "whole-word-input";
    input.id = "wholeWordInput";
    input.type = "text";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.placeholder = "在這裡拼出完整英文";
    input.setAttribute("aria-label", "輸入完整英文單字");
    input.addEventListener("input", () => input.classList.remove("incorrect"));
    area.appendChild(input);
    setTimeout(() => input.focus(), 0);
    return;
  }

  const letters = [...item.word];
  const vowels = "aeiouy";
  let wordStart = true;
  letters.forEach((letter, index) => {
    if (!/[a-z]/i.test(letter)) {
      const separator = document.createElement("span");
      separator.className = letter === " " ? "letter-space" : "letter-fixed";
      separator.textContent = letter;
      area.appendChild(separator);
      wordStart = true;
      return;
    }

    const isVowel = vowels.includes(letter.toLowerCase());
    const reveal = state.quizLevel === 2
      ? wordStart || isVowel
      : !isVowel;

    if (reveal) {
      const fixed = document.createElement("span");
      fixed.className = "letter-fixed";
      fixed.textContent = letter.toUpperCase();
      area.appendChild(fixed);
    } else {
      const input = document.createElement("input");
      input.className = "letter-input";
      input.maxLength = 1;
      input.autocomplete = "off";
      input.autocapitalize = "characters";
      input.spellcheck = false;
      input.dataset.index = index;
      input.setAttribute("aria-label", `第 ${index + 1} 個字母`);
      input.addEventListener("input", focusNextLetter);
      input.addEventListener("keydown", focusPreviousLetter);
      area.appendChild(input);
    }
    wordStart = false;
  });

  const firstInput = area.querySelector(".letter-input");
  setTimeout(() => firstInput?.focus(), 0);
}

function focusNextLetter(event) {
  event.target.value = event.target.value.replace(/[^a-z]/gi, "").slice(-1).toUpperCase();
  event.target.classList.remove("incorrect");
  if (!event.target.value) return;
  const inputs = $$("#spellingArea .letter-input");
  const position = inputs.indexOf(event.target);
  inputs[position + 1]?.focus();
}

function focusPreviousLetter(event) {
  if (event.key !== "Backspace" || event.target.value) return;
  const inputs = $$("#spellingArea .letter-input");
  const position = inputs.indexOf(event.target);
  inputs[position - 1]?.focus();
}

function normalizeSpelling(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function currentSpelling(item) {
  if (state.quizLevel === 1) return $("#wholeWordInput").value;
  const entered = new Map(
    $$("#spellingArea .letter-input").map((input) => [Number(input.dataset.index), input.value])
  );
  return [...item.word].map((letter, index) => entered.has(index) ? entered.get(index) : letter).join("");
}

function checkSpelling(event) {
  event.preventDefault();
  const item = state.quiz[state.quizIndex];
  const answer = currentSpelling(item);
  const correct = normalizeSpelling(answer) === normalizeSpelling(item.word);

  if (correct) {
    state.quizScore += 1;
    state.quizResults.push({ id: item.id, level: state.quizLevel, revealed: false });
    $("#quizResult").innerHTML = `<strong>拼對了！${item.word}</strong><span>${difficultyPraise(state.quizLevel)}</span>`;
    finishQuizQuestion(item);
  } else {
    $("#quizResult").innerHTML = "<strong>還差一點</strong><span>再聽一次，或按「給我多一點提示」。</span>";
    markIncorrectLetters(item);
    playAudio(item.wordAudio, $("#quizAudio"));
  }
}

function difficultyPraise(level) {
  if (level === 1) return "你完全靠記憶拼出來了。";
  if (level === 2) return "你利用母音線索找回了完整拼法。";
  return "你用發音辨認出重要母音了。";
}

function markIncorrectLetters(item) {
  if (state.quizLevel === 1) {
    $("#wholeWordInput").classList.add("incorrect");
    return;
  }
  $$("#spellingArea .letter-input").forEach((input) => {
    const expected = item.word[Number(input.dataset.index)].toLowerCase();
    input.classList.toggle("incorrect", input.value.toLowerCase() !== expected);
  });
}

function lowerQuizDifficulty() {
  if (state.quizLevel >= 3) return;
  state.quizLevel += 1;
  $("#quizResult").textContent = "";
  renderQuiz();
  playAudio(state.quiz[state.quizIndex].wordAudio, $("#quizAudio"));
}

function revealQuizAnswer() {
  const item = state.quiz[state.quizIndex];
  state.quizResults.push({ id: item.id, level: 4, revealed: true });
  $("#quizResult").innerHTML = `<strong>答案：${item.word}</strong><span>按喇叭再聽一次，眼睛跟著每個字母走。</span>`;
  finishQuizQuestion(item);
}

function finishQuizQuestion(item) {
  $("#spellingForm").hidden = true;
  $("#easierQuiz").hidden = true;
  $("#revealAnswer").hidden = true;
  $("#nextQuiz").hidden = false;
  $("#nextQuiz").textContent = state.quizIndex === state.quiz.length - 1 ? "看結果" : "下一題";
  $("#quizScore").textContent = `完成 ${state.quizResults.length} 題`;
  playAudio(item.wordAudio, $("#quizAudio"));
}

function nextQuiz() {
  if (state.quizIndex < state.quiz.length - 1) {
    state.quizIndex += 1;
    state.quizLevel = 1;
    renderQuiz();
  } else {
    const hard = state.quizResults.filter((result) => result.level === 1).length;
    const guided = state.quizResults.filter((result) => result.level === 2 || result.level === 3).length;
    const revealed = state.quizResults.filter((result) => result.revealed).length;
    $("#quizPanel").innerHTML = `
      <div class="quiz-finish">
        <p class="eyebrow">完成今日拼字練習</p>
        <h2>${state.quiz.length} 個都走完了</h2>
        <div class="quiz-summary">
          <div><strong>${hard}</strong><span>完全靠記憶</span></div>
          <div><strong>${guided}</strong><span>用提示拼出</span></div>
          <div><strong>${revealed}</strong><span>這次先看答案</span></div>
        </div>
        <p>看答案不算失敗，它只是告訴我們明天要再見一次。</p>
        <button class="primary-button full" id="restartQuiz">再練一次這 5 個</button>
      </div>`;
    $("#restartQuiz").addEventListener("click", startQuiz);
  }
}

function renderShadow() {
  const item = state.words[state.shadowIndex];
  $("#shadowImage").src = assetUrl(item.image);
  $("#shadowImage").alt = item.chinese;
  $("#shadowCategory").textContent = item.customer ? "客戶對話" : labels[item.category];
  $("#shadowSentence").textContent = item.sentence;
  $("#shadowTranslation").textContent = item.translation;
  $("#countdown").textContent = "準備好了就按播放";
}

function changeShadow(direction) {
  state.shadowIndex = (state.shadowIndex + direction + state.words.length) % state.words.length;
  renderShadow();
}

function playShadow() {
  const item = state.words[state.shadowIndex];
  const button = $("#shadowPlay");
  $("#countdown").textContent = "先仔細聽…";
  playAudio(item.sentenceAudio, button, () => {
    let count = 3;
    $("#countdown").textContent = `${count}`;
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) $("#countdown").textContent = `${count}`;
      else {
        clearInterval(timer);
        $("#countdown").textContent = "換你說 🎙";
        setTimeout(() => { $("#countdown").textContent = "很好，再說一次也可以"; }, 3500);
      }
    }, 1000);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function registerPwa() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
  let installPrompt;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    $("#installButton").hidden = false;
  });
  $("#installButton").addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      $("#installButton").hidden = true;
    } else {
      showToast("iPhone：分享 → 加入主畫面");
    }
  });
}

init();
