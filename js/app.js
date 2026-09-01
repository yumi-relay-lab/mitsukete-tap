"use strict";

const STORAGE_KEYS = { nicknames: "mitsuketeTap.nicknames.v1", selected: "mitsuketeTap.selectedNickname.v1", results: "mitsuketeTap.results.v1" };
const GUEST = "ゲスト";
const MAX_HISTORY = 20;
const $ = (selector) => document.querySelector(selector);
const elements = {
  settingsPanel: $("#settingsPanel"), gamePanel: $("#gamePanel"), resultPanel: $("#resultPanel"), historyPanel: $("#historyPanel"),
  modeInputs: [...document.querySelectorAll('input[name="mode"]')], numberRange: $("#numberRange"), gridSize: $("#gridSize"),
  numberSize: $("#numberSize"), tileDisplay: $("#tileDisplay"), tileDisplayHelp: $("#tileDisplayHelp"), timeSetting: $("#timeSetting"),
  timeLimit: $("#timeLimit"), soundEnabled: $("#soundEnabled"), soundLabel: $("#soundLabel"), startButton: $("#startButton"),
  nextNumber: $("#nextNumber"), timeLabel: $("#timeLabel"), timeDisplay: $("#timeDisplay"), mistakeCount: $("#mistakeCount"),
  numberGrid: $("#numberGrid"), retryButton: $("#retryButton"), resultTitle: $("#resultTitle"), resultNickname: $("#resultNickname"),
  resultMessage: $("#resultMessage"), comparisonMessage: $("#comparisonMessage"), resultStats: $("#resultStats"),
  playAgainButton: $("#playAgainButton"), backToSettingsButton: $("#backToSettingsButton"), nicknameSelect: $("#nicknameSelect"),
  addNicknameButton: $("#addNicknameButton"), nicknameDialog: $("#nicknameDialog"), nicknameForm: $("#nicknameForm"),
  nicknameInput: $("#nicknameInput"), nicknameError: $("#nicknameError"), cancelNicknameButton: $("#cancelNicknameButton"),
  historyButton: $("#historyButton"), resultHistoryButton: $("#resultHistoryButton"), historySubtitle: $("#historySubtitle"),
  historyList: $("#historyList"), deleteHistoryButton: $("#deleteHistoryButton"), closeHistoryButton: $("#closeHistoryButton")
};
const state = {
  playing: false, mode: "complete", maxNumber: 20, columns: 4, rows: 5, currentNumber: 1, mistakes: 0, correctCount: 0,
  startedAt: 0, elapsedMs: 0, timeLimit: 30, timerId: null, focusedIndex: 0, tileDisplay: "change", numberSize: "medium",
  audioContext: null, nickname: GUEST, historyReturnPanel: null
};
const gridByRange = { 20: "4x5", 30: "5x6", 50: "5x10" };
const fontSizes = { small: "clamp(1.15rem, 3vw, 1.8rem)", medium: "clamp(1.45rem, 4vw, 2.3rem)", large: "clamp(1.8rem, 5vw, 3rem)" };

function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function getNicknames() { const values = readJson(STORAGE_KEYS.nicknames, []); return Array.isArray(values) ? values.filter((value) => typeof value === "string" && value !== GUEST) : []; }
function getResults() { const values = readJson(STORAGE_KEYS.results, []); return Array.isArray(values) ? values : []; }
function selectedMode() { return elements.modeInputs.find((input) => input.checked)?.value ?? "complete"; }
function updateModeSetting() { const timed = selectedMode() === "timed"; elements.timeLimit.disabled = !timed; elements.timeSetting.classList.toggle("is-disabled", !timed); }
function syncGridToRange() { elements.gridSize.value = gridByRange[elements.numberRange.value]; }
function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) { const randomIndex = Math.floor(Math.random() * (index + 1)); [result[index], result[randomIndex]] = [result[randomIndex], result[index]]; }
  return result;
}
function showOnly(panel) {
  [elements.settingsPanel, elements.gamePanel, elements.resultPanel, elements.historyPanel].forEach((item) => { item.hidden = item !== panel; });
  document.body.classList.toggle("is-playing", panel === elements.gamePanel);
}
function readSettings() {
  state.mode = selectedMode(); state.maxNumber = Number(elements.numberRange.value); state.timeLimit = Number(elements.timeLimit.value);
  state.tileDisplay = elements.tileDisplay.value; state.numberSize = elements.numberSize.value; state.nickname = elements.nicknameSelect.value || GUEST;
  [state.columns, state.rows] = elements.gridSize.value.split("x").map(Number);
}

