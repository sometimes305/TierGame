const STORAGE_KEY = "tier-sense-state-v1";
const ALL_RANKS = ["SSS", "SS", "S", "A", "B", "C", "D", "E", "F", "G"];
const INITIAL_RANKS = ["S", "A", "B", "C", "D"];
const PHASE_LABELS = {
  setup: "セットアップ",
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
  endGame: document.querySelector("#endGameButton"),
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
  setupTemplate: document.querySelector("#setupTemplate")
};

els.endGame.addEventListener("click", resetGame);
els.help.addEventListener("click", showHowToPlay);
render();

function createInitialState() {
  return {
    topic: "",
    mode: "group",
    goalStreak: 5,
    hintCount: 1,
    streak: 0,
    round: 1,
    currentSecretRank: "",
    currentAnswer: "",
    judgedRank: "",
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
  els.streak.textContent = state.streak;
  els.goal.textContent = state.goalStreak;
  els.round.textContent = state.round;
  els.topic.textContent = state.topic || "未設定";
  els.headerPhase.textContent = PHASE_LABELS[state.phase];
  els.phase.textContent = PHASE_LABELS[state.phase];
  els.panelTitle.textContent = PHASE_LABELS[state.phase];

  renderBoard();
  renderPanel();
  if (window.TierOnline && window.TierOnline.bindControls) {
    window.TierOnline.bindControls();
  }
}

function renderBoard() {
  els.board.innerHTML = "";

  for (const rank of state.unlockedRanks) {
    const row = document.createElement("div");
    row.className = "tier-row";

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
        chip.textContent = word;
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
    fragment.querySelector("#goalInput").value = state.goalStreak;
    fragment.querySelector("#hintCountInput").value = state.hintCount;
    fragment.querySelector(`[name="mode"][value="${state.mode}"]`).checked = true;
    fragment.querySelector("#loadButton").disabled = !localStorage.getItem(STORAGE_KEY);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      startGame({
        topic: form.querySelector("#topicInput").value.trim(),
        goalStreak: Number(form.querySelector("#goalInput").value),
        hintCount: Number(form.querySelector("#hintCountInput").value),
        mode: formData.get("mode")
      });
    });

    fragment.querySelector("#loadButton").addEventListener("click", loadGame);
    els.panelBody.append(fragment);
    return;
  }

  if (state.phase === "secret") {
    els.panelBody.append(
      createStack([
        createSecretBox(),
        createButtonRow([
          button(state.secretVisible ? "隠す" : "秘密ランクを見る", () => {
            state.secretVisible = !state.secretVisible;
            render();
          }, "primary"),
          button("回答入力へ", () => {
            if (sendRemoteAction("goAnswer")) return;
            state.secretVisible = false;
            state.phase = "answer";
            saveGame();
            render();
          })
        ]),
        note(state.mode === "group" ? "回答者だけが確認して、見終わったら隠してください。" : "固定回答者用の秘密ランクです。")
      ])
    );
    return;
  }

  if (state.phase === "answer") {
    const form = document.createElement("form");
    form.className = "stack";
    form.innerHTML = `
      <label>
        <span>回答単語</span>
        <input id="answerInput" maxlength="30" placeholder="例: ワニ" required />
      </label>
    `;
    const row = createButtonRow([
      button("回答確定", null, "primary", "submit"),
      button("秘密へ戻る", () => {
        state.phase = "secret";
        render();
      }, "ghost", "button")
    ]);
    form.append(row);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const answer = form.querySelector("#answerInput").value.trim();
      if (!answer) return;
      if (sendRemoteAction("submitAnswer", { answer })) return;
      state.currentAnswer = answer;
      state.phase = "discussion";
      saveGame();
      render();
    });
    els.panelBody.append(form);
    return;
  }

  if (state.phase === "discussion") {
    const children = [
      answerBox(),
      createHintBox(),
      createButtonRow([
        button("ヒントを使う", useHint, "ghost", "button", state.hintCount === 0 || state.eliminatedRanks.length >= state.hintCount),
        button("オーナー判定へ", () => {
          if (sendRemoteAction("goJudgement")) return;
          state.phase = "judgement";
          saveGame();
          render();
        }, "primary")
      ])
    ];
    els.panelBody.append(createStack(children));
    return;
  }

  if (state.phase === "judgement") {
    const picker = document.createElement("div");
    picker.className = "rank-picker";
    for (const rank of state.unlockedRanks) {
      picker.append(button(rank, () => judge(rank), `rank-button rank-${rank}`));
    }

    els.panelBody.append(
      createStack([
        answerBox(),
        picker,
        button("相談に戻る", () => {
          state.phase = "discussion";
          render();
        })
      ])
    );
    return;
  }

  if (state.phase === "result") {
    const result = state.lastResult;
    const resultBox = document.createElement("div");
    resultBox.className = "result-box";
    resultBox.innerHTML = `
      <p class="${result.success ? "success" : "failure"}"><strong>${result.success ? "正解" : "不正解"}</strong></p>
      <p>回答: <span class="answer-word">${escapeHtml(result.answer)}</span></p>
      <p>秘密ランク: <strong>${result.secretRank}</strong> / 判定: <strong>${result.judgedRank}</strong></p>
    `;

    els.panelBody.append(
      createStack([
        resultBox,
        createButtonRow([
          button("次のラウンド", nextRound, "primary"),
          button("保存", saveGame),
          button("リセット", resetGame, "danger")
        ])
      ])
    );
    return;
  }

  if (state.phase === "clear") {
    els.panelBody.append(
      createStack([
        resultMessage("clear", `クリア。${state.goalStreak}連続正解に到達しました。`),
        createButtonRow([
          button("同じお題でもう一度", restartKeepingBoard, "primary"),
          button("最初から", resetGame)
        ])
      ])
    );
  }
}

