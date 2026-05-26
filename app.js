const STORAGE_KEY = "tier-sense-state-v1";
const ALL_RANKS = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F", "G"];
const INITIAL_RANKS = ["S", "A", "B", "C", "D"];
const AUTO_SETUPS = [
  { topic: "強そうな動物", startWord: "オオカミ", initialRank: "B" },
  { topic: "好きな食べ物", startWord: "カレー", initialRank: "A" },
  { topic: "モテそうな職業", startWord: "美容師", initialRank: "B" },
  { topic: "学校にありそうなもの", startWord: "黒板", initialRank: "B" },
  { topic: "旅行先として行きたい場所", startWord: "京都", initialRank: "A" }
];
const PHASE_LABELS = {
  setup: "ルール設定",
  secret: "秘密ランク",
  answer: "回答",
  discussion: "相談",
  judgement: "判定",
  result: "結果",
  clear: "クリア"
};

setTopExclusionHeight();
window.addEventListener("resize", setTopExclusionHeight);
window.addEventListener("orientationchange", setTopExclusionHeight);

let state = createInitialState();
let applyingRemoteState = false;

const els = {
  help: document.querySelector("#helpButton"),
  headerPhase: document.querySelector("#headerPhaseDisplay"),
  streak: document.querySelector("#streakValue"),
  goal: document.querySelector("#goalValue"),
  round: document.querySelector("#roundValue"),
  topic: document.querySelector("#topicDisplay"),
  phase: document.querySelector("#phaseDisplay"),
  board: document.querySelector("#tierBoard"),
  panelTitle: document.querySelector("#panelTitle"),
  panelBody: document.querySelector("#panelBody"),
  setupTemplate: document.querySelector("#setupTemplate"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput")
};

els.help.addEventListener("click", showHowToPlay);
if (els.chatForm) {
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitChat();
  });
}
render();

function createInitialState() {
  const auto = pick(AUTO_SETUPS);
  return {
    topic: auto.topic,
    topicMode: "auto",
    startWord: auto.startWord,
    initialRank: auto.initialRank,
    goalStreak: 5,
    hintCount: 3,
    remainingHints: 3,
    topicSetterName: "",
    answererName: "",
    answererNames: [],
    answererIndex: 0,
    streak: 0,
    round: 1,
    currentSecretRank: "",
    currentAnswer: "",
    currentAnswers: [],
    chatMessages: [],
    judgedRank: "",
    selectedRank: "",
    eliminatedRanks: [],
    secretVisible: false,
    unlockedRanks: [...INITIAL_RANKS],
    tierTable: Object.fromEntries(INITIAL_RANKS.map((rank) => [rank, []])),
    phase: "setup",
    lastResult: null
  };
}

function setTopExclusionHeight() {
  const screenHeight = window.innerHeight;
  const topExclusionHeight = screenHeight >= 812 ? 98 : 74;
  document.documentElement.style.setProperty("--top-exclusion-height", `${topExclusionHeight}px`);
}

function render() {
  document.body.dataset.phase = state.phase;
  document.body.dataset.role = window.TierOnline && window.TierOnline.online ? (window.TierOnline.host ? "host" : "guest") : "none";
  els.streak.textContent = state.streak;
  els.goal.textContent = state.goalStreak;
  els.round.textContent = state.round;
  els.topic.textContent = state.topic || "未設定";
  els.headerPhase.textContent = PHASE_LABELS[state.phase];
  els.phase.textContent = PHASE_LABELS[state.phase];
  els.panelTitle.textContent = PHASE_LABELS[state.phase];

  renderBoard();
  renderPanel();
  renderChat();
  if (window.TierOnline && window.TierOnline.bindControls) {
    window.TierOnline.bindControls();
  }
}

function renderBoard() {
  els.board.innerHTML = "";

  for (const rank of state.unlockedRanks) {
    const row = document.createElement("div");
    row.className = "tier-row";
    const canSelectRank = state.phase === "judgement" && canCurrentPlayerJudge() && !state.eliminatedRanks.includes(rank);
    row.classList.toggle("selectable", canSelectRank);
    row.classList.toggle("selected", state.selectedRank === rank);
    if (canSelectRank) {
      row.addEventListener("click", () => {
        state.selectedRank = rank;
        render();
      });
    }

    const rankCell = document.createElement("div");
    rankCell.className = `rank-cell rank-${rank}`;
    rankCell.textContent = rank;

    const wordCell = document.createElement("div");
    wordCell.className = "word-cell";

    const words = state.tierTable[rank] || [];
    if (words.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empty-note";
      empty.textContent = "まだ空";
      wordCell.append(empty);
    } else {
      for (const word of words) {
        const chip = document.createElement("span");
        chip.className = "word-chip";
        chip.textContent = typeof word === "string" ? word : word.word;
        wordCell.append(chip);
      }
    }

    row.append(rankCell, wordCell);
    els.board.append(row);
  }
}