function renderNicknames(preferred) {
  const nicknames = [GUEST, ...getNicknames()]; const saved = preferred || localStorage.getItem(STORAGE_KEYS.selected) || GUEST;
  elements.nicknameSelect.replaceChildren(...nicknames.map((nickname) => {
    const option = document.createElement("option"); option.value = nickname;
    option.textContent = nickname === GUEST ? "ゲストで使う（記録は保存しません）" : nickname; return option;
  }));
  elements.nicknameSelect.value = nicknames.includes(saved) ? saved : GUEST; state.nickname = elements.nicknameSelect.value;
}
function openNicknameDialog() { elements.nicknameInput.value = ""; elements.nicknameError.hidden = true; elements.nicknameDialog.showModal(); setTimeout(() => elements.nicknameInput.focus(), 0); }
function addNickname(event) {
  event.preventDefault(); const nickname = elements.nicknameInput.value.trim().replace(/\s+/g, " "); const nicknames = getNicknames(); let error = "";
  if (!nickname) error = "ニックネームを入力してください。";
  else if (nickname === GUEST) error = "「ゲスト」以外のニックネームにしてください。";
  else if (nicknames.includes(nickname)) error = "そのニックネームは、もう登録されています。";
  if (error) { elements.nicknameError.textContent = error; elements.nicknameError.hidden = false; return; }
  if (!writeJson(STORAGE_KEYS.nicknames, [...nicknames, nickname])) { elements.nicknameError.textContent = "この端末に保存できませんでした。"; elements.nicknameError.hidden = false; return; }
  localStorage.setItem(STORAGE_KEYS.selected, nickname); renderNicknames(nickname); elements.nicknameDialog.close();
}

