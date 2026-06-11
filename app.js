const STORAGE_KEY = "tier-sense-state-v1";
const CHAT_HEIGHT_KEY = "tier-sense-chat-height";
const CHAT_COLLAPSED_KEY = "tier-sense-chat-collapsed";
const GAME_TITLE = "みんなでTier表ゲーム";
const ALL_RANKS = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F", "G"];
const RANK_THEMES = {
  SSS: { color: "#6f312b", tint: "rgba(111, 49, 43, 0.12)" },
  SS: { color: "#6f312b", tint: "rgba(111, 49, 43, 0.12)" },
  S: { color: "#a34937", tint: "rgba(163, 73, 55, 0.12)" },
  A: { color: "#c7832d", tint: "rgba(199, 131, 45, 0.14)" },
  B: { color: "#2d7a61", tint: "rgba(45, 122, 97, 0.13)" },
  C: { color: "#3b6f9f", tint: "rgba(59, 111, 159, 0.12)" },
  D: { color: "#665f86", tint: "rgba(102, 95, 134, 0.13)" },
  E: { color: "#5e6268", tint: "rgba(94, 98, 104, 0.12)" },
  F: { color: "#5e6268", tint: "rgba(94, 98, 104, 0.12)" },
  G: { color: "#5e6268", tint: "rgba(94, 98, 104, 0.12)" }
};
const INITIAL_RANKS = ["S", "A", "B", "C", "D"];
const AUTO_SETUPS = [
  { topic: "強そうな動物", startWord: "オオカミ", initialRank: "B" },
  { topic: "給食のうれしいメニュー", startWord: "カレー", initialRank: "A" },
  { topic: "モテそうな職業", startWord: "美容師", initialRank: "B" },
  { topic: "贅沢なもの", startWord: "ハーゲンダッツ", initialRank: "B" },
  { topic: "強そうな犬の名前", startWord: "タロウ", initialRank: "C" },
  { topic: "キッザニアにあったらやりたい職業", startWord: "清掃員", initialRank: "C" },
  { topic: "好きな人が弾いていたらキュンとくる楽器", startWord: "ベース", initialRank: "B" },
  { topic: "蛇口をひねって出てきたら嬉しい飲み物", startWord: "コーラ", initialRank: "A" },
  { topic: "かっこいいと思う英単語", startWord: "Happy", initialRank: "C" },
  { topic: "ゾンビに襲われても安心だと思う建物", startWord: "コンビニ", initialRank: "B" },
  { topic: "冷蔵庫に常に入っていてほしい物", startWord: "たまご", initialRank: "B" },
  { topic: "懐かしい学校給食の人気メニュー", startWord: "揚げパン", initialRank: "A" },
  { topic: "必殺技だったら強そうな、仕事で使う用語", startWord: "アジャイル", initialRank: "B" },
  { topic: "蛙化する瞬間", startWord: "食べ方が汚い", initialRank: "A" },
  { topic: "バターとシナジーがあると思うもの", startWord: "食パン", initialRank: "B" }
];
const PHASE_LABELS = {
  setup: "ルール設定",
  gameStart: "ゲーム開始",
  roundIntro: "出題者発表",
  secret: "出題準備",
  answer: "単語入力",
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
let phaseTimer = null;
let scheduledPhaseKey = "";
let lastShownHintNoticeId = "";
let lastShownWordNoticeId = "";

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
  chatPanel: document.querySelector("#chatPanel"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatResizeHandle: document.querySelector("#chatResizeHandle"),
  chatToggleButton: document.querySelector("#chatToggleButton")
};

els.help.addEventListener("click", showHowToPlay);
document.addEventListener("click", (event) => {
  const helpButton = event.target.closest("[data-help-button]");
  if (!helpButton) return;
  showHowToPlay();
});
if (els.chatForm) {
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitChat();
  });
}
initChatResize();
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
    activeAnswererName: "",
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
    hintNotice: null,
    wordNotice: null,
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

function isRoomConnected() {
  return Boolean(window.TierOnline && window.TierOnline.online);
}

function getDisplayPhaseLabel() {
  if (state.phase === "setup" && !isRoomConnected()) return "ロビー";
  return PHASE_LABELS[state.phase] || "ロビー";
}

function getHeaderTitle() {
  if (state.phase === "setup") return GAME_TITLE;
  return getDisplayPhaseLabel();
}

function canDriveGameFlow() {
  return !window.TierOnline || !window.TierOnline.online || window.TierOnline.isHost();
}

function schedulePhaseAdvance() {
  const autoPhases = ["gameStart", "roundIntro"];
  const shouldSchedule = autoPhases.includes(state.phase) && canDriveGameFlow();
  const key = `${state.phase}:${state.round}:${state.topicSetterName}`;
  if (!shouldSchedule) {
    if (phaseTimer) window.clearTimeout(phaseTimer);
    phaseTimer = null;
    scheduledPhaseKey = "";
    return;
  }
  if (phaseTimer && scheduledPhaseKey === key) return;
  if (phaseTimer) window.clearTimeout(phaseTimer);
  scheduledPhaseKey = key;
  const nextPhase = state.phase === "gameStart" ? "roundIntro" : "secret";
  const delay = state.phase === "gameStart" ? 1100 : 1500;
  phaseTimer = window.setTimeout(() => {
    phaseTimer = null;
    scheduledPhaseKey = "";
    if (state.phase !== key.split(":")[0]) return;
    state.phase = nextPhase;
    saveGame();
    render();
  }, delay);
}

function render() {
  document.body.dataset.phase = state.phase;
  document.body.dataset.role = window.TierOnline && window.TierOnline.online ? (window.TierOnline.host ? "host" : "guest") : "none";
  els.streak.textContent = state.streak;
  els.goal.textContent = state.goalStreak;
  els.round.textContent = state.round;
  els.topic.textContent = state.topic || "未設定";
  els.headerPhase.textContent = getHeaderTitle();
  els.phase.textContent = getDisplayPhaseLabel();
  els.panelTitle.textContent = getDisplayPhaseLabel();

  renderBoard();
  renderPanel();
  renderChat();
  schedulePhaseAdvance();
  if (window.TierOnline && window.TierOnline.bindControls) {
    window.TierOnline.bindControls();
  }
  showPendingWordNotice();
  showPendingHintNotice();
}