function renderPanel() {
  els.panelBody.innerHTML = "";

  if (state.phase === "setup") {
    const fragment = els.setupTemplate.content.cloneNode(true);
    const form = fragment.querySelector("#setupForm");
    fragment.querySelector("#topicInput").value = state.topic || "";
    fragment.querySelector("#startWordInput").value = state.startWord || "";
    fragment.querySelector("#initialRankInput").value = state.initialRank || "B";
    fragment.querySelector("#goalInput").value = state.goalStreak;
    fragment.querySelector("#hintCountInput").value = state.hintCount;
    fragment.querySelector(`[name="topicMode"][value="${state.topicMode || "auto"}"]`).checked = true;
    fragment.querySelector("#loadButton").disabled = !localStorage.getItem(STORAGE_KEY);
    applySetupRoleUi(fragment);
    bindSetupFormBehavior(fragment);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      startGame(readSetupForm(form));
    });

    fragment.querySelector("#loadButton").addEventListener("click", loadGame);
    els.panelBody.append(fragment);
    return;
  }

  if (state.phase === "secret") {
    const canView = canCurrentPlayerViewSecret();
    const children = [
      playBar(
        canView ? "あなたは回答者です。秘密ランクを確認してください。" : `${state.topicSetterName || state.answererName || "お題担当"}さん以外が秘密ランクを確認しています...`,
        [
          button(state.secretVisible ? "隠す" : "秘密を見る", () => {
            state.secretVisible = !state.secretVisible;
            render();
          }, "primary", "button", !canView),
          button("入力へ", () => {
            if (sendRemoteAction("goAnswer")) return;
            state.secretVisible = false;
            state.phase = "answer";
            saveGame();
            render();
          }, "", "button", !canView)
        ]
      )
    ];
    if (canView && state.secretVisible) {
      children.push(createModal("秘密ランク", [createSecretBox(true)], [
        button("隠す", () => {
          state.secretVisible = false;
          render();
        }, "primary")
      ]));
    }
    els.panelBody.append(createStack(children));
    return;
  }

  if (state.phase === "answer") {
    const canAnswer = canCurrentPlayerViewSecret();
    const children = [
      playBar(
        canAnswer ? `${state.currentSecretRank}に合う単語を考えてください。` : `${state.topicSetterName || state.answererName || "お題担当"}さん以外が回答を考えています...`,
        []
      )
    ];
    if (canAnswer) {
      const alreadyAnswered = hasCurrentPlayerAnswered();
      const form = document.createElement("form");
      form.className = "stack";
      form.innerHTML = `
        <label>
          <span>回答単語</span>
          <input id="answerInput" maxlength="20" placeholder="例: ワニ" required ${alreadyAnswered ? "disabled" : ""} />
        </label>
      `;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const answer = form.querySelector("#answerInput").value.trim();
        if (!answer) return;
        if (sendRemoteAction("submitAnswer", { answer, playerName: getCurrentPlayerName() })) return;
        submitAnswer(answer, getCurrentPlayerName());
        saveGame();
        render();
      });
      children.push(createModal(alreadyAnswered ? "提出済み" : "単語入力", [metaBox("狙うランク", state.currentSecretRank), answersBox(), form], [
        button("戻る", () => {
          state.phase = "secret";
          render();
        }, "ghost", "button", alreadyAnswered),
        button(alreadyAnswered ? "待機" : "OK", () => form.requestSubmit(), "primary", "button", alreadyAnswered)
      ]));
    }
    els.panelBody.append(createStack(children));
    return;
  }

  if (state.phase === "discussion") {
    els.panelBody.append(
      playBar(
        `${answerSummary()} のランクを相談中...`,
        [
          button("ヒント", useHint, "ghost", "button", !canUseHint()),
          button("回答する", () => {
            if (sendRemoteAction("goJudgement")) return;
            state.phase = "judgement";
            saveGame();
            render();
          }, "primary", "button", !canCurrentPlayerJudge())
        ],
        [`ヒント ${state.remainingHints}/${state.hintCount}`, `ワード数 ${countWords()} / 50`]
      )
    );
    return;
  }

  if (state.phase === "judgement") {
    const children = [
      playBar(
        state.selectedRank ? `${state.selectedRank}に決定しますか？` : "回答者がランクを選択中...",
        [
          button("決定", () => judge(state.selectedRank), "primary", "button", !state.selectedRank || !canCurrentPlayerJudge()),
          button("戻る", () => {
            state.phase = "discussion";
            render();
          }, "ghost", "button", !canCurrentPlayerJudge())
        ],
        [`ヒント ${state.remainingHints}/${state.hintCount}`, `ワード数 ${countWords()} / 50`]
      )
    ];
    if (canCurrentPlayerJudge()) {
      children.push(createModal("回答入力", [answersBox(), createRankPicker()], [
        button("キャンセル", () => {
          state.phase = "discussion";
          render();
        }, "ghost"),
        button("OK", () => judge(state.selectedRank), "primary", "button", !state.selectedRank)
      ]));
    }
    els.panelBody.append(createStack(children));
    return;
  }

  if (state.phase === "result") {
    const result = state.lastResult;
    els.panelBody.append(
      createStack([
        playBar("次の行動を決めてください。", [
          button("次へ", nextRound, "primary"),
          button("リセット", resetGame, "danger")
        ], [`ワード数 ${countWords()} / 50`]),
        createModal("回答結果", [resultPanel(result)], [
          button("次へ", nextRound, "primary")
        ])
      ])
    );
    return;
  }

  if (state.phase === "clear") {
    els.panelBody.append(
      createStack([
        playBar("クリアしました。", [
          button("まだ続ける", restartKeepingBoard, "primary"),
          button("設定へ", resetGame, "danger")
        ], [`ワード数 ${countWords()} / 50`]),
        createModal("WIN!", [resultMessage("clear", `${state.goalStreak}連続正解に到達しました。`)], [
          button("まだ続ける", restartKeepingBoard, "primary"),
          button("設定へ", resetGame, "danger")
        ])
      ])
    );
  }
}

