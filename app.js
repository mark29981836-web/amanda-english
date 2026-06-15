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
  practiceItem: null,
  audio: null,
  micStream: null,
  recorder: null,
  recordingChunks: [],
  recordingUrl: null,
  recognition: null,
  recognitionText: "",
  recordingTimer: null,
  recognitionTimer: null,
  shadowSession: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const labels = { hair: "髮廊英文", life: "生活英文" };
const assetUrl = (path) => window.AMANDA_ASSETS?.[path] || path;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

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
  $("#practiceListen").addEventListener("click", playPracticeExample);
  $("#practiceRecord").addEventListener("click", startPracticeRecording);
  $("#practiceStop").addEventListener("click", stopPracticeRecording);
  $("#recognizeButton").addEventListener("click", startSeparateRecognition);
  $("#practiceClose").addEventListener("click", closePractice);
  $("#practiceBackdrop").addEventListener("click", closePractice);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#practiceModal").hidden) closePractice();
  });
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
    fragment.querySelector(".shadow-button").addEventListener("click", () => openPractice(item));
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

function openPractice(item) {
  resetPracticeRecording();
  state.practiceItem = item;
  $("#practiceTitle").textContent = item.sentence;
  $("#practiceTranslation").textContent = item.translation;
  $("#practiceModal").hidden = false;
  document.body.classList.add("modal-open");
}

function closePractice() {
  resetPracticeRecording();
  state.practiceItem = null;
  $("#practiceModal").hidden = true;
  document.body.classList.remove("modal-open");
}

function playPracticeExample() {
  if (!state.practiceItem) return;
  playAudio(state.practiceItem.sentenceAudio, $("#practiceListen"));
}

async function startPracticeRecording() {
  const item = state.practiceItem;
  if (!item) return;
  resetPracticeRecording();

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $("#speechStatus").textContent = "這個瀏覽器不支援錄音，仍可使用「先聽示範」。";
    return;
  }

  $("#practiceRecord").disabled = true;
  $("#speechStatus").textContent = "請允許麥克風，取得權限後會立即開始錄音。";
  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (error) {
    $("#practiceRecord").disabled = false;
    $("#speechStatus").textContent = "沒有取得麥克風權限，請允許後再試一次。";
    showToast("需要允許麥克風，才能錄下你的發音");
    return;
  }

  startRecording(item);
}

function startRecording(item) {
  const session = state.shadowSession;
  state.recordingChunks = [];
  state.recognitionText = "";
  const options = (isIOS
    ? ["audio/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"])
    .find((type) => MediaRecorder.isTypeSupported(type));
  state.recorder = options
    ? new MediaRecorder(state.micStream, { mimeType: options })
    : new MediaRecorder(state.micStream);
  state.recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) state.recordingChunks.push(event.data);
  });
  state.recorder.addEventListener("stop", () => {
    setTimeout(() => finishShadowRecording(item, session), 650);
  }, { once: true });

  // iOS WebKit may let recognition and MediaRecorder compete for the microphone.
  // Prioritize a usable recording there; other supported browsers keep text feedback.
  const Recognition = isIOS ? null : (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (Recognition) {
    state.recognition = new Recognition();
    state.recognition.lang = "en-US";
    state.recognition.continuous = false;
    state.recognition.interimResults = false;
    state.recognition.maxAlternatives = 5;
    state.recognition.addEventListener("result", (event) => {
      const alternatives = [...event.results[0]].map((result) => result.transcript);
      state.recognitionText = pickClosestTranscript(item.sentence, alternatives);
    });
    state.recognition.addEventListener("error", () => {
      state.recognitionText = "";
    });
    try {
      state.recognition.start();
    } catch (error) {
      state.recognition = null;
    }
  }

  if (isIOS) state.recorder.start();
  else state.recorder.start(250);
  $("#speechStatus").textContent = "正在錄音，請直接說出上面的英文句子。";
  $("#recognizedText").textContent = isIOS ? "錄音完成後可以直接播放檢查。" : "正在聽你說…";
  $("#practiceRecord").hidden = true;
  $("#practiceStop").hidden = false;
  state.recordingTimer = setTimeout(stopPracticeRecording, 12_000);
}

function stopPracticeRecording() {
  clearTimeout(state.recordingTimer);
  state.recordingTimer = null;
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (error) {
      // Recognition may already have stopped after receiving a result.
    }
  }
  if (state.recorder?.state === "recording") {
    $("#speechStatus").textContent = "正在整理你的跟讀結果…";
    if (isIOS) {
      state.recorder.stop();
      return;
    }
    try {
      state.recorder.requestData();
    } catch (error) {
      // Some browsers flush data only when stop() is called.
    }
    setTimeout(() => {
      if (state.recorder?.state === "recording") state.recorder.stop();
    }, 120);
  }
}

