import assert from "node:assert/strict";
import test from "node:test";
import { createUiController, renderResult, renderStatus } from "../ui.js";

function fixture() {
  const node = () => ({ textContent: "", disabled: false, hidden: false, title: "", value: "", checked: false,
    listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
    setAttribute(name, value) { this[name] = value; },
    showModal() { this.open = true; }, close() { this.open = false; this.listeners.close?.(); },
    focus() { this.focused = true; }, replaceChildren(...children) { this.children = children; } });
  const elements = Object.fromEntries(["maleName", "femaleName", "pairResult", "pairMeta", "pairCount",
    "historySection", "malePoolStatus", "femalePoolStatus", "spinBtn", "resetBtn", "settingsBtn",
    "spinStatus", "newRoundBtn", "refillStatus", "settingsPanel", "settingsCloseBtn"].map(key => [key, node()]));
  const state = { current: { male: null, female: null }, pairHistory: [], activeMale: [], activeFemale: [],
    loading: false, spinning: false, pendingSpin: null, roundState: null, settings: { recentCount: 3, allowRespin: true } };
  return { elements, state };
}

test("loading, animation and pending decisions block spin and reset", () => {
  for (const field of ["loading", "spinning", "pendingSpin"]) {
    const { elements, state } = fixture();
    state[field] = field === "pendingSpin" ? {} : true;
    renderStatus(elements, state);
    assert.equal(elements.spinBtn.disabled, true, field);
    assert.equal(elements.resetBtn.disabled, true, field);
  }
});

test("round exhaustion requires an explicit new round and preserves reset access", () => {
  const { elements, state } = fixture();
  state.roundState = { reason: "used_pairs_exhausted", requiresConfirmation: true };
  renderStatus(elements, state);
  assert.equal(elements.spinBtn.disabled, true);
  assert.equal(elements.resetBtn.disabled, false);
  assert.equal(elements.newRoundBtn.hidden, false);
  assert.match(elements.refillStatus.textContent, /đã được chọn hết/);
});

test("history shows newest accepted pairs first as text and clears on reset", () => {
  const { elements, state } = fixture();
  globalThis.document = { createElement: () => ({ textContent: "" }) };
  try {
    state.pairHistory = [{ male: "An", female: "Bình" }, { male: "<b>Châu</b>", female: "Dương" }];
    state.settings.recentCount = 1;
    renderResult(elements, state);
    assert.deepEqual(elements.pairMeta.children.map(row => row.textContent), ["<b>Châu</b> + Dương"]);
    assert.equal(elements.historySection.hidden, false);
    assert.equal(elements.pairCount.textContent, "2 cặp đã ghép");
    state.pairHistory = [];
    renderResult(elements, state);
    assert.equal(elements.historySection.hidden, true);
    assert.equal(elements.pairMeta.children.length, 0);
  } finally { delete globalThis.document; }
});

test("settings use native modal opening and restore focus after close", () => {
  const { elements } = fixture();
  createUiController(elements, {}).bindSettingsPanelControls();
  elements.settingsBtn.listeners.click();
  assert.equal(elements.settingsPanel.open, true);
  assert.equal(elements.settingsBtn["aria-expanded"], "true");
  elements.settingsCloseBtn.listeners.click();
  assert.equal(elements.settingsPanel.open, false);
  assert.equal(elements.settingsBtn["aria-expanded"], "false");
  assert.equal(elements.settingsBtn.focused, true);
});

test("the hint reflects disabled respins", () => {
  const { elements, state } = fixture();
  state.settings.allowRespin = false;
  renderStatus(elements, state);
  assert.match(elements.spinStatus.textContent, /xác nhận ngay/);
});
