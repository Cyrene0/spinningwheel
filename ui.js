import { CONFIG } from "./config.js";
import { clamp } from "./theme.js";

export function createElements() {
  const ids = {
    spinBtn: "spin-btn", resetBtn: "reset-btn", spinStatus: "spin-status",
    settingsBtn: "settings-btn", settingsCloseBtn: "settings-close-btn", settingsPanel: "settings-panel",
    themeColorInput: "theme-color", themeResetBtn: "theme-reset-btn",
    spinDurationRange: "spin-duration-range", spinDurationValue: "spin-duration-value",
    historyCountInput: "history-count-input", allowRespinInput: "allow-respin-input",
    maleCanvas: "male-wheel", femaleCanvas: "female-wheel",
    maleWheelCard: "male-wheel-card", femaleWheelCard: "female-wheel-card",
    maleName: "male-name", femaleName: "female-name",
    malePoolStatus: "male-pool-status", femalePoolStatus: "female-pool-status",
    pairResult: "pair-result", pairMeta: "pair-meta", pairCount: "pair-count",
    historySection: "history-section", refillStatus: "refill-status", newRoundBtn: "new-round-btn",
    particleLayer: "particle-layer", resultPopup: "result-popup",
    resultPopupMessage: "result-popup-message", resultPopupPair: "result-popup-pair",
    resultPopupHint: "result-popup-hint", resultKeepBtn: "result-keep-btn", resultRespinBtn: "result-respin-btn",
  };
  return Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)]));
}

export function createUiController(elements, { renderResult, setSpinDuration, setRecentCount, setAllowRespin }) {
  function updateSpinDurationLabel(state) {
    elements.spinDurationValue.textContent = (state.settings.spinDurationMs / 1000).toLocaleString("vi-VN", {
      minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + " giây";
  }

  function syncSettingsInputs(state) {
    elements.spinDurationRange.value = String(state.settings.spinDurationMs);
    elements.historyCountInput.value = String(state.settings.recentCount);
    elements.allowRespinInput.checked = state.settings.allowRespin;
    updateSpinDurationLabel(state);
  }

  function bindSettingsPanelControls() {
    elements.settingsBtn.addEventListener("click", () => {
      elements.settingsPanel.showModal();
      elements.settingsBtn.setAttribute("aria-expanded", "true");
    });
    elements.settingsCloseBtn.addEventListener("click", () => elements.settingsPanel.close());
    elements.settingsPanel.addEventListener("close", () => {
      elements.settingsBtn.setAttribute("aria-expanded", "false");
      elements.settingsBtn.focus();
    });
  }

  function bindAdditionalSettings() {
    elements.spinDurationRange.addEventListener("input", (event) => {
      setSpinDuration(clamp(Number(event.target.value), CONFIG.settings.minSpinDurationMs, CONFIG.settings.maxSpinDurationMs));
    });
    elements.historyCountInput.addEventListener("change", (event) => {
      const count = clamp(Math.round(Number(event.target.value)) || CONFIG.settings.defaultRecentCount,
        CONFIG.settings.minHistoryCount, CONFIG.settings.maxHistoryCount);
      setRecentCount(count);
      event.target.value = String(count);
      renderResult();
    });
    elements.allowRespinInput.addEventListener("change", (event) => setAllowRespin(event.target.checked));
  }

  return { updateSpinDurationLabel, syncSettingsInputs, bindSettingsPanelControls, bindAdditionalSettings };
}

export function getRoundStateMessage(roundState) {
  if (!roundState) return "";
  return roundState.reason === "used_pairs_exhausted"
    ? "Các cặp hợp lệ trong lượt này đã được chọn hết."
    : "Chưa có cặp phù hợp với quy tắc ghép. Hãy kiểm tra danh sách lớp.";
}

export function renderResult(elements, state) {
  elements.maleName.textContent = state.current.male?.name ?? "Chưa chọn";
  elements.femaleName.textContent = state.current.female?.name ?? "Chưa chọn";
  elements.maleName.title = state.current.male?.name ?? "";
  elements.femaleName.title = state.current.female?.name ?? "";
  const latest = state.current.male && state.current.female
    ? state.current.male.name + " + " + state.current.female.name
    : "Nhấn “Quay ghép cặp” để chọn cặp tặng quà.";
  elements.pairResult.textContent = latest;
  elements.pairCount.textContent = state.pairHistory.length ? state.pairHistory.length + " cặp đã ghép" : "Chưa có cặp nào";
  const recent = state.pairHistory.slice(-state.settings.recentCount).reverse();
  elements.pairMeta.replaceChildren(...recent.map((pair) => {
    const row = document.createElement("li");
    row.textContent = pair.male + " + " + pair.female;
    return row;
  }));
  elements.historySection.hidden = recent.length === 0;
}

export function renderStatus(elements, state) {
  const requiresConfirmation = Boolean(state.roundState?.requiresConfirmation);
  const busy = state.loading || state.spinning || Boolean(state.pendingSpin);
  elements.malePoolStatus.textContent = "Còn " + state.activeMale.length + " bạn";
  elements.femalePoolStatus.textContent = "Còn " + state.activeFemale.length + " bạn";
  elements.spinBtn.disabled = busy || requiresConfirmation;
  elements.resetBtn.disabled = busy;
  elements.settingsBtn.disabled = state.spinning || Boolean(state.pendingSpin);
  elements.spinBtn.textContent = state.spinning ? "Đang quay…" : "Quay ghép cặp ↗";
  elements.spinStatus.textContent = state.loading ? "Đang tải danh sách lớp…"
    : state.spinning ? "Cùng chờ xem hai cái tên được chọn nhé."
    : state.pendingSpin ? "Giữ kết quả hoặc quay lại bạn nữ một lần."
    : requiresConfirmation ? "Bắt đầu lượt mới để tiếp tục ghép cặp."
    : "Mỗi kết quả được phép quay lại bạn nữ một lần.";
  elements.newRoundBtn.hidden = !requiresConfirmation;
  const message = getRoundStateMessage(state.roundState);
  if (message) elements.refillStatus.textContent = message;
}