function finishShadowRecording(item, session) {
  if (session !== state.shadowSession) return;
  const recordedType = state.recordingChunks.find((chunk) => chunk.type)?.type
    || state.recorder?.mimeType
    || (isIOS ? "audio/mp4" : "audio/webm");
  const blob = new Blob(state.recordingChunks, {
    type: recordedType,
  });
  if (blob.size < 1000) {
    stopMicrophone();
    $("#practiceRecord").hidden = false;
    $("#practiceRecord").disabled = false;
    $("#practiceStop").hidden = true;
    $("#speechScore").textContent = "這次沒有錄到聲音";
    $("#recognizedText").textContent = "請確認沒有其他 App 正在使用麥克風，再按一次「開始跟讀」。";
    $("#speechStatus").textContent = "錄音資料太小，沒有建立可播放的聲音。";
    return;
  }
  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
  state.recordingUrl = URL.createObjectURL(blob);
  const playback = $("#recordingPlayback");
  playback.src = state.recordingUrl;
  playback.load();
  playback.hidden = false;
  stopMicrophone();

  $("#practiceRecord").hidden = false;
  $("#practiceRecord").disabled = false;
  $("#practiceStop").hidden = true;

  if (isIOS) {
    $("#speechScore").textContent = "錄音完成";
    $("#recognizedText").textContent = "先播放確認錄音；要看英文文字，請再按一次「辨識我念的英文」。";
    $("#wordFeedback").innerHTML = "";
    $("#speechStatus").textContent = "錄音完成。文字辨識改為第二步，避免和錄音搶用麥克風。";
    $("#recognizeButton").hidden = false;
  } else if (state.recognitionText) {
    renderSpeechComparison(item.sentence, state.recognitionText);
    $("#speechStatus").textContent = "分析完成。可以播放自己的錄音，或再錄一次。";
  } else {
    $("#speechScore").textContent = "錄音完成";
    $("#recognizedText").textContent = "這次手機沒有成功辨識文字，請重聽錄音後再試一次。";
    $("#wordFeedback").innerHTML = "";
    $("#speechStatus").textContent = "錄音已完成，可以在下方播放。";
  }
}

function startSeparateRecognition() {
  const item = state.practiceItem;
  if (!item) return;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("#speechStatus").textContent = "這個手機瀏覽器沒有提供網頁語音辨識。錄音重聽仍可正常使用。";
    $("#recognizedText").textContent = "目前無法在這個瀏覽器將聲音轉成英文文字。";
    $("#recognizeButton").hidden = true;
    return;
  }

  clearTimeout(state.recognitionTimer);
  if (state.recognition) {
    try {
      state.recognition.abort();
    } catch (error) {
      // Recognition may already be inactive.
    }
  }

  const recognition = new Recognition();
  state.recognition = recognition;
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 5;

  $("#recognizeButton").disabled = true;
  $("#recognizeButton").classList.add("listening");
  $("#speechScore").textContent = "";
  $("#recognizedText").textContent = "正在聽你說…";
  $("#wordFeedback").innerHTML = "";
  $("#speechStatus").textContent = "請現在再念一次上面的英文句子。念完後稍等一下，系統會自動顯示結果。";

  recognition.addEventListener("result", (event) => {
    const result = event.results[event.results.length - 1];
    const alternatives = [...result].map((entry) => entry.transcript);
    const transcript = pickClosestTranscript(item.sentence, alternatives);
    $("#recognizedText").textContent = transcript || "正在辨識…";
    if (result.isFinal && transcript) {
      state.recognitionText = transcript;
      renderSpeechComparison(item.sentence, transcript);
      $("#speechStatus").textContent = "文字辨識完成。綠色是吻合的字，紅色是需要再試一次的字。";
    }
  });
  recognition.addEventListener("nomatch", () => {
    $("#recognizedText").textContent = "沒有辨識到清楚的英文，請靠近手機再試一次。";
  });
  recognition.addEventListener("error", (event) => {
    const messages = {
      "not-allowed": "語音辨識沒有取得麥克風權限。",
      "audio-capture": "手機沒有收到麥克風聲音。",
      network: "語音辨識需要網路，這次連線沒有成功。",
      "no-speech": "沒有聽到清楚的說話聲音。",
      aborted: "這次辨識已停止。",
    };
    $("#speechStatus").textContent = messages[event.error] || `語音辨識暫時失敗（${event.error}）。`;
    if (!state.recognitionText) $("#recognizedText").textContent = "請按按鈕再念一次。";
  });
  recognition.addEventListener("end", () => {
    clearTimeout(state.recognitionTimer);
    state.recognitionTimer = null;
    $("#recognizeButton").disabled = false;
    $("#recognizeButton").classList.remove("listening");
    if ($("#recognizedText").textContent === "正在聽你說…") {
      $("#recognizedText").textContent = "沒有收到辨識結果，請再試一次。";
    }
  });

  try {
    recognition.start();
    state.recognitionTimer = setTimeout(() => {
      try {
        recognition.stop();
      } catch (error) {
        // Recognition may already have stopped automatically.
      }
    }, 10_000);
  } catch (error) {
    $("#recognizeButton").disabled = false;
    $("#recognizeButton").classList.remove("listening");
    $("#speechStatus").textContent = "手機目前無法啟動文字辨識，請稍後再試。";
  }
}