function startGame() {
  stopTimer(); readSettings(); Object.assign(state, { playing: true, currentNumber: 1, correctCount: 0, mistakes: 0, elapsedMs: 0, focusedIndex: 0, startedAt: performance.now() });
  renderGrid(); updateStatus(); showOnly(elements.gamePanel); startTimer();
}
function renderGrid() {
  const numbers = shuffle(Array.from({ length: state.maxNumber }, (_, index) => index + 1)); elements.numberGrid.replaceChildren();
  elements.numberGrid.style.setProperty("--columns", state.columns); elements.numberGrid.style.setProperty("--rows", state.rows);
  elements.numberGrid.style.setProperty("--number-font", fontSizes[state.numberSize]);
  numbers.forEach((number, index) => {
    const cell = document.createElement("button"); cell.type = "button"; cell.className = "number-cell"; cell.dataset.number = String(number);
    cell.dataset.index = String(index); cell.setAttribute("role", "gridcell"); cell.setAttribute("aria-label", `数字 ${number}`);
    cell.tabIndex = index === 0 ? 0 : -1; cell.textContent = String(number); cell.addEventListener("click", () => chooseCell(cell));
    cell.addEventListener("focus", () => setFocusedIndex(index, false)); elements.numberGrid.append(cell);
  });
}
function chooseCell(cell) {
  if (!state.playing || (state.tileDisplay === "change" && cell.classList.contains("is-found"))) return;
  if (Number(cell.dataset.number) === state.currentNumber) {
    state.correctCount += 1; state.currentNumber += 1;
    if (state.tileDisplay === "change") { cell.classList.add("is-found"); cell.setAttribute("aria-disabled", "true"); }
    showFeedback(cell, true); playTone(true); if (state.currentNumber > state.maxNumber) { setTimeout(() => endGame("completed"), 420); return; }
  } else { state.mistakes += 1; showFeedback(cell, false); playTone(false); }
  updateStatus();
}
function showFeedback(cell, correct) {
  cell.querySelector(".feedback")?.remove(); const feedback = document.createElement("span"); feedback.className = `feedback ${correct ? "correct" : "wrong"}`;
  feedback.textContent = correct ? "○" : "×"; feedback.setAttribute("aria-hidden", "true"); cell.append(feedback); setTimeout(() => feedback.remove(), 520);
}
function playTone(correct) {
  if (!elements.soundEnabled.checked) return; const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
  state.audioContext ??= new AudioContext(); const context = state.audioContext; if (context.state === "suspended") context.resume();
  const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = correct ? "sine" : "triangle";
  oscillator.frequency.setValueAtTime(correct ? 660 : 230, context.currentTime); if (correct) oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.1);
  gain.gain.setValueAtTime(0.0001, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.17);
}
function startTimer() {
  state.timerId = setInterval(() => { state.elapsedMs = performance.now() - state.startedAt;
    if (state.mode === "timed" && state.elapsedMs >= state.timeLimit * 1000) { state.elapsedMs = state.timeLimit * 1000; updateStatus(); endGame("timeout"); return; }
    updateStatus(); }, 100);
}
function stopTimer() { if (state.timerId !== null) clearInterval(state.timerId); state.timerId = null; }
function updateStatus() {
  elements.nextNumber.textContent = state.currentNumber <= state.maxNumber ? state.currentNumber : "完了"; elements.mistakeCount.textContent = state.mistakes;
  if (state.mode === "timed") { const remaining = Math.max(0, state.timeLimit - state.elapsedMs / 1000); elements.timeLabel.textContent = "残り時間"; elements.timeDisplay.textContent = `${remaining.toFixed(1)}秒`; }
  else { elements.timeLabel.textContent = "経過時間"; elements.timeDisplay.textContent = `${(state.elapsedMs / 1000).toFixed(1)}秒`; }
}