function renderBoard() {
  els.board.innerHTML = "";

  for (const rank of state.unlockedRanks) {
    const row = document.createElement("div");
    row.className = "tier-row";
    const canSelectRank = state.phase === "judgement" && canCurrentPlayerJudge() && !state.eliminatedRanks.includes(rank);
    row.classList.toggle("selectable", canSelectRank);
    row.classList.toggle("selected", state.selectedRank === rank);
    row.classList.toggle("eliminated", state.eliminatedRanks.includes(rank));
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
    applySetupRoleUi(fragment);
    bindSetupFormBehavior(fragment);
    normalizeSetupOnlineScreens(fragment);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      startGame(readSetupForm(form));
    });

    els.panelBody.append(fragment);
    return;
  }

  if (state.phase === "gameStart") {
    els.panelBody.append(createIntroScreen("ゲーム開始", "最初のラウンドを準備しています"));
    return;
  }

  if (state.phase === "roundIntro") {
    els.panelBody.append(createIntroScreen("今回の出題者は", getRoundTopicSetterName() || "未定"));
    return;
  }

  if (state.phase === "secret") {
    const isSetter = canCurrentPlayerViewSecret();
    const body = isSetter
      ? [createSetterPromptCard()]
      : [createWaitingPanel(`${getRoundTopicSetterName() || "出題者"}が出題を考えています`)];
    els.panelBody.append(createPhaseCard(
      "出題準備",
      isSetter ? "秘密ランクに合う単語を考えます" : "出題者の入力を待っています",
      body,
      [],
      [`ワード数 ${countWords()} / 50`]
    ));
    return;
  }

  if (state.phase === "answer") {
    if (canCurrentPlayerViewSecret()) {
      if (!state.currentSecretRank) {
        els.panelBody.append(createPhaseCard(
          "単語入力",
          "秘密ランクを同期しています",
          [createSetterPromptCard(true)],
          [],
          [`ワード数 ${countWords()} / 50`]
        ));
        return;
      }
      const alreadyAnswered = hasCurrentPlayerAnswered();
      const form = document.createElement("form");
      form.className = "word-input-form";
      form.innerHTML = `
        <div class="target-rank-line">
          <span>狙うランク</span>
          <strong class="target-rank-badge rank-${state.currentSecretRank}">${state.currentSecretRank}</strong>
        </div>
        <input id="answerInput" maxlength="20" placeholder="単語を入力" required ${alreadyAnswered ? "disabled" : ""} />
        <p>単語は20文字以内で入力してください。</p>
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
      const modal = createModal(alreadyAnswered ? "提出済み" : "単語入力", [form], [
        button("戻る", () => {
          state.phase = "secret";
          render();
        }, "ghost", "button", alreadyAnswered),
        button(alreadyAnswered ? "待機" : "OK", () => form.requestSubmit(), "primary", "button", alreadyAnswered)
      ]);
      modal.classList.add("word-input-overlay");
      els.panelBody.append(createStack([
        createPhaseCard("単語入力", "出題者だけが単語を入力できます", [createSetterPromptCard(true)], [], [`ワード数 ${countWords()} / 50`]),
        modal
      ]));
    } else {
      els.panelBody.append(createPhaseCard(
        "単語入力",
        "出題者の入力を待っています",
        [createWaitingPanel(`${getRoundTopicSetterName() || "出題者"}が出題を考えています`)],
        [],
        [`ワード数 ${countWords()} / 50`]
      ));
    }
    return;
  }

  if (state.phase === "discussion") {
    const activeAnswerer = getActiveAnswererName();
    const currentPlayerName = getCurrentPlayerName();
    const isAnswerer = isRoundAnswererName(currentPlayerName);
    const lockedByOther = Boolean(activeAnswerer && normalizeName(activeAnswerer) !== normalizeName(currentPlayerName));
    const answerButtonText = lockedByOther ? `${activeAnswerer}が回答中` : "回答する";
    const discussionBar = playBar(
        activeAnswerer ? `${activeAnswerer}が回答中...` : `${answerSummary()} のランクを相談中...`,
        [
          button("ヒント", showHintConfirmDialog, "ghost", "button", !canUseHint()),
          button(answerButtonText, () => {
            const playerName = getCurrentPlayerName();
            if (sendRemoteAction("beginRankAnswer", { playerName })) return;
            beginRankAnswer(playerName);
          }, "primary", "button", !isAnswerer || lockedByOther)
        ],
        [`回答者 ${getActiveAnswererNames().join(" / ") || "なし"}`, `ヒント ${state.remainingHints}/${state.hintCount}`, `ワード数 ${countWords()} / 50`]
    );
    els.panelBody.append(createPhaseCard(
      "相談",
      `${answerSummary()} のランクをみんなで相談中`,
      [answersBox(), discussionBar]
    ));
    return;
  }

  if (state.phase === "judgement") {
    const activeAnswerer = getActiveAnswererName();
    const judgementBar = playBar(
        canCurrentPlayerJudge()
          ? (state.selectedRank ? `${state.selectedRank}に決定しますか？` : "ランクを選択してください")
          : `${activeAnswerer || "回答者"}が回答中...`,
        [
          button("決定", () => judge(state.selectedRank, getCurrentPlayerName()), "primary", "button", !state.selectedRank || !canCurrentPlayerJudge()),
          button("戻る", () => {
            const playerName = getCurrentPlayerName();
            if (sendRemoteAction("cancelRankAnswer", { playerName })) return;
            cancelRankAnswer(playerName);
          }, "ghost", "button", !canCurrentPlayerJudge())
        ],
        [`ヒント ${state.remainingHints}/${state.hintCount}`, `ワード数 ${countWords()} / 50`]
    );
    const children = [
      createPhaseCard(
        "判定",
        canCurrentPlayerJudge() ? "表からランクを選んで決定します" : "回答者のランク選択を待っています",
        [judgementBar]
      )
    ];
    if (canCurrentPlayerJudge()) {
      children.push(createModal("ランク決定", [answersBox(), createSelectedRankFocus(), createRankPicker()], [
        button("キャンセル", () => {
          const playerName = getCurrentPlayerName();
          if (sendRemoteAction("cancelRankAnswer", { playerName })) return;
          cancelRankAnswer(playerName);
        }, "ghost"),
        button("OK", () => judge(state.selectedRank, getCurrentPlayerName()), "primary", "button", !state.selectedRank)
      ]));
    }
    els.panelBody.append(createStack(children));
    return;
  }

  if (state.phase === "result") {
    const result = state.lastResult;
    els.panelBody.append(
      createModal("回答結果", [resultPanel(result)], [
        button("次へ", nextRound, "primary")
      ])
    );
    return;
  }

  if (state.phase === "clear") {
    els.panelBody.append(
      createModal("CLEAR!", [clearCelebrationPanel()], [
        button("もう一度遊ぶ", resetGame, "primary")
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
  state.answererName = "";
  state.answererNames = getAnswererNamesForTopicSetter(state.topicSetterName);
  addWord(state.initialRank, state.startWord, 0);
  prepareRound({ showGameStart: true });
  saveGame();
  render();
}

function prepareRound(options = {}) {
  state.currentSecretRank = pick(state.unlockedRanks);
  state.currentAnswer = "";
  state.currentAnswers = [];
  state.answererNames = getAnswererNamesForTopicSetter(getRoundTopicSetterName());
  state.activeAnswererName = "";
  state.judgedRank = "";
  state.selectedRank = "";
  state.eliminatedRanks = [];
  state.hintNotice = null;
  state.wordNotice = null;
  state.secretVisible = false;
  state.lastResult = null;
  state.phase = options.showGameStart ? "gameStart" : "roundIntro";
}

function requestHintUse(playerName = getCurrentPlayerName()) {
  if (!canUseHint()) return;
  if (sendRemoteAction("useHint", { playerName })) return;
  useHint(playerName);
}

function useHint(playerName = getCurrentPlayerName()) {
  if (!canUseHint()) return;

  const candidates = state.unlockedRanks.filter(
    (rank) => rank !== state.currentSecretRank && !state.eliminatedRanks.includes(rank)
  );
  const newlyEliminated = [];
  for (let i = 0; i < 2; i += 1) {
    const next = pick(candidates.filter((rank) => !state.eliminatedRanks.includes(rank)));
    if (next) {
      state.eliminatedRanks.push(next);
      newlyEliminated.push(next);
    }
  }
  if (!newlyEliminated.length) return;
  state.remainingHints = Math.max(0, state.remainingHints - 1);
  state.hintNotice = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    playerName: String(playerName || "Player").slice(0, 12),
    ranks: newlyEliminated,
    round: state.round
  };
  saveGame();
  render();
}

function judge(rank, playerName = getCurrentPlayerName()) {
  if (!rank || state.eliminatedRanks.includes(rank)) return;
  if (!canPlayerControlRankAnswer(playerName)) return;
  if (sendRemoteAction("judge", { rank, playerName })) return;
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
  state.activeAnswererName = "";
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

function pickAutoSetup(exclude = {}) {
  const candidates = AUTO_SETUPS.filter((setup) =>
    setup.topic !== exclude.topic ||
    setup.startWord !== exclude.startWord ||
    setup.initialRank !== exclude.initialRank
  );
  return pick(candidates.length ? candidates : AUTO_SETUPS);
}

function getParticipantNames() {
  const online = window.TierOnline;
  if (online && typeof online.getGameParticipantNames === "function") {
    const realtimeNames = uniqueNames(online.getGameParticipantNames());
    if (realtimeNames.length) return realtimeNames;
  }
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

function getRoundTopicSetterName() {
  return String(state.topicSetterName || "").trim();
}

function getAnswererNamesForTopicSetter(topicSetterName) {
  const names = getParticipantNames();
  const setter = normalizeName(topicSetterName);
  return uniqueNames(names).filter((name) => normalizeName(name) && normalizeName(name) !== setter);
}

function getActiveAnswererNames() {
  const setter = getRoundTopicSetterName();
  const stored = Array.isArray(state.answererNames) ? state.answererNames : [];
  const answerers = uniqueNames(stored).filter((name) => normalizeName(name) !== normalizeName(setter));
  return answerers.length ? answerers : getAnswererNamesForTopicSetter(setter);
}

function pickInitialTopicSetter() {
  const names = getTopicSetterCandidateNames();
  state.answererIndex = Math.floor(Math.random() * names.length);
  return names[state.answererIndex] || getCurrentPlayerName();
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
  const currentName = getRoundTopicSetterName();
  const current = names.findIndex((name) => normalizeName(name) === normalizeName(currentName));
  state.answererIndex = current >= 0 ? current + 1 : state.answererIndex + 1;
  state.answererIndex %= names.length;
  state.topicSetterName = names[state.answererIndex];
  state.answererName = "";
  state.answererNames = getAnswererNamesForTopicSetter(state.topicSetterName);
  state.activeAnswererName = "";
}

function showHowToPlay() {
  document.querySelectorAll(".rules-modal-overlay").forEach((node) => node.remove());
  const content = document.createElement("div");
  content.className = "rules-dialog";
  content.innerHTML = `
    <section>
      <h4>目的</h4>
      <p>全員で相談しながら、設定した<strong>連続正解目標</strong>まで正解を積み上げる協力ゲームです。不正解になってもゲームオーバーはなく、連続数だけ0に戻ります。</p>
    </section>
    <section>
      <h4>役割</h4>
      <dl>
        <div><dt>出題者</dt><dd>秘密ランクを見て、そのランクに合う単語を入力する人です。</dd></div>
        <div><dt>回答者</dt><dd>出題者以外の全員です。秘密ランクは見えません。相談後、誰か1人が回答画面を開いてランクを選びます。</dd></div>
        <div><dt>ホスト</dt><dd>ルール設定とゲーム開始を担当します。ゲーム中の回答者とは別の役割です。</dd></div>
      </dl>
    </section>
    <section>
      <h4>ラウンドの流れ</h4>
      <ol>
        <li>今回の出題者が発表されます。</li>
        <li>出題者だけに秘密ランクが表示されます。</li>
        <li>出題者が「そのランクっぽい」単語を入力します。強すぎても弱すぎても伝わりにくいので、ちょうど感が大事です。</li>
        <li>単語が公開されたら、回答者全員でどのランクか相談します。</li>
        <li>回答者の誰か1人が「回答する」を押してランクを選びます。その間、他の回答者の回答ボタンはロックされます。</li>
        <li>秘密ランクと選んだランクが一致したら連続正解、不一致なら連続数が0に戻ります。</li>
      </ol>
    </section>
    <section>
      <h4>Tier表とヒント</h4>
      <p>出た単語は正解・不正解に関係なくTier表に残ります。ラウンドが進むほど、過去の単語との比較で推理しやすくなります。ヒントは秘密ランクではない候補を2つ消します。</p>
    </section>
    <section>
      <h4>クリア条件</h4>
      <p><strong>連続正解目標</strong>に到達したらクリアです。途中で外しても、育ったTier表は次の推理材料になります。</p>
    </section>
  `;
  let dialog = null;
  const close = () => dialog && dialog.remove();
  dialog = createModal("遊び方", [content], [
    button("閉じる", close, "primary")
  ]);
  dialog.classList.add("rules-modal-overlay");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
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
  next.answererName = "";
  next.answererNames = Array.isArray(next.answererNames) ? next.answererNames.map(String).filter(Boolean) : [];
  next.answererNames = uniqueNames(next.answererNames).filter((name) => normalizeName(name) !== normalizeName(next.topicSetterName));
  next.activeAnswererName = String(next.activeAnswererName || "");
  if (next.phase !== "judgement" || (next.activeAnswererName && !isNameInList(next.activeAnswererName, next.answererNames))) {
    next.activeAnswererName = "";
  }
  next.currentAnswers = Array.isArray(next.currentAnswers) ? next.currentAnswers
    .filter(Boolean)
    .map((answer) => ({
      playerName: String(answer.playerName || "Player"),
      word: String(answer.word || "").slice(0, 20)
    }))
    .filter((answer) => answer.word) : [];
  if (!next.currentAnswers.length && next.currentAnswer) {
    next.currentAnswers = [{ playerName: "Player", word: String(next.currentAnswer).slice(0, 20) }];
  }
  next.chatMessages = Array.isArray(next.chatMessages) ? next.chatMessages.slice(-80).map((message, index) => ({
    id: String(message.id || `${Date.now()}-${index}`),
    playerName: String(message.playerName || "Player"),
    text: String(message.text || "").slice(0, 120),
    turn: Math.max(0, Number(message.turn) || 0)
  })).filter((message) => message.text) : [];
  next.hintNotice = normalizeHintNotice(next.hintNotice, next.round);
  next.wordNotice = normalizeWordNotice(next.wordNotice, next.round);
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
  rank.textContent = canView && state.secretVisible ? state.currentSecretRank : "出題者だけ見られます";
  box.append(rank);
  return box;
}

function createPhaseCard(title, description, children = [], actions = [], meta = []) {
  const card = document.createElement("section");
  card.className = "phase-card";
  const head = document.createElement("div");
  head.className = "phase-card-head";
  head.innerHTML = `
    <span>${escapeHtml(PHASE_LABELS[state.phase] || "進行")}</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(description)}</p>
  `;
  const body = document.createElement("div");
  body.className = "phase-card-body";
  for (const child of children.filter(Boolean)) body.append(child);
  card.append(head, body);
  if (actions.length) {
    const footer = document.createElement("div");
    footer.className = "phase-card-actions";
    for (const action of actions) footer.append(action);
    card.append(footer);
  }
  if (meta.length) {
    const metaLine = document.createElement("div");
    metaLine.className = "phase-card-meta";
    metaLine.textContent = meta.join(" / ");
    card.append(metaLine);
  }
  return card;
}

function createIntroScreen(title, detail = "") {
  const overlay = document.createElement("div");
  overlay.className = "round-intro-overlay";
  const card = document.createElement("div");
  card.className = "round-intro-card";
  card.innerHTML = `
    <span class="round-intro-eyebrow">${escapeHtml(PHASE_LABELS[state.phase] || "進行")}</span>
    <strong>${escapeHtml(title)}</strong>
    ${detail ? `<em>${escapeHtml(detail)}</em>` : ""}
  `;
  overlay.append(card);
  return overlay;
}

function createSetterPromptCard(compact = false) {
  const secretRank = state.currentSecretRank || "?";
  const isSecretReady = Boolean(state.currentSecretRank);
  const card = document.createElement("div");
  card.className = compact ? "setter-prompt compact" : "setter-prompt";
  const instruction = document.createElement("div");
  instruction.className = "setter-instruction";
  instruction.innerHTML = `<strong class="target-rank-badge ${isSecretReady ? `rank-${state.currentSecretRank}` : "rank-pending"}">${escapeHtml(secretRank)}</strong><span>${isSecretReady ? "に適した単語を考えて入力してください。" : "秘密ランクを同期しています。"}</span>`;
  const actionRow = document.createElement("div");
  actionRow.className = "setter-action-row";
  actionRow.append(button("入力する", () => {
    if (sendRemoteAction("goAnswer", { playerName: getCurrentPlayerName() })) return;
    goAnswerPhase(getCurrentPlayerName());
  }, "primary setter-input-button", "button", !isSecretReady));
  const wordCount = document.createElement("div");
  wordCount.className = "setter-word-count";
  wordCount.textContent = `ワード数 ${countWords()} / 50`;
  actionRow.append(wordCount);
  card.append(instruction, actionRow);
  return card;
}

function createWaitingPanel(text) {
  const panel = document.createElement("div");
  panel.className = "waiting-panel";
  panel.innerHTML = `
    <span class="waiting-eyebrow">待機中</span>
    <strong>${escapeHtml(text)}</strong>
    <p>出題が終わると単語が発表されます。</p>
  `;
  return panel;
}

function goAnswerPhase(playerName) {
  if (!isRoundTopicSetterName(playerName || getCurrentPlayerName())) return;
  if (!state.currentSecretRank) {
    render();
    return;
  }
  state.secretVisible = false;
  state.phase = "answer";
  saveGame();
  render();
}

function beginRankAnswer(playerName) {
  const safeName = String(playerName || getCurrentPlayerName() || "").trim();
  if (state.phase !== "discussion") return;
  if (!isRoundAnswererName(safeName)) return;
  const activeAnswerer = getActiveAnswererName();
  if (activeAnswerer && normalizeName(activeAnswerer) !== normalizeName(safeName)) return;
  state.activeAnswererName = safeName;
  state.selectedRank = "";
  state.phase = "judgement";
  saveGame();
  render();
}

function cancelRankAnswer(playerName) {
  const safeName = String(playerName || getCurrentPlayerName() || "").trim();
  if (!canPlayerControlRankAnswer(safeName)) return;
  state.activeAnswererName = "";
  state.selectedRank = "";
  state.phase = "discussion";
  saveGame();
  render();
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
    return [{ playerName: getActiveAnswererNames()[0] || "Player", word: state.currentAnswer }];
  }
  return [];
}

function submitAnswer(answer, playerName) {
  const safeWord = String(answer || "").trim().slice(0, 20);
  if (!safeWord) return;
  const safeName = String(playerName || getCurrentPlayerName() || "Player").trim();
  if (!isRoundTopicSetterName(safeName)) return;
  const nextAnswer = { playerName: safeName, word: safeWord };
  state.currentAnswers = [nextAnswer];
  state.currentAnswer = safeWord;
  state.wordNotice = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    playerName: safeName.slice(0, 12),
    word: safeWord,
    round: state.round
  };
  state.phase = "discussion";
}

function hasCurrentPlayerAnswered() {
  const playerName = getCurrentPlayerName();
  return getCurrentAnswers().some((answer) => normalizeName(answer.playerName) === normalizeName(playerName));
}

function isRoundTopicSetterName(playerName) {
  return normalizeName(playerName) === normalizeName(getRoundTopicSetterName());
}

function getActiveAnswererName() {
  return String(state.activeAnswererName || "").trim();
}

function isRoundAnswererName(playerName) {
  return isNameInList(playerName, getActiveAnswererNames());
}

function canPlayerControlRankAnswer(playerName) {
  const safeName = String(playerName || "").trim();
  const activeAnswerer = getActiveAnswererName();
  return Boolean(
    state.phase === "judgement" &&
    activeAnswerer &&
    normalizeName(activeAnswerer) === normalizeName(safeName) &&
    isRoundAnswererName(safeName)
  );
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
  if (!answers.length) return "単語";
  return `単語 ${answers.map((answer) => `「${answer.word}」`).join(" / ")}`;
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

function showHintConfirmDialog() {
  if (!canUseHint()) return;
  document.querySelectorAll(".hint-confirm-overlay").forEach((node) => node.remove());
  const content = document.createElement("div");
  content.className = "hint-dialog";
  content.innerHTML = `
    <p><strong>ヒントを1回使いますか？</strong></p>
    <p>秘密ランクではない候補を最大2つ除外します。残りヒントは ${state.remainingHints}/${state.hintCount} です。</p>
  `;
  let dialog = null;
  const close = () => dialog && dialog.remove();
  dialog = createModal("ヒント確認", [content], [
    button("キャンセル", close, "ghost"),
    button("OK", () => {
      close();
      requestHintUse(getCurrentPlayerName());
    }, "primary")
  ]);
  dialog.classList.add("hint-confirm-overlay");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
}

function showPendingHintNotice() {
  const notice = normalizeHintNotice(state.hintNotice, state.round);
  if (!notice || !notice.id || notice.id === lastShownHintNoticeId) return;
  lastShownHintNoticeId = notice.id;
  document.querySelectorAll(".hint-notice-overlay").forEach((node) => node.remove());
  let dialog = null;
  const close = () => dialog && dialog.remove();
  dialog = createModal("ヒント発動", [hintNoticePanel(notice)], [
    button("OK", close, "primary")
  ]);
  dialog.classList.add("hint-notice-overlay");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
}

function hintNoticePanel(notice) {
  const box = document.createElement("div");
  box.className = "hint-dialog";
  const ranks = notice.ranks.map((rank) => `<span class="hint-rank-badge rank-${rank}">${escapeHtml(rank)}</span>`).join("");
  box.innerHTML = `
    <p><strong>${escapeHtml(notice.playerName || "誰か")}</strong> がヒントを使いました。</p>
    <p>このラウンドでは、次のランクは正解候補から外れます。</p>
    <div class="hint-rank-list">${ranks}</div>
  `;
  return box;
}

function normalizeHintNotice(notice, round = state.round) {
  if (!notice || typeof notice !== "object") return null;
  const ranks = Array.isArray(notice.ranks)
    ? notice.ranks.map(String).filter((rank) => ALL_RANKS.includes(rank))
    : [];
  if (!ranks.length) return null;
  const noticeRound = Math.max(1, Number(notice.round) || round || 1);
  if (Number(round) && noticeRound !== Number(round)) return null;
  return {
    id: String(notice.id || `${noticeRound}-${ranks.join("-")}`),
    playerName: String(notice.playerName || "誰か").slice(0, 12),
    ranks,
    round: noticeRound
  };
}

function showPendingWordNotice() {
  const notice = normalizeWordNotice(state.wordNotice, state.round);
  if (!notice || !notice.id || notice.id === lastShownWordNoticeId) return;
  lastShownWordNoticeId = notice.id;
  document.querySelectorAll(".word-notice-overlay").forEach((node) => node.remove());
  let dialog = null;
  const close = () => dialog && dialog.remove();
  dialog = createModal("単語発表", [wordNoticePanel(notice)], [
    button("OK", close, "primary")
  ]);
  dialog.classList.add("word-notice-overlay");
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
}

function wordNoticePanel(notice) {
  const box = document.createElement("div");
  box.className = "word-notice-dialog";
  box.innerHTML = `
    <span class="word-notice-eyebrow">単語発表</span>
    <p><strong>${escapeHtml(notice.playerName || "出題者")}</strong> が単語を入力しました。</p>
    <div class="announced-word">${escapeHtml(notice.word)}</div>
    <p>この単語がどのランクっぽいか、みんなで相談してください。</p>
  `;
  return box;
}

function normalizeWordNotice(notice, round = state.round) {
  if (!notice || typeof notice !== "object") return null;
  const word = String(notice.word || "").trim().slice(0, 20);
  if (!word) return null;
  const noticeRound = Math.max(1, Number(notice.round) || round || 1);
  if (Number(round) && noticeRound !== Number(round)) return null;
  return {
    id: String(notice.id || `${noticeRound}-${word}`),
    playerName: String(notice.playerName || "出題者").slice(0, 12),
    word,
    round: noticeRound
  };
}

function answerBox() {
  const box = document.createElement("div");
  box.className = "result-box";
  box.innerHTML = `出題単語<span class="answer-word">${escapeHtml(state.currentAnswer)}</span>`;
  return box;
}

function answersBox() {
  const box = document.createElement("div");
  box.className = "answers-box";
  const title = document.createElement("strong");
  const answers = getCurrentAnswers();
  title.textContent = answers.length ? "出題単語" : "出題単語 未入力";
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

function createSelectedRankFocus() {
  const box = document.createElement("div");
  box.className = `selected-rank-focus${state.selectedRank ? " has-selection" : ""}`;
  if (state.selectedRank) {
    box.innerHTML = `
      <span>選択中のランク</span>
      <strong class="rank-${state.selectedRank}">${escapeHtml(state.selectedRank)}</strong>
      <p>このランクで決定できます。</p>
    `;
  } else {
    box.innerHTML = `
      <span>選択中のランク</span>
      <strong>未選択</strong>
      <p>表かボタンからランクを選んでください。</p>
    `;
  }
  return box;
}

function resultPanel(result) {
  const box = document.createElement("div");
  box.className = `result-panel ${result.success ? "success" : "failure"}`;
  const rankTheme = getRankTheme(result.judgedRank || result.secretRank);
  box.style.setProperty("--result-rank-color", rankTheme.color);
  box.style.setProperty("--result-rank-tint", rankTheme.tint);
  const remaining = Math.max(0, state.goalStreak - state.streak);
  const words = Array.isArray(result.answers) && result.answers.length
    ? result.answers.map((answer) => answer.word).filter(Boolean)
    : String(result.answer || "").split(" / ").filter(Boolean);
  const answerHtml = words.length
    ? words.map((word) => `<span class="answer-word small-answer">${escapeHtml(word)}</span>`).join("")
    : `<span class="answer-word">未入力</span>`;
  const unlocked = result.unlockedRanks && result.unlockedRanks.length
    ? `<p class="unlock-note">新ランク ${result.unlockedRanks.join(" / ")} が解放されました。</p>`
    : "";
  box.innerHTML = `
    <div class="result-stamp ${result.success ? "success" : "failure"}">${result.success ? "正解" : "不正解"}</div>
    <div class="result-compare-grid">
      <div class="result-compare-card word-card">
        <span>単語</span>
        <div class="result-word-list">${answerHtml}</div>
      </div>
      <div class="result-compare-card secret-card">
        <span>秘密ランク</span>
        <strong class="rank-${result.secretRank}">${escapeHtml(result.secretRank)}</strong>
      </div>
      <div class="result-compare-card judged-card ${result.success ? "matched" : "missed"}">
        <span>選ばれたランク</span>
        <strong class="rank-${result.judgedRank}">${escapeHtml(result.judgedRank)}</strong>
      </div>
    </div>
    <p class="result-message">${result.success ? "ランク一致。連続正解が伸びました。" : "ランク不一致。連続正解は0に戻ります。"}</p>
    <p class="result-remaining">連続正解目標まであと <strong>${remaining}</strong></p>
    ${unlocked}
  `;
  return box;
}

function getRankTheme(rank) {
  return RANK_THEMES[rank] || { color: "var(--accent)", tint: "rgba(23, 107, 100, 0.12)" };
}

function clearCelebrationPanel() {
  const box = document.createElement("div");
  box.className = "clear-panel";
  const rings = document.createElement("div");
  rings.className = "clear-rings";
  rings.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;
  const title = document.createElement("strong");
  title.textContent = "連続正解達成！";
  const message = document.createElement("p");
  message.textContent = `連続正解目標の${state.goalStreak}問に到達しました。Tier表、かなり育っています。`;
  const stats = document.createElement("div");
  stats.className = "clear-stats";
  stats.append(metaBox("連続正解", `${state.streak}`), metaBox("登録ワード", `${countWords()}`), metaBox("ラウンド", `${state.round}`));
  box.append(rings, title, message, stats);
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
  return isRoundTopicSetterName(playerName);
}

function canCurrentPlayerJudge() {
  return canPlayerControlRankAnswer(getCurrentPlayerName());
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function getCurrentPlayerName() {
  return window.TierGame ? window.TierGame.getPlayerName() : "Player";
}

function uniqueNames(names) {
  const seen = new Set();
  const result = [];
  for (const name of names || []) {
    const safeName = String(name || "").trim();
    const key = normalizeName(safeName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(safeName);
  }
  return result;
}

function isNameInList(name, names) {
  const key = normalizeName(name);
  return Boolean(key && (names || []).some((item) => normalizeName(item) === key));
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

function initChatResize() {
  const panel = els.chatPanel;
  const handle = els.chatResizeHandle;
  if (!panel || !handle) return;

  setChatHeight(Number(localStorage.getItem(CHAT_HEIGHT_KEY)) || 154);
  setChatCollapsed(localStorage.getItem(CHAT_COLLAPSED_KEY) === "1");

  if (els.chatToggleButton) {
    els.chatToggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const collapsed = !panel.classList.contains("collapsed");
      setChatCollapsed(collapsed);
      localStorage.setItem(CHAT_COLLAPSED_KEY, collapsed ? "1" : "0");
    });
  }

  let startY = 0;
  let startHeight = 0;

  const resize = (clientY) => {
    const topExclusion = window.innerHeight >= 812 ? 98 : 74;
    const maxHeight = Math.max(110, window.innerHeight - topExclusion - 22);
    const nextHeight = clamp(startHeight + (startY - clientY), 110, maxHeight);
    setChatHeight(nextHeight);
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#chatToggleButton") || panel.classList.contains("collapsed")) return;
    event.preventDefault();
    startY = event.clientY;
    startHeight = panel.getBoundingClientRect().height;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-chat");
  });

  handle.addEventListener("pointermove", (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    resize(event.clientY);
  });

  const finish = (event) => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove("resizing-chat");
    localStorage.setItem(CHAT_HEIGHT_KEY, String(Math.round(panel.getBoundingClientRect().height)));
  };

  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function setChatHeight(height) {
  const nextHeight = clamp(Number(height) || 154, 110, Math.max(110, window.innerHeight - 92));
  document.documentElement.style.setProperty("--chat-height", `${Math.round(nextHeight)}px`);
}

function setChatCollapsed(collapsed) {
  const panel = els.chatPanel;
  if (!panel) return;
  panel.classList.toggle("collapsed", collapsed);
  if (els.chatToggleButton) {
    els.chatToggleButton.textContent = collapsed ? "＋" : "−";
    els.chatToggleButton.setAttribute("aria-label", collapsed ? "チャットを開く" : "チャットを最小化");
  }
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
    (state.currentSecretRank && normalizeName(playerName) === normalizeName(getRoundTopicSetterName()));
  if (!canSee) next.currentSecretRank = "";
  return next;
}

function exportSecretForPlayer(playerName = "") {
  if (!state.currentSecretRank) return null;
  if (normalizeName(playerName) !== normalizeName(getRoundTopicSetterName())) return null;
  return {
    round: state.round,
    phase: state.phase,
    topicSetterName: getRoundTopicSetterName(),
    currentSecretRank: state.currentSecretRank
  };
}

function importOnlineState(nextState) {
  applyingRemoteState = true;
  const previousState = state;
  const normalized = normalizeLoadedState(nextState);
  if (
    !normalized.currentSecretRank &&
    previousState.currentSecretRank &&
    normalized.round === previousState.round &&
    normalizeName(normalized.topicSetterName) === normalizeName(previousState.topicSetterName) &&
    normalizeName(getCurrentPlayerName()) === normalizeName(normalized.topicSetterName)
  ) {
    normalized.currentSecretRank = previousState.currentSecretRank;
  }
  state = normalized;
  applyingRemoteState = false;
  render();
}

function importSecret(secret) {
  if (!secret || typeof secret !== "object") return;
  const rank = String(secret.currentSecretRank || "").trim();
  if (!ALL_RANKS.includes(rank)) return;
  if (Number(secret.round) !== Number(state.round)) return;
  if (normalizeName(secret.topicSetterName) !== normalizeName(getRoundTopicSetterName())) return;
  if (normalizeName(getCurrentPlayerName()) !== normalizeName(getRoundTopicSetterName())) return;
  state.currentSecretRank = rank;
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
      goAnswerPhase(payload.playerName);
      break;
    case "submitAnswer":
      if (!payload.answer) return;
      submitAnswer(payload.answer, payload.playerName);
      saveGame();
      render();
      break;
    case "beginRankAnswer":
      beginRankAnswer(payload.playerName);
      break;
    case "cancelRankAnswer":
      cancelRankAnswer(payload.playerName);
      break;
    case "chat":
      appendChat(payload.text, payload.playerName);
      saveGame();
      render();
      break;
    case "goJudgement":
      beginRankAnswer(payload.playerName);
      break;
    case "useHint":
      useHint(payload.playerName);
      break;
    case "judge":
      if (payload.rank) judge(payload.rank, payload.playerName);
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
  exportSecretForPlayer,
  importSecret,
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

function normalizeSetupOnlineScreens(root) {
  if (isRoomConnected()) return;
  const screens = [...root.querySelectorAll(".online-screen[data-online-screen]")];
  if (!screens.length) return;
  const current = document.body.dataset.onlineScreen;
  const targetName = screens.some((screen) => screen.dataset.onlineScreen === current) ? current : "home";
  let target = screens.find((screen) => screen.dataset.onlineScreen === targetName);
  if (!target) target = screens.find((screen) => screen.dataset.onlineScreen === "home") || screens[0];
  screens.forEach((screen) => {
    screen.classList.toggle("hidden", screen !== target);
  });
  document.body.classList.remove("hidden");
  document.body.dataset.online = "lobby";
  document.body.dataset.onlineScreen = target.dataset.onlineScreen || "home";
}

function canEditSetupControls() {
  const online = window.TierOnline;
  return Boolean(
    online &&
    (online.host || (typeof online.isHost === "function" && online.isHost())) &&
    (online.online || document.body.dataset.role === "host")
  );
}

function bindSetupFormBehavior(root) {
  const topicInput = root.querySelector("#topicInput");
  const startWordInput = root.querySelector("#startWordInput");
  const initialRankInput = root.querySelector("#initialRankInput");
  const goalInput = root.querySelector("#goalInput");
  const hintInput = root.querySelector("#hintCountInput");
  const topicModeInputs = [...root.querySelectorAll('[name="topicMode"]')];
  const topicModeFieldset = topicModeInputs[0] ? topicModeInputs[0].closest("fieldset") : null;
  let lastAutoRerollAt = 0;
  const modeValue = () => root.querySelector('[name="topicMode"]:checked')?.value || "auto";
  const formAllowsEdit = () => canEditSetupControls() || topicModeInputs.some((input) => !input.disabled);
  const syncLocalSetupState = () => {
    state.topicMode = modeValue() || state.topicMode || "auto";
    state.topic = topicInput ? topicInput.value.trim() : state.topic;
    state.startWord = startWordInput ? startWordInput.value.trim() : state.startWord;
    state.initialRank = initialRankInput ? initialRankInput.value : state.initialRank;
    state.goalStreak = goalInput ? clamp(Number(goalInput.value) || state.goalStreak, 1, 20) : state.goalStreak;
    state.hintCount = hintInput ? clamp(Number(hintInput.value) || 0, 0, 20) : state.hintCount;
    state.remainingHints = state.hintCount;
  };
  const applyRandomAutoSetup = () => {
    const auto = pickAutoSetup({
      topic: topicInput ? topicInput.value.trim() : "",
      startWord: startWordInput ? startWordInput.value.trim() : "",
      initialRank: initialRankInput ? initialRankInput.value : ""
    });
    if (topicInput) topicInput.value = auto.topic;
    if (startWordInput) startWordInput.value = auto.startWord;
    if (initialRankInput) initialRankInput.value = auto.initialRank;
    lastAutoRerollAt = Date.now();
  };
  const unlockManualFields = () => {
    if (modeValue() !== "manual" || !formAllowsEdit()) return;
    [topicInput, startWordInput, initialRankInput].filter(Boolean).forEach((control) => {
      control.disabled = false;
      control.readOnly = false;
      control.removeAttribute("readonly");
      control.classList.remove("readonly-preview");
    });
  };
  const applyMode = () => {
    const mode = modeValue();
    const auto = mode === "auto";
    const roleAllowsEdit = formAllowsEdit();
    [topicInput, startWordInput].filter(Boolean).forEach((control) => {
      control.disabled = !roleAllowsEdit;
      control.readOnly = false;
      control.removeAttribute("readonly");
      control.setAttribute("aria-readonly", auto ? "true" : "false");
      control.classList.toggle("readonly-preview", auto);
    });
    if (initialRankInput) {
      initialRankInput.disabled = !roleAllowsEdit;
      initialRankInput.readOnly = false;
      initialRankInput.removeAttribute("readonly");
      initialRankInput.setAttribute("aria-readonly", auto ? "true" : "false");
      initialRankInput.classList.toggle("readonly-preview", auto);
    }
  };
  [topicInput, startWordInput, initialRankInput, goalInput, hintInput].filter(Boolean).forEach((control) => {
    if (control.dataset.boundSetupCache) return;
    control.dataset.boundSetupCache = "1";
    control.addEventListener("input", syncLocalSetupState);
    control.addEventListener("change", syncLocalSetupState);
  });
  topicModeInputs.forEach((input) => {
    if (input.dataset.boundSetupMode) return;
    input.dataset.boundSetupMode = "1";
    const label = input.closest("label");
    const prepareMode = () => {
      if (input.value === "manual" && formAllowsEdit()) {
        input.checked = true;
        state.topicMode = "manual";
        applyMode();
        unlockManualFields();
      }
    };
    if (label) {
      label.addEventListener("pointerdown", prepareMode);
      label.addEventListener("touchstart", prepareMode, { passive: true });
    }
    input.addEventListener("click", () => {
      setTimeout(() => {
        if (input.value === "auto" && input.checked && canEditSetupControls()) {
          applyRandomAutoSetup();
        }
        applyMode();
        syncLocalSetupState();
        syncSetupConfig();
      }, 0);
    });
    input.addEventListener("change", () => {
      state.topicMode = input.value;
      if (
        input.value === "auto" &&
        input.checked &&
        canEditSetupControls() &&
        Date.now() - lastAutoRerollAt > 100
      ) {
        applyRandomAutoSetup();
      }
      applyMode();
      syncLocalSetupState();
      syncSetupConfig();
    });
  });
  if (topicModeFieldset && !topicModeFieldset.dataset.boundSetupModeDelegate) {
    topicModeFieldset.dataset.boundSetupModeDelegate = "1";
    topicModeFieldset.addEventListener("click", (event) => {
      const label = event.target.closest("label");
      if (!label || !topicModeFieldset.contains(label)) return;
      const input = label.querySelector('[name="topicMode"]');
      if (!input || input.disabled) return;
      input.checked = true;
      state.topicMode = input.value;
      if (input.value === "auto" && canEditSetupControls() && Date.now() - lastAutoRerollAt > 100) {
        applyRandomAutoSetup();
      }
      applyMode();
      if (input.value === "manual") unlockManualFields();
      syncLocalSetupState();
      syncSetupConfig();
    });
    topicModeFieldset.addEventListener("touchend", (event) => {
      const label = event.target.closest("label");
      if (!label || !topicModeFieldset.contains(label)) return;
      const input = label.querySelector('[name="topicMode"]');
      if (!input || input.disabled || input.value !== "manual") return;
      input.checked = true;
      state.topicMode = "manual";
      applyMode();
      unlockManualFields();
    }, { passive: true });
  }
  [topicInput, startWordInput, initialRankInput].filter(Boolean).forEach((control) => {
    const prepareInput = () => unlockManualFields();
    control.addEventListener("pointerdown", prepareInput);
    control.addEventListener("touchstart", prepareInput, { passive: true });
    control.addEventListener("focus", prepareInput);
  });
  applyMode();
  unlockManualFields();
  syncLocalSetupState();
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
