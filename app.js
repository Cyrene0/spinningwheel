import { CONFIG } from "./config.js";
import {
  applyTheme,
  createWheelPalettes,
  getStoredThemeBaseColor,
  getThemeColor,
  storeThemeBaseColor,
} from "./theme.js";
import {
  buildCandidatePairs,
  ensurePoolsForSpin,
  isEitherPoolBelowThreshold,
  normalizeGroup,
  pickPairFromCurrentPools,
  refillPool,
} from "./pairing.js";
import { Wheel, wheelRotationForWinner } from "./wheel.js";
import { createElements, createUiController, renderResult, renderStatus } from "./ui.js";
import { validateRoster } from "./roster.js";

const state = {
  allMale: [],
  allFemale: [],
  activeMale: [],
  activeFemale: [],
  displayEntries: null,
  current: { male: null, female: null },
  spinning: false,
  loading: true,
  usedPairs: new Set(),
  pairHistory: [],
  roundSpinCount: 0,
  roundState: null,
  settings: {
    spinDurationMs: CONFIG.settings.defaultSpinDurationMs,
    recentCount: CONFIG.settings.defaultRecentCount,
    allowRespin: CONFIG.settings.defaultAllowRespin,
  },
  theme: null,
  pendingSpin: null,
};

const elements = createElements();

const themeRuntime = {
  base: CONFIG.theme.defaultBase,
  palettes: createWheelPalettes(CONFIG.theme.defaultBase),
};

const getWheelPalette = (group) => themeRuntime.palettes[group] ?? themeRuntime.palettes.male;

const getCachedThemeColor = (variableName, fallback) => {
  if (variableName === "--theme-base") {
    return themeRuntime.base;
  }
  return getThemeColor(variableName, fallback);
};

const maleWheel = new Wheel(elements.maleCanvas, "male", getWheelPalette, getCachedThemeColor);
const femaleWheel = new Wheel(elements.femaleCanvas, "female", getWheelPalette, getCachedThemeColor);

const ui = createUiController(elements, {
  renderResult: () => renderResult(elements, state),
  setSpinDuration: (nextDuration) => {
    state.settings.spinDurationMs = nextDuration;
    ui.updateSpinDurationLabel(state);
  },
  setRecentCount: (nextCount) => {
    state.settings.recentCount = nextCount;
  },
  setAllowRespin: (allowRespin) => {
    state.settings.allowRespin = allowRespin;
    renderStatus(elements, state);

    if (!state.pendingSpin) {
      return;
    }

    if (!allowRespin) {
      applyAcceptedSpin(state.pendingSpin);
      state.pendingSpin = null;
      toggleResultPopup(false);
      emitParticles();
      renderAll();
      return;
    }

    state.pendingSpin.respinUsed = false;
    showSpinDecisionPopup();
    renderAll();
  },
});

function drawWheels() {
  maleWheel.draw(state.displayEntries?.male ?? state.activeMale);
  femaleWheel.draw(state.displayEntries?.female ?? state.activeFemale);
}

function renderAll() {
  renderResult(elements, state);
  renderStatus(elements, state);
  drawWheels();
}

function applyAndRenderTheme(baseHex) {
  const theme = applyTheme(baseHex, { themeColorInput: elements.themeColorInput });
  state.theme = theme;
  themeRuntime.base = theme.base;
  themeRuntime.palettes = createWheelPalettes(theme.base);
  drawWheels();
  return theme.base;
}

function bindThemeControls() {
  if (elements.themeColorInput) {
    elements.themeColorInput.addEventListener("input", (event) => {
      const appliedBase = applyAndRenderTheme(event.target.value);
      storeThemeBaseColor(appliedBase);
    });
  }

  if (elements.themeResetBtn) {
    elements.themeResetBtn.addEventListener("click", () => {
      const appliedBase = applyAndRenderTheme(CONFIG.theme.defaultBase);
      storeThemeBaseColor(appliedBase);
    });
  }
}

function setPools(nextMale, nextFemale) {
  state.activeMale = nextMale;
  state.activeFemale = nextFemale;
}

function startNewRound(message = "Đã bắt đầu lượt ghép cặp mới.") {
  state.usedPairs = new Set();
  state.roundSpinCount = 0;
  state.displayEntries = null;
  state.current = { male: null, female: null };
  maleWheel.rotation = 0;
  femaleWheel.rotation = 0;
  setPools(refillPool(state.allMale), refillPool(state.allFemale));
  state.roundState = null;
  elements.refillStatus.textContent = message;
}

function updateRoundState(reason) {
  state.roundState = reason
    ? {
      reason,
      requiresConfirmation: reason === "used_pairs_exhausted",
    }
    : null;
}


function updateLiveSpinLabel(element, candidate) {
  if (!element) {
    return;
  }

  element.textContent = candidate?.name ?? "…";
  element.title = candidate?.name ?? "";
}