function startGame(settings) {
  if (!canStartGame()) {
    render();
    return;
  }
  const resolved = resolveSetup(settings);
  if (sendRemoteAction("startGame", resolved)) return;
  state = createInitialState();
  state.topic = resolved.topic;
  state.topicMode = resolved.topicMode;
  state.startWord = resolved.startWord;
  state.initialRank = resolved.initialRank;
  state.goalStreak = resolved.goalStreak;
  state.hintCount = resolved.hintCount;
  state.remainingHints = resolved.hintCount;
  state.topicSetterName = pickInitialTopicSetter();
  state.answererName = state.topicSetterName;
  state.answererNames = getAnswererNamesForTopicSetter(state.topicSetterName);
  addWord(state.initialRank, state.startWord, 0);
  prepareRound();
  saveGame();
  render();
}

function prepareRound() {
  state.currentSecretRank = pick(state.unlockedRanks);
  state.currentAnswer = "";
  state.currentAnswers = [];
  state.answererNames = getAnswererNamesForTopicSetter(state.topicSetterName || state.answererName);
  state.judgedRank = "";
  state.selectedRank = "";
  state.eliminatedRanks = [];
  state.secretVisible = false;
  state.lastResult = null;
  state.phase = "secret";
}

function useHint() {
  if (sendRemoteAction("useHint")) return;
  if (!canUseHint()) return;

  const candidates = state.unlockedRanks.filter(
    (rank) => rank !== state.currentSecretRank && !state.eliminatedRanks.includes(rank)
  );
  for (let i = 0; i < 2; i += 1) {
    const next = pick(candidates.filter((rank) => !state.eliminatedRanks.includes(rank)));
    if (next) state.eliminatedRanks.push(next);
  }
  state.remainingHints = Math.max(0, state.remainingHints - 1);
  saveGame();
  render();
}

function judge(rank) {
  if (!rank || state.eliminatedRanks.includes(rank)) return;
  if (sendRemoteAction("judge", { rank })) return;
  const success = rank === state.currentSecretRank;
  state.judgedRank = rank;
  state.streak = success ? state.streak + 1 : 0;
  const answers = getCurrentAnswers();
  answers.forEach((answer) => addWord(rank, answer.word, state.round));
  const unlockedRanks = unlockOuterRanks(rank);
  state.lastResult = {
    success,
    answer: answers.map((answer) => answer.word).join(" / "),
    answers,
    secretRank: state.currentSecretRank,
    judgedRank: rank,
    unlockedRanks
  };
  state.phase = state.streak >= state.goalStreak ? "clear" : "result";
  saveGame();
  render();
}

function addWord(rank, word, turn = state.round) {
  if (!state.tierTable[rank]) state.tierTable[rank] = [];
  state.tierTable[rank].push({ word, rank, turn });
}

function unlockOuterRanks(rank) {
  const unlocked = [];
  const currentIndexes = state.unlockedRanks.map((item) => ALL_RANKS.indexOf(item));
  const min = Math.min(...currentIndexes);
  const max = Math.max(...currentIndexes);
  const index = ALL_RANKS.indexOf(rank);

  if (index === min && min > 0) unlocked.push(unlockRank(ALL_RANKS[min - 1]));
  if (index === max && max < ALL_RANKS.length - 1) unlocked.push(unlockRank(ALL_RANKS[max + 1]));

  state.unlockedRanks.sort((a, b) => ALL_RANKS.indexOf(a) - ALL_RANKS.indexOf(b));
  return unlocked.filter(Boolean);
}

function unlockRank(rank) {
  if (!state.unlockedRanks.includes(rank)) {
    state.unlockedRanks.push(rank);
    if (!state.tierTable[rank]) state.tierTable[rank] = [];
    return rank;
  }
  if (!state.tierTable[rank]) state.tierTable[rank] = [];
  return "";
}

function nextRound() {
  if (sendRemoteAction("nextRound")) return;
  state.round += 1;
  rotateTopicSetter();
  prepareRound();
  saveGame();
  render();
}