function startGame({ topic, goalStreak, hintCount, mode }) {
  if (sendRemoteAction("startGame", { topic, goalStreak, hintCount, mode })) return;
  state = createInitialState();
  state.topic = topic || "強そうな動物";
  state.goalStreak = clamp(goalStreak || 5, 1, 20);
  state.hintCount = clamp(hintCount || 0, 0, 2);
  state.mode = mode === "solo" ? "solo" : "group";
  prepareRound();
  saveGame();
  render();
}

function prepareRound() {
  state.currentSecretRank = pick(state.unlockedRanks);
  state.currentAnswer = "";
  state.judgedRank = "";
  state.eliminatedRanks = [];
  state.secretVisible = false;
  state.lastResult = null;
  state.phase = "secret";
}

function useHint() {
  if (sendRemoteAction("useHint")) return;
  if (state.hintCount === 0) return;
  if (state.eliminatedRanks.length >= state.hintCount) return;

  const candidates = state.unlockedRanks.filter(
    (rank) => rank !== state.currentSecretRank && !state.eliminatedRanks.includes(rank)
  );
  const next = pick(candidates);
  if (next) state.eliminatedRanks.push(next);
  saveGame();
  render();
}

function judge(rank) {
  if (sendRemoteAction("judge", { rank })) return;
  const success = rank === state.currentSecretRank;
  state.judgedRank = rank;
  state.streak = success ? state.streak + 1 : 0;
  addWord(rank, state.currentAnswer);
  unlockOuterRanks(rank);
  state.lastResult = {
    success,
    answer: state.currentAnswer,
    secretRank: state.currentSecretRank,
    judgedRank: rank
  };
  state.phase = state.streak >= state.goalStreak ? "clear" : "result";
  saveGame();
  render();
}

function addWord(rank, word) {
  if (!state.tierTable[rank]) state.tierTable[rank] = [];
  state.tierTable[rank].push(word);
}

function unlockOuterRanks(rank) {
  const currentIndexes = state.unlockedRanks.map((item) => ALL_RANKS.indexOf(item));
  const min = Math.min(...currentIndexes);
  const max = Math.max(...currentIndexes);
  const index = ALL_RANKS.indexOf(rank);

  if (index === min && min > 0) unlockRank(ALL_RANKS[min - 1]);
  if (index === max && max < ALL_RANKS.length - 1) unlockRank(ALL_RANKS[max + 1]);

  state.unlockedRanks.sort((a, b) => ALL_RANKS.indexOf(a) - ALL_RANKS.indexOf(b));
}

function unlockRank(rank) {
  if (!state.unlockedRanks.includes(rank)) state.unlockedRanks.push(rank);
  if (!state.tierTable[rank]) state.tierTable[rank] = [];
}

function nextRound() {
  if (sendRemoteAction("nextRound")) return;
  state.round += 1;
  prepareRound();
  saveGame();
  render();
}

function restartKeepingBoard() {
  if (sendRemoteAction("restartKeepingBoard")) return;
  state.streak = 0;
  state.round += 1;
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

function showHowToPlay() {
  alert("回答者だけが秘密ランクを見て、そのランクっぽい単語を入力します。みんなで相談し、オーナーがランクを選びます。秘密ランクと一致したら連続正解です。");
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
  }
  next.goalStreak = clamp(Number(next.goalStreak) || 5, 1, 20);
  next.hintCount = clamp(Number(next.hintCount) || 0, 0, 2);
  next.streak = Math.max(0, Number(next.streak) || 0);
  next.round = Math.max(1, Number(next.round) || 1);
  next.phase = PHASE_LABELS[next.phase] ? next.phase : "setup";
  return next;
}

function createSecretBox() {
  const box = document.createElement("div");
  box.className = "secret-box";
  const rank = document.createElement("div");
  rank.className = state.secretVisible ? "secret-rank" : "secret-rank hidden-secret";
  rank.textContent = state.secretVisible ? state.currentSecretRank : "隠れています";
  box.append(rank);
  return box;
}

function createHintBox() {
  const box = document.createElement("div");
  box.className = "hint-box";
  box.innerHTML = `<strong>ヒント</strong>`;

  if (state.eliminatedRanks.length === 0) {
    box.append(note("まだ使っていません。"));
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

function exportOnlineState() {
  return {
    ...state,
    secretVisible: false
  };
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
      state.currentAnswer = String(payload.answer).trim();
      state.phase = "discussion";
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
    return (input && input.value.trim()) || (joinInput && joinInput.value.trim()) || "Player";
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
  }
};