function toggleResultPopup(open) {
  if (open && !elements.resultPopup.open) elements.resultPopup.showModal();
  if (!open && elements.resultPopup.open) elements.resultPopup.close();
  renderStatus(elements, state);
  if (open) elements.resultKeepBtn.focus();
  else if (!state.spinning && !state.pendingSpin) elements.spinBtn.focus();
}

function emitParticles() {
  if (!elements.particleLayer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  for (let i = 0; i < 24; i += 1) {
    const piece = document.createElement("span");
    piece.className = "particle";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = `hsl(${315 + Math.random() * 70} 95% ${58 + Math.random() * 18}%)`;
    piece.style.animationDelay = `${Math.random() * 130}ms`;
    piece.style.setProperty("--drift", `${-30 + Math.random() * 60}px`);
    elements.particleLayer.append(piece);
    setTimeout(() => piece.remove(), 1400);
  }
}

function applyAcceptedSpin(pending) {
  state.activeMale = pending.picked.male;
  state.activeFemale = pending.picked.female;
  state.usedPairs = pending.picked.usedPairs;
  state.pairHistory = pending.picked.pairHistory;
  state.current = pending.picked.pair;
  state.roundSpinCount += 1;

  if (isEitherPoolBelowThreshold(state)) {
    const nextEnsured = ensurePoolsForSpin(state);
    setPools(nextEnsured.male, nextEnsured.female);
    pending.refillMessages.push(...nextEnsured.messages);
  }

  elements.refillStatus.textContent = pending.refillMessages.join(" • ");
}

function showSpinDecisionPopup() {
  if (!state.pendingSpin) {
    return;
  }

  const { picked, respinUsed } = state.pendingSpin;
  const pairText = `${picked.pair.male.name} + ${picked.pair.female.name}`;
  elements.resultPopupPair.textContent = pairText;

  if (!state.settings.allowRespin) {
    elements.resultPopupHint.textContent = "Đã tắt quay lại.";
    elements.resultRespinBtn.disabled = true;
  } else if (respinUsed) {
    elements.resultPopupHint.textContent = "Đã hết lượt quay lại.";
    elements.resultRespinBtn.disabled = true;
  } else {
    elements.resultPopupHint.textContent = "Được quay lại bạn nữ 1 lần.";
    elements.resultRespinBtn.disabled = false;
  }

  toggleResultPopup(true);
}

async function animatePickedPair(maleEntries, femaleEntries, pickedPair, femaleOnly = false) {
  state.spinning = true;
  state.displayEntries = { male: maleEntries, female: femaleEntries };
  renderStatus(elements, state);
  if (!femaleOnly) elements.maleWheelCard?.classList.add("spinning");
  elements.femaleWheelCard?.classList.add("spinning");

  const femaleFinal = wheelRotationForWinner(femaleEntries, pickedPair.female.id, femaleWheel.rotation);

  const maleDuration = state.settings.spinDurationMs;
  const femaleDuration = Math.max(
    CONFIG.animation.minFemaleDurationMs,
    state.settings.spinDurationMs - CONFIG.animation.femaleDurationOffsetMs,
  );

  await Promise.all([
    !femaleOnly && maleWheel.animateTo(wheelRotationForWinner(maleEntries, pickedPair.male.id, maleWheel.rotation), maleEntries, maleDuration, {
      onTick: (entry) => updateLiveSpinLabel(elements.maleName, entry),
    }),
    femaleWheel.animateTo(femaleFinal, femaleEntries, femaleDuration, {
      onTick: (entry) => updateLiveSpinLabel(elements.femaleName, entry),
    }),
  ]);

  state.current = pickedPair;
  state.spinning = false;
  elements.maleWheelCard?.classList.remove("spinning");
  elements.femaleWheelCard?.classList.remove("spinning");
}

function pickFemaleOnlyRespin(beforePending) {
  const fixedMale = beforePending.picked.pair.male;
  const previousFemale = beforePending.picked.pair.female;
  const replayState = {
    activeMale: [fixedMale],
    activeFemale: beforePending.baseFemale,
    usedPairs: state.usedPairs,
    pairHistory: state.pairHistory,
    roundSpinCount: state.roundSpinCount,
  };

  const { pairs } = buildCandidatePairs(replayState);
  if (!pairs.length) {
    return null;
  }

  const alternatives = pairs.filter((entry) => entry.female.id !== previousFemale.id);
  const candidateList = alternatives.length ? alternatives : pairs;
  const selected = candidateList[Math.floor(Math.random() * candidateList.length)];

  if (!selected) {
    return null;
  }

  return {
    pair: {
      male: fixedMale,
      female: selected.female,
      rank: selected.rank,
    },
    male: beforePending.baseMale.filter((entry) => entry.id !== fixedMale.id),
    female: beforePending.baseFemale.filter((entry) => entry.id !== selected.female.id),
    usedPairs: new Set(state.usedPairs).add(selected.key),
    pairHistory: [...state.pairHistory, { male: fixedMale.name, female: selected.female.name, rank: selected.rank }],
  };
}

async function spinBoth() {
  if (state.loading || state.spinning || state.roundState?.requiresConfirmation || state.pendingSpin) {
    return;
  }

  const ensured = ensurePoolsForSpin(state);
  setPools(ensured.male, ensured.female);
  state.displayEntries = null;
  const refillMessages = [...ensured.messages];

  const maleEntries = [...state.activeMale];
  const femaleEntries = [...state.activeFemale];
  const picked = pickPairFromCurrentPools(state);

  if (!picked.pair) {
    updateRoundState(picked.reason);

    if (picked.reason === "used_pairs_exhausted") {
      elements.pairResult.textContent = "Các cặp hợp lệ trong lượt này đã được chọn hết.";
      elements.refillStatus.textContent = "Nhấn “Bắt đầu lượt mới” để tiếp tục.";
    } else {
      elements.pairResult.textContent = "Chưa có cặp phù hợp với quy tắc ghép.";
      elements.refillStatus.textContent = refillMessages.join(" • ");
    }

    renderStatus(elements, state);
    drawWheels();
    return;
  }

  updateRoundState(null);

  await animatePickedPair(maleEntries, femaleEntries, picked.pair);
  state.pendingSpin = {
    baseMale: maleEntries,
    baseFemale: femaleEntries,
    picked,
    refillMessages,
    respinUsed: !state.settings.allowRespin,
  };

  if (!state.settings.allowRespin) {
    applyAcceptedSpin(state.pendingSpin);
    state.pendingSpin = null;
    renderAll();
    emitParticles();
    return;
  }

  renderAll();
  showSpinDecisionPopup();
}

function resetPools() {
  if (state.loading || state.spinning || state.pendingSpin) return;
  state.pendingSpin = null;
  toggleResultPopup(false);
  startNewRound("Đã làm mới vòng quay và xóa lịch sử ghép cặp.");
  state.pairHistory = [];
  renderAll();
}

async function init() {
  try {
    const response = await fetch("./data/students.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Không tải được danh sách lớp (mã ${response.status}).`);
    }
    const data = validateRoster(await response.json());
    elements.className.textContent = data.className ? `Lớp ${data.className}` : "";
    document.title = `Vòng quay màu hồng${data.className ? " · Lớp " + data.className : ""}`;
    state.allMale = normalizeGroup(data.male, "male");
    state.allFemale = normalizeGroup(data.female, "female");
    if (!refillPool(state.allMale).length || !refillPool(state.allFemale).length) {
      throw new Error("Danh sách cần ít nhất một bạn nam và một bạn nữ có tên hợp lệ.");
    }
    state.usedPairs = new Set();
    state.pairHistory = [];
    setPools(refillPool(state.allMale), refillPool(state.allFemale));
    state.loading = false;
    renderAll();
  } catch (error) {
    const message = error instanceof SyntaxError ? "Tệp danh sách không đúng định dạng JSON."
      : error instanceof TypeError ? "Không tải được danh sách lớp. Hãy thử tải lại trang."
      : error.message;
    elements.pairResult.textContent = `Không thể bắt đầu. ${message}`;
    elements.spinStatus.textContent = "Kiểm tra data/students.json rồi tải lại trang.";
    elements.spinBtn.disabled = true;
    elements.resetBtn.disabled = true;
  }
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);
elements.resultKeepBtn?.addEventListener("click", () => {
  if (!state.pendingSpin) {
    return;
  }

  applyAcceptedSpin(state.pendingSpin);
  state.pendingSpin = null;
  toggleResultPopup(false);
  emitParticles();
  renderAll();
});

elements.resultPopup.addEventListener("cancel", (event) => {
  event.preventDefault();
  elements.resultKeepBtn.click();
});

elements.resultRespinBtn?.addEventListener("click", async () => {
  if (!state.settings.allowRespin || !state.pendingSpin || state.pendingSpin.respinUsed) {
    return;
  }

  const before = state.pendingSpin;
  const repicked = pickFemaleOnlyRespin(before);
  if (!repicked?.pair) {
    state.pendingSpin.respinUsed = true;
    showSpinDecisionPopup();
    return;
  }

  toggleResultPopup(false);
  state.current = { male: repicked.pair.male, female: null };
  updateLiveSpinLabel(elements.maleName, repicked.pair.male);
  updateLiveSpinLabel(elements.femaleName, null);
  await animatePickedPair(before.baseMale, before.baseFemale, repicked.pair, true);

  state.pendingSpin = {
    ...before,
    picked: repicked,
    respinUsed: true,
  };
  renderAll();
  showSpinDecisionPopup();
});

elements.newRoundBtn.addEventListener("click", () => {
  startNewRound();
  renderAll();
});

bindThemeControls();
ui.bindSettingsPanelControls();
ui.bindAdditionalSettings();
ui.syncSettingsInputs(state);
applyAndRenderTheme(getStoredThemeBaseColor() ?? CONFIG.theme.defaultBase);


init();