function restartKeepingBoard() {
  if (sendRemoteAction("restartKeepingBoard")) return;
  state.streak = 0;
  state.round += 1;
  rotateTopicSetter();
  prepareRound();
  saveGame();
  render();
}

function resetGame() {
  if (sendRemoteAction("resetGame")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  render();
  if (!applyingRemoteState && window.TierOnline && window.TierOnline.isHost()) {
    window.TierOnline.broadcastState(exportOnlineState());
  }
}

function resolveSetup(settings = {}) {
  const topicMode = settings.topicMode === "manual" ? "manual" : "auto";
  const auto = pick(AUTO_SETUPS);
  const topic = String(settings.topic || (topicMode === "auto" ? auto.topic : "")).trim();
  const startWord = String(settings.startWord || (topicMode === "auto" ? auto.startWord : "")).trim();
  const initialRank = settings.initialRank || (topicMode === "auto" ? auto.initialRank : "B");
  return {
    topicMode,
    topic: topic || "強そうな動物",
    startWord: (startWord || "オオカミ").slice(0, 20),
    initialRank: ["A", "B", "C"].includes(initialRank) ? initialRank : "B",
    goalStreak: clamp(Number(settings.goalStreak) || 5, 1, 20),
    hintCount: clamp(Number(settings.hintCount) || 0, 0, 20),
    topicSetterName: "",
    answererName: ""
  };
}

function getParticipantNames() {
  const online = window.TierOnline;
  const names = online && Array.isArray(online.participants)
    ? online.participants.map((player) => player.name).filter(Boolean)
    : [];
  const selfName = window.TierGame ? window.TierGame.getPlayerName() : "";
  if (selfName && !names.includes(selfName)) names.unshift(selfName);
  return names.length ? names : ["Player"];
}

function getTopicSetterCandidateNames() {
  const names = getParticipantNames();
  return names;
}

function getAnswererNamesForTopicSetter(topicSetterName) {
  const names = getParticipantNames();
  if (names.length <= 1) return names;
  const answers = names.filter((name) => normalizeName(name) !== normalizeName(topicSetterName));
  return answers.length ? answers : names;
}

function getActiveAnswererNames() {
  return Array.isArray(state.answererNames) && state.answererNames.length
    ? state.answererNames
    : getAnswererNamesForTopicSetter(state.topicSetterName || state.answererName);
}

function pickInitialTopicSetter() {
  const online = window.TierOnline;
  const hostName = online && online.online
    ? online.localPlayerName
    : getCurrentPlayerName();
  const names = getTopicSetterCandidateNames();
  const matched = names.find((name) => normalizeName(name) === normalizeName(hostName));
  state.answererIndex = Math.max(0, names.indexOf(matched || names[0]));
  return matched || names[0];
}

function pickInitialAnswerer(settings) {
  const names = getTopicSetterCandidateNames();
  state.answererIndex = Math.floor(Math.random() * names.length);
  return names[state.answererIndex];
}

function canStartGame() {
  const online = window.TierOnline;
  if (!online || !online.online) return true;
  if (!online.isHost()) return false;
  return getParticipantNames().length >= 2;
}

function startBlockedReason() {
  const online = window.TierOnline;
  if (!online || !online.online) return "";
  if (!online.isHost()) return "ホストの開始待ち";
  if (getParticipantNames().length < 2) return "参加者が2人以上になるまで開始できません";
  return "";
}

function rotateTopicSetter() {
  const names = getTopicSetterCandidateNames();
  if (!names.length) return;
  const currentName = state.topicSetterName || state.answererName;
  const current = names.findIndex((name) => normalizeName(name) === normalizeName(currentName));
  state.answererIndex = current >= 0 ? current + 1 : state.answererIndex + 1;
  state.answererIndex %= names.length;
  state.topicSetterName = names[state.answererIndex];
  state.answererName = state.topicSetterName;
  state.answererNames = getAnswererNamesForTopicSetter(state.topicSetterName);
}

function showHowToPlay() {
  alert("回答者が秘密ランクに合う単語を入力し、全員で相談します。オーナーがランクを選び、秘密ランクと一致すれば連続正解。不一致でも単語はティア表に残り、連続数だけ0に戻ります。");
}

function saveGame() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!applyingRemoteState && window.TierOnline && window.TierOnline.isHost()) {
    window.TierOnline.broadcastState(exportOnlineState());
  }
}