function comparable(previous, current) {
  return previous.nickname === current.nickname && previous.mode === current.mode && previous.maxNumber === current.maxNumber && previous.gridSize === current.gridSize &&
    previous.numberSize === current.numberSize && previous.tileDisplay === current.tileDisplay && (current.mode !== "timed" || previous.timeLimit === current.timeLimit);
}
function buildResult(reason) {
  const elapsedSeconds = Number((state.elapsedMs / 1000).toFixed(1));
  return { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, nickname: state.nickname, date: new Date().toISOString(), mode: state.mode,
    maxNumber: state.maxNumber, gridSize: `${state.columns}x${state.rows}`, numberSize: state.numberSize, tileDisplay: state.tileDisplay,
    elapsedSeconds, timeLimit: state.mode === "timed" ? state.timeLimit : null,
    remainingSeconds: state.mode === "timed" ? Number(Math.max(0, state.timeLimit - elapsedSeconds).toFixed(1)) : null,
    correctCount: state.correctCount, reachedNumber: Math.min(state.currentNumber, state.maxNumber), mistakes: state.mistakes, completed: reason === "completed" };
}
function saveResult(result) {
  if (result.nickname === GUEST) return null; const all = getResults(); const previous = all.find((item) => comparable(item, result)) || null;
  writeJson(STORAGE_KEYS.results, [result, ...all]); return previous;
}
function comparisonText(previous, current) {
  if (!previous) return "";
  if (current.mode === "complete") { const difference = Number((previous.elapsedSeconds - current.elapsedSeconds).toFixed(1));
    if (difference > 0) return `前回より ${difference.toFixed(1)}秒 はやくなりました！`;
    if (difference < 0) return `前回との差は ${Math.abs(difference).toFixed(1)}秒。次もチャレンジしてみよう！`; return "前回と同じタイムでした！"; }
  const difference = current.correctCount - previous.correctCount;
  if (difference > 0) return `前回より ${difference}こ 多くタップできました！`;
  if (difference < 0) return `前回との差は ${Math.abs(difference)}こ。次もチャレンジしてみよう！`; return "前回と同じ数をタップできました！";
}
function endGame(reason) {
  if (!state.playing) return; state.playing = false; if (reason === "completed") state.elapsedMs = performance.now() - state.startedAt; stopTimer();
  const completed = reason === "completed", result = buildResult(reason), previous = saveResult(result), comparison = comparisonText(previous, result);
  elements.resultTitle.textContent = completed ? "チャレンジ完了！" : "時間になりました！"; elements.resultNickname.textContent = state.nickname === GUEST ? "ゲストさん" : `${state.nickname}さん`;
  elements.resultMessage.textContent = completed ? "最後までよく見つけました！" : "集中してよくがんばりました！";
  elements.comparisonMessage.textContent = comparison || (state.nickname === GUEST ? "ゲストの記録は保存されません。" : "最初の記録を保存しました！"); elements.comparisonMessage.hidden = false;
  const stats = state.mode === "complete" ? [["かかった時間", `${result.elapsedSeconds.toFixed(1)}秒`], ["クリアした数", `${state.correctCount}個`], ["ミス", `${state.mistakes}回`]]
    : [["制限時間", `${state.timeLimit}秒`], ["正しくタップ", `${state.correctCount}個`], ["到達番号", state.correctCount >= state.maxNumber ? `${state.maxNumber}（完了）` : `${state.currentNumber}`], ["ミス", `${state.mistakes}回`]];
  elements.resultStats.replaceChildren(...stats.map(([label, value]) => { const wrapper = document.createElement("div"), term = document.createElement("dt"), detail = document.createElement("dd"); term.textContent = label; detail.textContent = value; wrapper.append(term, detail); return wrapper; }));
  showOnly(elements.resultPanel); elements.playAgainButton.focus();
}

