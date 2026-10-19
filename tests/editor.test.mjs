import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../edit/edit.js", import.meta.url), "utf8");
const roster = JSON.parse(await readFile(new URL("../data/students.json", import.meta.url), "utf8"));

function editor() {
  const elements = new Map();
  const context = vm.createContext({
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { disabled: true, addEventListener() {} });
        return elements.get(id);
      },
      querySelector(selector) {
        return selector === "tbody input:invalid" ? context.invalidInput : {};
      },
    },
    // Keep automatic startup pending; each test controls loading explicitly.
    fetch: () => new Promise(() => {}),
    invalidInput: null,
  });
  vm.runInContext(source, context);
  return { context, elements, run: (code) => vm.runInContext(code, context) };
}

test("existing roster round-trips with all names, priorities and exclusive IDs", () => {
  const { context, run } = editor();
  context.roster = roster;
  const result = JSON.parse(run("JSON.stringify({ male: roster.male.map(normalizeEntry).map(compactEntry), female: roster.female.map(normalizeEntry).map(compactEntry) })"));
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
  context.fetch = async () => ({ ok: true, json: async () => ({ male: [], female: "invalid" }) });
  await context.init();
  assert.equal(elements.get("download-json").disabled, true);
  assert.equal(elements.get("add-male").disabled, true);
  assert.equal(run("state.loaded"), false);
  assert.match(elements.get("status").textContent, /hai mảng male và female/);
});