function loadGame() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const loaded = JSON.parse(raw);
    state = normalizeLoadedState(loaded);
    render();
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function normalizeLoadedState(loaded) {
  const next = { ...createInitialState(), ...loaded };
  next.unlockedRanks = (next.unlockedRanks || INITIAL_RANKS).filter((rank) => ALL_RANKS.includes(rank));
  if (next.unlockedRanks.length === 0) next.unlockedRanks = [...INITIAL_RANKS];
  next.tierTable = next.tierTable || {};
  for (const rank of next.unlockedRanks) {
    if (!Array.isArray(next.tierTable[rank])) next.tierTable[rank] = [];
    next.tierTable[rank] = next.tierTable[rank]
      .filter(Boolean)
      .map((entry) => typeof entry === "string" ? { word: entry, rank, turn: 0 } : {
        word: String(entry.word || ""),
        rank: ALL_RANKS.includes(entry.rank) ? entry.rank : rank,
        turn: Math.max(0, Number(entry.turn) || 0)
      })
      .filter((entry) => entry.word);
  }
  next.goalStreak = clamp(Number(next.goalStreak) || 5, 1, 20);
  next.hintCount = clamp(Number(next.hintCount) || 0, 0, 20);
  next.remainingHints = clamp(Number(next.remainingHints ?? next.hintCount) || 0, 0, next.hintCount);
  next.initialRank = ["A", "B", "C"].includes(next.initialRank) ? next.initialRank : "B";
  next.topicMode = next.topicMode === "manual" ? "manual" : "auto";
  next.topicSetterName = String(next.topicSetterName || next.answererName || "");
  next.answererName = String(next.answererName || "");
  next.answererNames = Array.isArray(next.answererNames) ? next.answererNames.map(String).filter(Boolean) : [];
  next.currentAnswers = Array.isArray(next.currentAnswers) ? next.currentAnswers
    .filter(Boolean)
    .map((answer) => ({
      playerName: String(answer.playerName || "Player"),
      word: String(answer.word || "").slice(0, 20)
    }))
    .filter((answer) => answer.word) : [];
  if (!next.currentAnswers.length && next.currentAnswer) {
    next.currentAnswers = [{ playerName: next.answererName || "Player", word: String(next.currentAnswer).slice(0, 20) }];
  }
  next.chatMessages = Array.isArray(next.chatMessages) ? next.chatMessages.slice(-80).map((message, index) => ({
    id: String(message.id || `${Date.now()}-${index}`),
    playerName: String(message.playerName || "Player"),
    text: String(message.text || "").slice(0, 120),
    turn: Math.max(0, Number(message.turn) || 0)
  })).filter((message) => message.text) : [];
  next.answererIndex = Math.max(0, Number(next.answererIndex) || 0);
  next.streak = Math.max(0, Number(next.streak) || 0);
  next.round = Math.max(1, Number(next.round) || 1);
  next.phase = PHASE_LABELS[next.phase] ? next.phase : "setup";
  return next;
}

function createSecretBox(canView) {
  const box = document.createElement("div");
  box.className = "secret-box";
  const rank = document.createElement("div");
  rank.className = canView && state.secretVisible ? "secret-rank" : "secret-rank hidden-secret";
  rank.textContent = canView && state.secretVisible ? state.currentSecretRank : "回答者だけ見られます";
  box.append(rank);
  return box;
}

function getCurrentAnswers() {
  if (Array.isArray(state.currentAnswers) && state.currentAnswers.length) {
    return state.currentAnswers
      .filter((answer) => answer && answer.word)
      .map((answer) => ({
        playerName: String(answer.playerName || "Player"),
        word: String(answer.word || "").slice(0, 20)
      }));
  }
  if (state.currentAnswer) {
    return [{ playerName: state.answererName || "Player", word: state.currentAnswer }];
  }
  return [];
}

function submitAnswer(answer, playerName) {
  const safeWord = String(answer || "").trim().slice(0, 20);
  if (!safeWord) return;
  const safeName = String(playerName || getCurrentPlayerName() || "Player").trim();
  const answers = getCurrentAnswers();
  const existing = answers.findIndex((item) => normalizeName(item.playerName) === normalizeName(safeName));
  const nextAnswer = { playerName: safeName, word: safeWord };
  if (existing >= 0) answers[existing] = nextAnswer;
  else answers.push(nextAnswer);
  state.currentAnswers = answers;
  state.currentAnswer = answers.map((item) => item.word).join(" / ");
  if (allAnswerersSubmitted()) state.phase = "discussion";
}

function hasCurrentPlayerAnswered() {
  const playerName = getCurrentPlayerName();
  return getCurrentAnswers().some((answer) => normalizeName(answer.playerName) === normalizeName(playerName));
}

function allAnswerersSubmitted() {
  const answerers = getActiveAnswererNames();
  const answers = getCurrentAnswers();
  return answerers.length > 0 && answerers.every((name) =>
    answers.some((answer) => normalizeName(answer.playerName) === normalizeName(name))
  );
}

function answerSummary() {
  const answers = getCurrentAnswers();
  if (!answers.length) return "回答";
  return `回答 ${answers.map((answer) => `「${answer.word}」`).join(" / ")}`;
}

function createHintBox() {
  const box = document.createElement("div");
  box.className = "hint-box";
  box.innerHTML = `<strong>ヒント 残り${state.remainingHints}回</strong>`;

  if (state.eliminatedRanks.length === 0) {
    box.append(note("使うと、秘密ランクではない候補を2つ除外します。"));
    return box;
  }

  const list = document.createElement("ul");
  list.className = "hint-list";
  for (const rank of state.eliminatedRanks) {
    const item = document.createElement("li");
    item.textContent = `${rank}ではありません`;
    list.append(item);
  }
  box.append(list);
  return box;
}

