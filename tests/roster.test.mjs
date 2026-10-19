import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateRoster } from "../roster.js";

const source = JSON.parse(readFileSync(new URL("../data/students.json", import.meta.url), "utf8"));
const validRoster = () => ({ male: [{ name: "Nam" }], female: [{ name: "Nữ" }] });

test("source roster validates exactly without changing the source", () => {
  const before = JSON.stringify(source);
  const normalized = validateRoster(source);

  assert.deepEqual(normalized, source);
  assert.equal(JSON.stringify(source), before);
  assert.notEqual(normalized, source);
  assert.notEqual(normalized.male, source.male);
  assert.notEqual(normalized.male[0], source.male[0]);
});

test("validation trims names and preserves IDs, exclusions, and extra fields", () => {
  const data = validRoster();
  data.male = [
    { name: "  Nam  ", id: "m1", priority: "3", exclusiveID: "1001", note: "Giữ lại" },
    { name: "Không quay", id: 2, excluded: true },
  ];
  const normalized = validateRoster(data);

  assert.deepEqual(normalized.male, [
    { name: "Nam", id: "m1", priority: 3, exclusiveID: 1001, note: "Giữ lại" },
    { name: "Không quay", id: 2, excluded: true },
  ]);
  assert.equal(data.male[0].name, "  Nam  ");
});

test("optional class name is trimmed and validated", () => {
  const data = { ...validRoster(), className: " 8A1 " };
  assert.equal(validateRoster(data).className, "8A1");
  assert.equal(data.className, " 8A1 ");
  assert.equal("className" in validateRoster({ ...validRoster(), className: " " }), false);
  for (const className of [null, false, 8, [], {}]) {
    assert.throws(() => validateRoster({ ...validRoster(), className }), /Tên lớp/);
  }
});

test("empty optional numbers stay unset and explicit zeroes are retained", () => {
  const data = validRoster();
  data.male[0].priority = " ";
  data.male[0].exclusiveID = null;
  data.female[0].priority = 0;
  data.female[0].exclusiveID = "0";
  const normalized = validateRoster(data);

  assert.deepEqual(normalized.male[0], { name: "Nam" });
  assert.deepEqual(normalized.female[0], { name: "Nữ", priority: 0, exclusiveID: 0 });
});

test("malformed groups and participants are rejected", () => {
  for (const value of [null, false, "list", [], {}, { male: [], female: [] },
    { male: {}, female: [{ name: "Nữ" }] }, { male: [{ name: "Nam" }], female: null }]) {
    assert.throws(() => validateRoster(value), Error);
  }
  for (const entry of [null, [], "Nam", {}, { name: 4 }, { name: "" }, { name: "   " }]) {
    assert.throws(() => validateRoster({ ...validRoster(), male: [entry] }), /tên không để trống/);
  }
});

test("invalid numeric restrictions are rejected instead of discarded", () => {
  for (const field of ["priority", "exclusiveID"]) {
    for (const value of [NaN, Infinity, -Infinity, "abc", true, false, [], {}]) {
      const data = validRoster();
      data.male[0][field] = value;
      assert.throws(() => validateRoster(data), new RegExp(field));
    }
  }
});

test("invalid excluded flags and fully excluded groups are rejected", () => {
  for (const value of [null, 0, 1, "false", "true"]) {
    const data = validRoster();
    data.male[0].excluded = value;
    assert.throws(() => validateRoster(data), /excluded/);
  }
  for (const group of ["male", "female"]) {
    const data = validRoster();
    data[group][0].excluded = true;
    assert.throws(() => validateRoster(data), /không bị loại/);
  }
});

