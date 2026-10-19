import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { validateRoster } from "../roster.js";
import { computeBlobSha, saveRosterToGitHub } from "../edit/github-save.js";

const source = (await readFile(new URL("../edit/edit.js", import.meta.url), "utf8"))
  .replace(/^import[^\n]+\n/gm, "");
const roster = JSON.parse(await readFile(new URL("../data/students.json", import.meta.url), "utf8"));

function editor() {
  const elements = new Map();
  const rowControls = [];
  function control() {
    return {
      disabled: true, value: "", textContent: "", open: false, children: [], listeners: {}, validity: { valid: true },
      addEventListener(type, listener) { this.listeners[type] = listener; },
      setAttribute() {}, setCustomValidity() {}, focus() {},
      append(...children) { this.children.push(...children); },
      replaceChildren() { this.children = []; },
      showModal() { this.open = true; },
      close() { this.open = false; this.listeners.close?.(); },
    };
  }
  function getElement(id) {
    if (!elements.has(id)) elements.set(id, control());
    return elements.get(id);
  }
  const context = vm.createContext({
    document: {
      getElementById: getElement,
      querySelector(selector) {
        return selector === "tbody input:invalid" ? context.invalidInput : getElement(selector);
      },
      querySelectorAll: () => rowControls,
      createElement(tag) {
        const element = control();
        if (tag === "input" || tag === "button") rowControls.push(element);
        return element;
      },
    },
    // Keep automatic startup pending; each test controls loading explicitly.
    fetch: () => new Promise(() => {}),
    validateRoster,
    computeBlobSha,
    saveRosterToGitHub,
    crypto: webcrypto,
    TextEncoder,
    invalidInput: null,
  });
  vm.runInContext(source, context);
  return { context, elements, rowControls, run: (code) => vm.runInContext(code, context) };
}

function loadEditor() {
  const result = editor();
  result.context.roster = roster;
  result.run('state.className = roster.className; state.male = roster.male.map(normalizeEntry); state.female = roster.female.map(normalizeEntry); state.loaded = true; state.baseSha = "a".repeat(40);');
  return result;
}

test("existing roster round-trips with all names, priorities and exclusive IDs", () => {
  const { context, run } = editor();
  context.roster = roster;
  const result = JSON.parse(run("JSON.stringify({ className: roster.className, male: roster.male.map(normalizeEntry).map(compactEntry), female: roster.female.map(normalizeEntry).map(compactEntry) })"));
  assert.deepEqual(result, roster);
});

test("numeric zero and fractional values survive; empty optional fields stay omitted", () => {
  const { run } = editor();
  assert.equal(run('JSON.stringify(compactEntry(normalizeEntry({ name: " An ", priority: 0, exclusiveID: 2.5 })))'), '{"name":"An","priority":0,"exclusiveID":2.5}');
  assert.equal(run('JSON.stringify(compactEntry(normalizeEntry({ name: "An", priority: "", exclusiveID: null })))'), '{"name":"An"}');
});

test("editing and export preserve identity and exclusion metadata", () => {
  const { run } = editor();
  assert.equal(run('JSON.stringify(compactEntry(normalizeEntry({ name: " An ", id: "student-1", excluded: true })))'),
    '{"name":"An","id":"student-1","excluded":true}');
});

test("invalid source data is rejected instead of silently dropping constraints", () => {
  const { run } = editor();
  for (const entry of ['{ name: " " }', '{ name: "An", priority: "bad" }', '{ name: "An", exclusiveID: Infinity }']) {
    assert.throws(() => run(`normalizeEntry(${entry})`));
  }
});

test("exports remain disabled until loaded and while an input is invalid", () => {
  const { context, elements, run } = editor();
  run("renderJsonPreview()");
  assert.equal(elements.get("download-json").disabled, true);
  run("state.loaded = true; renderJsonPreview()");
  assert.equal(elements.get("download-json").disabled, false);
  context.invalidInput = {};
  run("renderJsonPreview()");
  assert.equal(elements.get("download-json").disabled, true);
  assert.equal(elements.get("copy-json").disabled, true);
});