function answerBox() {
  const box = document.createElement("div");
  box.className = "result-box";
  box.innerHTML = `回答<span class="answer-word">${escapeHtml(state.currentAnswer)}</span>`;
  return box;
}

function answersBox() {
  const box = document.createElement("div");
  box.className = "answers-box";
  const title = document.createElement("strong");
  const answers = getCurrentAnswers();
  const answerers = getActiveAnswererNames();
  title.textContent = `回答 ${answers.length}/${answerers.length}`;
  box.append(title);
  if (!answers.length) {
    box.append(note("まだ回答がありません。"));
    return box;
  }
  const list = document.createElement("div");
  list.className = "answer-list";
  answers.forEach((answer) => {
    const item = document.createElement("div");
    item.className = "answer-item";
    item.innerHTML = `<span>${escapeHtml(answer.playerName)}</span><strong>${escapeHtml(answer.word)}</strong>`;
    list.append(item);
  });
  box.append(list);
  return box;
}

function playBar(message, buttons = [], meta = []) {
  const box = document.createElement("div");
  box.className = "play-bar";
  const status = document.createElement("div");
  status.className = "play-status";
  status.textContent = message;
  const actions = document.createElement("div");
  actions.className = "play-actions";
  for (const item of buttons) actions.append(item);
  const metaLine = document.createElement("div");
  metaLine.className = "play-meta";
  metaLine.textContent = meta.join(" / ");
  box.append(status, actions, metaLine);
  return box;
}

function createModal(title, children, actions = []) {
  const overlay = document.createElement("div");
  overlay.className = "game-modal-overlay";
  const modal = document.createElement("section");
  modal.className = "game-modal";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "game-modal-body";
  for (const child of children) body.append(child);
  const footer = document.createElement("div");
  footer.className = "game-modal-actions";
  for (const item of actions) footer.append(item);
  modal.append(heading, body, footer);
  overlay.append(modal);
  return overlay;
}

function createRankPicker() {
  const picker = document.createElement("div");
  picker.className = "rank-picker modal-rank-picker";
  for (const rank of state.unlockedRanks) {
    const selected = state.selectedRank === rank ? " selected" : "";
    picker.append(button(rank, () => {
      state.selectedRank = rank;
      render();
    }, `rank-button rank-${rank}${selected}`, "button", state.eliminatedRanks.includes(rank) || !canCurrentPlayerJudge()));
  }
  return picker;
}

function resultPanel(result) {
  const box = document.createElement("div");
  box.className = "result-panel";
  const remaining = Math.max(0, state.goalStreak - state.streak);
  const answerHtml = Array.isArray(result.answers) && result.answers.length
    ? result.answers.map((answer) => `<span class="answer-word small-answer">${escapeHtml(answer.word)}</span>`).join("")
    : `<span class="answer-word">${escapeHtml(result.answer)}</span>`;
  const unlocked = result.unlockedRanks && result.unlockedRanks.length
    ? `<p class="unlock-note">新ランク ${result.unlockedRanks.join(" / ")} が解放されました。</p>`
    : "";
  box.innerHTML = `
    <div class="result-stamp ${result.success ? "success" : "failure"}">${result.success ? "正解" : "不正解"}</div>
    <div>${answerHtml}</div>
    <p>正解ランク <strong>${result.secretRank}</strong></p>
    <p>回答ランク <strong>${result.judgedRank}</strong></p>
    <p>クリアまであと <strong>${remaining}</strong> 連続正解</p>
    ${unlocked}
  `;
  return box;
}

function metaBox(label, value) {
  const box = document.createElement("div");
  box.className = "result-box compact-box";
  box.innerHTML = `<p class="label">${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong>`;
  return box;
}

function canUseHint() {
  const candidates = state.unlockedRanks.filter(
    (rank) => rank !== state.currentSecretRank && !state.eliminatedRanks.includes(rank)
  );
  return state.remainingHints > 0 && candidates.length > 0;
}

function countWords() {
  return Object.values(state.tierTable).reduce((sum, words) => sum + (Array.isArray(words) ? words.length : 0), 0);
}

function canCurrentPlayerViewSecret() {
  const playerName = getCurrentPlayerName();
  const answerers = getActiveAnswererNames();
  return Boolean(state.currentSecretRank && answerers.some((name) => normalizeName(name) === normalizeName(playerName)));
}