function resetPracticeRecording() {
  state.shadowSession += 1;
  clearTimeout(state.recordingTimer);
  state.recordingTimer = null;
  clearTimeout(state.recognitionTimer);
  state.recognitionTimer = null;
  if (state.recorder?.state === "recording") state.recorder.stop();
  if (state.recognition) {
    try {
      state.recognition.abort();
    } catch (error) {
      // Recognition may already be inactive.
    }
  }
  stopMicrophone();
  if (state.recordingUrl) URL.revokeObjectURL(state.recordingUrl);
  state.recordingUrl = null;
  state.recorder = null;
  state.recognition = null;
  state.recordingChunks = [];
  state.recognitionText = "";
  $("#practiceRecord").hidden = false;
  $("#practiceRecord").disabled = false;
  $("#practiceStop").hidden = true;
  $("#speechStatus").textContent = "按「開始跟讀」後會立即錄音，不用等待。";
  $("#speechScore").textContent = "";
  $("#recognizedText").textContent = "尚未錄音";
  $("#wordFeedback").innerHTML = "";
  $("#recordingPlayback").hidden = true;
  $("#recordingPlayback").removeAttribute("src");
  $("#recognizeButton").hidden = true;
  $("#recognizeButton").disabled = false;
  $("#recognizeButton").classList.remove("listening");
}

function stopMicrophone() {
  state.micStream?.getTracks().forEach((track) => track.stop());
  state.micStream = null;
}

function speechWords(text) {
  return text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || [];
}

function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[left.length][right.length];
}

function pickClosestTranscript(expected, alternatives) {
  const target = speechWords(expected);
  return alternatives.reduce((best, transcript) => {
    const distance = editDistance(target, speechWords(transcript));
    return !best || distance < best.distance ? { transcript, distance } : best;
  }, null)?.transcript || "";
}

function alignSpeech(expected, heard) {
  const target = speechWords(expected);
  const actual = speechWords(heard);
  const rows = Array.from({ length: target.length + 1 }, () => Array(actual.length + 1).fill(0));
  for (let i = 0; i <= target.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= actual.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= target.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (target[i - 1] === actual[j - 1] ? 0 : 1),
      );
    }
  }

  const aligned = [];
  let i = target.length;
  let j = actual.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && target[i - 1] === actual[j - 1]) {
      aligned.unshift({ word: target[i - 1], status: "correct" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && rows[i][j] === rows[i - 1][j - 1] + 1) {
      aligned.unshift({ word: target[i - 1], heard: actual[j - 1], status: "different" });
      i -= 1;
      j -= 1;
    } else if (i > 0 && rows[i][j] === rows[i - 1][j] + 1) {
      aligned.unshift({ word: target[i - 1], status: "missing" });
      i -= 1;
    } else {
      aligned.unshift({ word: actual[j - 1], status: "extra" });
      j -= 1;
    }
  }
  return aligned;
}

function renderSpeechComparison(expected, heard) {
  const aligned = alignSpeech(expected, heard);
  const targetCount = speechWords(expected).length || 1;
  const correctCount = aligned.filter((word) => word.status === "correct").length;
  const score = Math.round((correctCount / targetCount) * 100);
  $("#speechScore").textContent = score >= 90
    ? `${score}%・句子很清楚`
    : score >= 65
      ? `${score}%・再練一次會更穩`
      : `${score}%・先慢慢說清楚每個字`;
  $("#recognizedText").textContent = heard;
  const feedback = $("#wordFeedback");
  feedback.innerHTML = "";
  aligned.forEach((entry) => {
    const word = document.createElement("span");
    word.className = `speech-word ${entry.status}`;
    word.textContent = entry.word;
    if (entry.status === "different") word.title = `手機聽成 ${entry.heard}`;
    feedback.appendChild(word);
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