function formatDate(value) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function renderHistory() {
  const nickname = elements.nicknameSelect.value || state.nickname || GUEST; const results = getResults().filter((item) => item.nickname === nickname).slice(0, MAX_HISTORY);
  elements.historySubtitle.textContent = nickname === GUEST ? "ゲストの記録は保存されません" : `${nickname}さんの最新${MAX_HISTORY}件`;
  elements.deleteHistoryButton.disabled = results.length === 0 || nickname === GUEST;
  if (!results.length) { const empty = document.createElement("p"); empty.className = "history-empty"; empty.textContent = nickname === GUEST ? "ニックネームを選ぶと、チャレンジ結果をのこせます。" : "まだ記録がありません。チャレンジしてみよう！"; elements.historyList.replaceChildren(empty); return; }
  elements.historyList.replaceChildren(...results.map((result) => {
    const article = document.createElement("article"); article.className = "history-item"; const header = document.createElement("div"); header.className = "history-item-header";
    const mode = document.createElement("span"); mode.className = "history-mode"; mode.textContent = result.mode === "complete" ? "最後までチャレンジ" : "時間チャレンジ";
    const date = document.createElement("time"); date.className = "history-date"; date.dateTime = result.date; date.textContent = formatDate(result.date); header.append(mode, date);
    const summary = document.createElement("p"); summary.className = "history-summary";
    summary.textContent = result.mode === "complete" ? `1〜${result.maxNumber}　${Number(result.elapsedSeconds).toFixed(1)}秒　ミス ${result.mistakes}回` : `1〜${result.maxNumber}・${result.timeLimit}秒　${result.correctCount}こ（到達 ${result.reachedNumber}）　ミス ${result.mistakes}回`;
    const details = document.createElement("p"); details.className = "history-details"; const sizeLabel = { small: "小", medium: "中", large: "大" }[result.numberSize] || result.numberSize;
    details.textContent = `${result.gridSize}マス・数字 ${sizeLabel}・${result.tileDisplay === "change" ? "色を変える" : "元に戻す"}`; article.append(header, summary, details); return article;
  }));
}
function openHistory(returnPanel) { state.historyReturnPanel = returnPanel; renderHistory(); showOnly(elements.historyPanel); elements.closeHistoryButton.focus(); }
function closeHistory() { showOnly(state.historyReturnPanel || elements.settingsPanel); }
function deleteHistory() {
  const nickname = elements.nicknameSelect.value || state.nickname; if (!nickname || nickname === GUEST) return;
  if (!confirm(`${nickname}さんの履歴をすべて削除しますか？\nこの操作は元に戻せません。`)) return;
  writeJson(STORAGE_KEYS.results, getResults().filter((item) => item.nickname !== nickname)); renderHistory();
}
function setFocusedIndex(index, shouldFocus = true) {
  const cells = [...elements.numberGrid.querySelectorAll(".number-cell")]; if (!cells.length) return; state.focusedIndex = Math.max(0, Math.min(index, cells.length - 1));
  cells.forEach((cell, cellIndex) => { cell.tabIndex = cellIndex === state.focusedIndex ? 0 : -1; cell.classList.toggle("keyboard-focus", cellIndex === state.focusedIndex); });
  if (shouldFocus) cells[state.focusedIndex].focus({ preventScroll: true });
}
function handleGridKeyboard(event) {
  if (!state.playing) return;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault(); const row = Math.floor(state.focusedIndex / state.columns), column = state.focusedIndex % state.columns; let next = state.focusedIndex;
    if (event.key === "ArrowLeft" && column > 0) next -= 1; if (event.key === "ArrowRight" && column < state.columns - 1 && next + 1 < state.maxNumber) next += 1;
    if (event.key === "ArrowUp" && row > 0) next -= state.columns; if (event.key === "ArrowDown" && next + state.columns < state.maxNumber) next += state.columns; setFocusedIndex(next);
  } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); chooseCell(elements.numberGrid.querySelectorAll(".number-cell")[state.focusedIndex]); }
}

elements.modeInputs.forEach((input) => input.addEventListener("change", updateModeSetting)); elements.numberRange.addEventListener("change", syncGridToRange);
elements.soundEnabled.addEventListener("change", () => { elements.soundLabel.textContent = elements.soundEnabled.checked ? "あり" : "なし"; });
elements.tileDisplay.addEventListener("change", () => { elements.tileDisplayHelp.textContent = elements.tileDisplay.value === "change" ? "押した数字が分かります" : "手がかりを残さず探します"; });
elements.nicknameSelect.addEventListener("change", () => { state.nickname = elements.nicknameSelect.value; localStorage.setItem(STORAGE_KEYS.selected, state.nickname); });
elements.addNicknameButton.addEventListener("click", openNicknameDialog); elements.nicknameForm.addEventListener("submit", addNickname); elements.cancelNicknameButton.addEventListener("click", () => elements.nicknameDialog.close());
elements.startButton.addEventListener("click", startGame); elements.retryButton.addEventListener("click", startGame); elements.playAgainButton.addEventListener("click", startGame);
elements.backToSettingsButton.addEventListener("click", () => { stopTimer(); showOnly(elements.settingsPanel); elements.startButton.focus(); });
elements.historyButton.addEventListener("click", () => openHistory(elements.settingsPanel)); elements.resultHistoryButton.addEventListener("click", () => openHistory(elements.resultPanel));
elements.closeHistoryButton.addEventListener("click", closeHistory); elements.deleteHistoryButton.addEventListener("click", deleteHistory); elements.numberGrid.addEventListener("keydown", handleGridKeyboard);

renderNicknames(); updateModeSetting(); syncGridToRange();
