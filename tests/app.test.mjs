import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { CONFIG } from "../config.js";
import * as pairing from "../pairing.js";
import { Wheel, wheelRotationForWinner } from "../wheel.js";
import { validateRoster } from "../roster.js";

const source = (await readFile(new URL("../app.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/\ninit\(\);\s*$/, "");

function createApp({ sourceRoster = null } = {}) {
  const requests = [];
  const nodes = new Map();
  const elements = new Proxy({}, {
    get(_, key) {
      if (!nodes.has(key)) {
        const listeners = new Map();
        const classes = new Set();
        nodes.set(key, {
          textContent: "", open: false,
          classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
          addEventListener: (event, callback) => listeners.set(event, callback),
          click() { return listeners.get("click")?.(); },
          focus() {}, showModal() { this.open = true; }, close() { this.open = false; },
        });
      }
      return nodes.get(key);
    },
  });
  class MockWheel {
    constructor() { this.rotation = 0; this.animations = []; }
    draw(entries) { this.displayed = entries; }
    getEntryAtPointer(entries) { return Wheel.prototype.getEntryAtPointer.call(this, entries); }
    async animateTo(rotation, entries, _, { onTick }) {
      this.rotation = rotation;
      this.animations.push(entries);
      this.draw(entries);
      onTick(this.getEntryAtPointer(entries));
    }
  }
  const context = vm.createContext({
    CONFIG, ...pairing, Wheel: MockWheel, wheelRotationForWinner,
    createElements: () => elements,
    createUiController: () => ({
      updateSpinDurationLabel() {}, bindSettingsPanelControls() {}, bindAdditionalSettings() {}, syncSettingsInputs() {},
    }),
    renderResult() {},
    renderStatus: (_, state) => {
      elements.malePoolStatus.textContent = String(state.activeMale.length);
      elements.femalePoolStatus.textContent = String(state.activeFemale.length);
    },
    applyTheme: (base) => ({ base }), createWheelPalettes: () => ({ male: ["#fff"], female: ["#fff"] }),
    getStoredThemeBaseColor: () => null, getThemeColor: (_, fallback) => fallback, storeThemeBaseColor() {},
    window: { matchMedia: () => ({ matches: true }) },
    document: { title: "" },
    validateRoster,
    localStorage: { getItem() { throw new Error("Roster must use the project JSON"); } },
    fetch: async (url, options) => {
      requests.push({ url, cache: options.cache });
      if (!sourceRoster) throw new Error("Unexpected roster fetch");
      return { ok: true, json: async () => sourceRoster };
    },
  });
  vm.runInContext(source + "\nglobalThis.app = { state, maleWheel, femaleWheel, spinBoth, startNewRound, resetPools, renderAll, applyAndRenderTheme, init };", context);
  const app = context.app;
  app.elements = elements;
  app.requests = requests;
  for (const group of ["Male", "Female"]) {
    app.state[`all${group}`] = pairing.normalizeGroup(Array.from({ length: 4 }, (_, id) => ({
      id: `${group}-${id}`, name: `${group} ${id}`, priority: 0,
    })), group.toLowerCase());
    app.state[`active${group}`] = [...app.state[`all${group}`]];
  }
  app.state.loading = false;
  return app;
}

test("the project JSON supplies the participants and class name", async () => {
  const data = { className: "8A1", male: [{name:"An"}], female: [{name:"Nguyễn Gia Linh"}] };
  const app = createApp({ sourceRoster: data });
  await app.init();
  assert.equal(app.state.allFemale[0].name, "Nguyễn Gia Linh");
  assert.equal(app.elements.className.textContent, "Lớp 8A1");
  assert.deepEqual(app.requests, [{ url: "./data/students.json", cache: "no-store" }]);
  assert.equal(app.state.loading, false);
});

test("a failed JSON fetch blocks spinning instead of using a browser roster", async () => {
  const app = createApp();
  await app.init();
  assert.equal(app.elements.spinBtn.disabled, true);
  assert.equal(app.elements.resetBtn.disabled, true);
  assert.match(app.elements.pairResult.textContent, /Không thể bắt đầu/);
});

function assertDisplayedWinners(app) {
  assert.equal(app.maleWheel.getEntryAtPointer(app.maleWheel.displayed), app.state.current.male);
  assert.equal(app.femaleWheel.getEntryAtPointer(app.femaleWheel.displayed), app.state.current.female);
}

test("confirmed results preserve the winner slices while remaining counts decrease", async () => {
  for (const allowRespin of [false, true]) {
    const app = createApp();
    app.state.settings.allowRespin = allowRespin;
    await app.spinBoth();
    if (allowRespin) app.elements.resultKeepBtn.click();

    assert.equal(app.state.pendingSpin, null);
    assert.equal(app.state.activeMale.length, 3);
    assert.equal(app.state.activeFemale.length, 3);
    assert.equal(app.elements.malePoolStatus.textContent, "3");
    assert.equal(app.elements.femalePoolStatus.textContent, "3");
    assert.equal(app.maleWheel.displayed.length, 4);
    assert.equal(app.femaleWheel.displayed.length, 4);
    assertDisplayedWinners(app);
    app.applyAndRenderTheme("#de6576");
    assertDisplayedWinners(app);

    await app.spinBoth();
    assert.equal(app.maleWheel.displayed.length, 3);
    assert.equal(app.femaleWheel.displayed.length, 3);
  }
});

test("female reroll leaves the original male wheel and pointer untouched", async () => {
  const app = createApp();
  await app.spinBoth();
  const originalMale = app.state.current.male;
  const originalFemale = app.state.current.female;
  const originalRotation = app.maleWheel.rotation;
  const originalEntries = app.maleWheel.displayed;

  await app.elements.resultRespinBtn.click();
  assert.equal(app.maleWheel.animations.length, 1);
  assert.equal(app.femaleWheel.animations.length, 2);
  assert.equal(app.maleWheel.rotation, originalRotation);
  assert.equal(app.maleWheel.displayed, originalEntries);
  assert.equal(app.state.current.male, originalMale);
  assert.notEqual(app.state.current.female, originalFemale);
  assertDisplayedWinners(app);

  app.elements.resultKeepBtn.click();
  assertDisplayedWinners(app);
  assert.equal(app.state.activeMale.length, 3);
  assert.equal(app.state.pairHistory.length, 1);
});

test("new rounds clear displayed winners and reset clears history", async () => {
  const app = createApp();
  app.state.settings.allowRespin = false;
  await app.spinBoth();
  app.startNewRound();
  app.renderAll();
  assert.equal(app.state.displayEntries, null);
  assert.equal(app.state.current.male, null);
  assert.equal(app.state.current.female, null);
  assert.equal(app.maleWheel.rotation, 0);
  assert.equal(app.femaleWheel.rotation, 0);
  assert.equal(app.maleWheel.displayed, app.state.activeMale);
  assert.equal(app.femaleWheel.displayed, app.state.activeFemale);
  assert.equal(app.state.pairHistory.length, 1);

  app.resetPools();
  assert.equal(app.state.pairHistory.length, 0);
  assert.equal(app.state.displayEntries, null);
});