function canCurrentPlayerJudge() {
  return !window.TierOnline || !window.TierOnline.online || window.TierOnline.isHost();
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function getCurrentPlayerName() {
  return window.TierGame ? window.TierGame.getPlayerName() : "Player";
}

function resultMessage(type, text) {
  const box = document.createElement("div");
  box.className = "result-box";
  const className = type === "clear" ? "success" : "";
  box.innerHTML = `<p class="${className}"><strong>${escapeHtml(text)}</strong></p>`;
  return box;
}

function createStack(children) {
  const stack = document.createElement("div");
  stack.className = "stack";
  for (const child of children) stack.append(child);
  return stack;
}

function createButtonRow(buttons) {
  const row = document.createElement("div");
  row.className = "button-row";
  for (const item of buttons) row.append(item);
  return row;
}

function button(text, onClick, className = "", type = "button", disabled = false) {
  const btn = document.createElement("button");
  btn.type = type;
  btn.textContent = text;
  btn.className = className;
  btn.disabled = disabled;
  if (onClick) btn.addEventListener("click", onClick);
  return btn;
}

function note(text) {
  const p = document.createElement("p");
  p.className = "subtle";
  p.textContent = text;
  return p;
}

function pick(items) {
  if (!items.length) return "";
  return items[Math.floor(Math.random() * items.length)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function sendRemoteAction(type, payload = {}) {
  if (!window.TierOnline || !window.TierOnline.shouldSendAction()) return false;
  window.TierOnline.sendAction({ type, payload });
  return true;
}

function submitChat() {
  if (!els.chatInput) return;
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = "";
  const playerName = getCurrentPlayerName();
  if (sendRemoteAction("chat", { text, playerName })) return;
  appendChat(text, playerName);
  saveGame();
  render();
}

function appendChat(text, playerName) {
  const safeText = String(text || "").trim().slice(0, 120);
  if (!safeText) return;
  if (!Array.isArray(state.chatMessages)) state.chatMessages = [];
  state.chatMessages.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    playerName: String(playerName || "Player").slice(0, 12),
    text: safeText,
    turn: state.round
  });
  state.chatMessages = state.chatMessages.slice(-80);
}

function renderChat() {
  if (!els.chatLog) return;
  const messages = Array.isArray(state.chatMessages) ? state.chatMessages.slice(-30) : [];
  els.chatLog.innerHTML = "";
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "まだチャットはありません";
    els.chatLog.append(empty);
    return;
  }
  messages.forEach((message) => {
    const item = document.createElement("div");
    item.className = "chat-message";
    item.innerHTML = `<strong>${escapeHtml(message.playerName || "Player")}</strong><span>${escapeHtml(message.text || "")}</span>`;
    els.chatLog.append(item);
  });
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function exportOnlineState() {
  return exportOnlineStateForPlayer();
}

function exportOnlineStateForPlayer(playerName = "") {
  const next = {
    ...state,
    secretVisible: false
  };
  const canSee =
    state.phase === "result" ||
    state.phase === "clear" ||
    (state.currentSecretRank && getActiveAnswererNames()
      .some((name) => normalizeName(name) === normalizeName(playerName)));
  if (!canSee) next.currentSecretRank = "";
  return next;
}

function importOnlineState(nextState) {
  applyingRemoteState = true;
  state = normalizeLoadedState(nextState);
  applyingRemoteState = false;
  render();
}

function applyRemoteAction(action) {
  if (!action || !action.type) return;
  const payload = action.payload || {};
  switch (action.type) {
    case "startGame":
      startGame(payload);
      break;
    case "goAnswer":
      state.secretVisible = false;
      state.phase = "answer";
      saveGame();
      render();
      break;
    case "submitAnswer":
      if (!payload.answer) return;
      submitAnswer(payload.answer, payload.playerName);
      saveGame();
      render();
      break;
    case "chat":
      appendChat(payload.text, payload.playerName);
      saveGame();
      render();
      break;
    case "goJudgement":
      state.phase = "judgement";
      saveGame();
      render();
      break;
    case "useHint":
      useHint();
      break;
    case "judge":
      if (payload.rank) judge(payload.rank);
      break;
    case "nextRound":
      nextRound();
      break;
    case "restartKeepingBoard":
      restartKeepingBoard();
      break;
    case "resetGame":
      resetGame();
      break;
  }
}

window.TierGame = {
  exportState: exportOnlineState,
  importState: importOnlineState,
  applyRemoteAction,
  getPlayerName() {
    const input = document.querySelector("#username");
    const joinInput = document.querySelector("#usernameJoin");
    return (input && input.value.trim()) ||
      (joinInput && joinInput.value.trim()) ||
      (window.TierOnline && window.TierOnline.localPlayerName) ||
      "Player";
  },
  setPlayerName(name, icon) {
    const safeName = (name || "名無し").slice(0, 12);
    const input = document.querySelector("#username");
    const joinInput = document.querySelector("#usernameJoin");
    const display = document.querySelector("#displayUsername");
    const avatar = document.querySelector("#profileAvatar");
    if (input) input.value = safeName;
    if (joinInput) joinInput.value = safeName;
    if (display) display.textContent = safeName;
    if (avatar) {
      avatar.innerHTML = "";
      if (icon) {
        const img = document.createElement("img");
        img.src = icon;
        img.alt = safeName;
        avatar.append(img);
      } else {
        avatar.textContent = safeName.slice(0, 1) || "名";
      }
    }
  },
  previewSetup(nextSettings) {
    state.topic = nextSettings.topic ?? state.topic;
    state.topicMode = nextSettings.topicMode ?? state.topicMode;
    state.startWord = nextSettings.startWord ?? state.startWord;
    state.initialRank = nextSettings.initialRank ?? state.initialRank;
    state.goalStreak = nextSettings.goalStreak ?? state.goalStreak;
    state.hintCount = nextSettings.hintCount ?? state.hintCount;
    state.remainingHints = nextSettings.hintCount ?? state.remainingHints;
    render();
  },
  exportStateForPlayer: exportOnlineStateForPlayer,
  readSetupForm() {
    return readSetupForm(document);
  },
  refresh() {
    render();
  }
};

function applySetupRoleUi(root) {
  const isConnected = window.TierOnline && window.TierOnline.online;
  const isHost = window.TierOnline && window.TierOnline.host;
  const status = root.querySelector("#hostConfigStatus");
  const startButton = root.querySelector('button[type="submit"]');
  const topicInput = root.querySelector("#topicInput");
  const startWordInput = root.querySelector("#startWordInput");
  const initialRankInput = root.querySelector("#initialRankInput");
  const goalInput = root.querySelector("#goalInput");
  const hintInput = root.querySelector("#hintCountInput");
  const topicModeInputs = [...root.querySelectorAll('[name="topicMode"]')];
  const controls = [
    topicInput,
    startWordInput,
    initialRankInput,
    goalInput,
    hintInput,
    ...topicModeInputs
  ].filter(Boolean);

  if (!isConnected) {
    if (status) status.textContent = "部屋を作成または参加してください。";
    if (startButton) startButton.disabled = true;
    controls.forEach((control) => (control.disabled = true));
    return;
  }

  if (isHost) {
    if (status) status.textContent = "あなたがホストです。ルールを設定してゲームを開始できます。";
    const blockedReason = startBlockedReason();
    if (status && blockedReason) status.textContent = blockedReason;
    if (startButton) startButton.disabled = !canStartGame();
    controls.forEach((control) => (control.disabled = false));
    controls.forEach((control) => {
      if (control.dataset.boundConfigSync) return;
      control.dataset.boundConfigSync = "1";
      control.addEventListener("input", syncSetupConfig);
      control.addEventListener("change", syncSetupConfig);
    });
    setTimeout(syncSetupConfig, 0);
    return;
  }

  if (status) status.textContent = "ホストがルールを設定中です。開始までお待ちください。";
  if (startButton) {
    startButton.disabled = true;
    startButton.textContent = "ホストの開始待ち";
  }
  controls.forEach((control) => (control.disabled = true));
}

function bindSetupFormBehavior(root) {
  const topicInput = root.querySelector("#topicInput");
  const startWordInput = root.querySelector("#startWordInput");
  const initialRankInput = root.querySelector("#initialRankInput");
  const topicModeInputs = [...root.querySelectorAll('[name="topicMode"]')];
  const applyMode = () => {
    const mode = root.querySelector('[name="topicMode"]:checked')?.value || "auto";
    const auto = mode === "auto";
    [topicInput, startWordInput, initialRankInput].filter(Boolean).forEach((control) => {
      control.readOnly = auto && control.tagName !== "SELECT";
      control.classList.toggle("readonly-preview", auto);
    });
  };
  topicModeInputs.forEach((input) => {
    if (input.dataset.boundSetupMode) return;
    input.dataset.boundSetupMode = "1";
    input.addEventListener("change", () => {
      if (input.value === "auto" && input.checked) {
        const auto = pick(AUTO_SETUPS);
        if (topicInput) topicInput.value = auto.topic;
        if (startWordInput) startWordInput.value = auto.startWord;
        if (initialRankInput) initialRankInput.value = auto.initialRank;
      }
      applyMode();
      syncSetupConfig();
    });
  });
  applyMode();
}

function readSetupForm(root = document) {
  const topicInput = root.querySelector("#topicInput");
  const startWordInput = root.querySelector("#startWordInput");
  const initialRankInput = root.querySelector("#initialRankInput");
  const goalInput = root.querySelector("#goalInput");
  const hintInput = root.querySelector("#hintCountInput");
  const checkedTopicMode = root.querySelector('[name="topicMode"]:checked');
  return {
    topicMode: checkedTopicMode ? checkedTopicMode.value : state.topicMode,
    topic: topicInput ? topicInput.value.trim() : state.topic,
    startWord: startWordInput ? startWordInput.value.trim() : state.startWord,
    initialRank: initialRankInput ? initialRankInput.value : state.initialRank,
    goalStreak: goalInput ? Number(goalInput.value) : state.goalStreak,
    hintCount: hintInput ? Number(hintInput.value) : state.hintCount
  };
}

function syncSetupConfig() {
  if (!window.TierOnline || !window.TierOnline.isHost()) return;
  window.TierOnline.broadcastConfig(readSetupForm());
}