test("failed or malformed loading cannot enable exports or replace the roster", async () => {
  const { context, elements, run } = editor();
  context.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ male: [{ name: "An" }], female: "invalid" }) });
  await context.init();
  assert.equal(elements.get("download-json").disabled, true);
  assert.equal(elements.get("add-male").disabled, true);
  assert.equal(run("state.loaded"), false);
  assert.match(elements.get("status").textContent, /Danh sách bạn nam|Danh sách bạn nữ/);
});

test("loading hashes the exact repository JSON text before normalization", async () => {
  const { context, elements, run } = editor();
  const text = `${JSON.stringify(roster, null, 4)}\n`;
  context.fetch = async (url, options) => {
    assert.equal(url, "../data/students.json");
    assert.equal(options.cache, "no-store");
    return { ok: true, text: async () => text };
  };
  await context.init();
  assert.equal(run("state.baseSha"), await computeBlobSha(text));
  assert.equal(elements.get("class-name-input").value, "8A1");
  assert.equal(run('state.female.some((entry) => entry.name === "Nguyễn Gia Linh")'), true);
});

test("saving locks controls, rejects duplicate submission and updates the base SHA", async () => {
  const { context, elements, rowControls, run } = loadEditor();
  run('renderTable("male"); openSaveDialog()');
  const before = run("JSON.stringify(snapshot())");
  let resolveSave;
  let calls = 0;
  let request;
  context.saveRosterToGitHub = (input) => {
    calls++;
    request = input;
    return new Promise((resolve) => { resolveSave = resolve; });
  };
  elements.get("save-password").value = "test-password";
  const pending = context.saveRoster();
  assert.equal(run("state.saving"), true);
  assert.ok(rowControls.every((control) => control.disabled));
  for (const id of ["save-roster", "copy-json", "download-json", "add-male", "class-name-input", "cancel-save", "confirm-save"]) {
    assert.equal(elements.get(id).disabled, true, id);
  }
  assert.equal(elements.get("save-password").value, "");
  await context.saveRoster();
  run('addRow("male")');
  assert.equal(calls, 1);
  assert.equal(run("JSON.stringify(snapshot())"), before);
  assert.equal(request.sha, "a".repeat(40));
  resolveSave({ sha: "b".repeat(40) });
  await pending;
  assert.equal(run("state.baseSha"), "b".repeat(40));
  assert.equal(run("state.saving"), false);
  assert.equal(request.password, "");
  assert.equal(elements.get("save-dialog").open, false);
  assert.equal(elements.get("status").textContent, "Đã lưu. Chờ trang cập nhật.");
  assert.equal(elements.get("save-roster").disabled, false);
});

test("wrong password preserves edits and dialog while clearing credentials", async () => {
  const { context, elements, run } = loadEditor();
  run("openSaveDialog()");
  const before = run("JSON.stringify(snapshot())");
  context.saveRosterToGitHub = async () => { throw Object.assign(new Error("Sai mật khẩu."), { status: 401 }); };
  elements.get("save-password").value = "wrong-test-password";
  await context.saveRoster();
  assert.equal(run("JSON.stringify(snapshot())"), before);
  assert.equal(run("state.baseSha"), "a".repeat(40));
  assert.equal(elements.get("save-dialog").open, true);
  assert.equal(elements.get("save-password").value, "");
  assert.equal(elements.get("save-error").textContent, "Sai mật khẩu.");
  assert.equal(elements.get("cancel-save").disabled, false);
});

test("cancel clears the password and never sends a request", () => {
  const { context, elements, run } = loadEditor();
  context.saveRosterToGitHub = () => assert.fail("Cancel must not save");
  run("openSaveDialog()");
  elements.get("save-password").value = "test-password";
  elements.get("cancel-save").listeners.click();
  assert.equal(elements.get("save-password").value, "");
  assert.equal(elements.get("save-dialog").open, false);
});
