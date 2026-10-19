import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidatePairs,
  normalizeGroup,
  pickPairFromCurrentPools,
  refillPool,
} from "../pairing.js";

function createState(male, female, overrides = {}) {
  return {
    activeMale: normalizeGroup(male, "male"),
    activeFemale: normalizeGroup(female, "female"),
    usedPairs: new Set(),
    pairHistory: [],
    roundSpinCount: 0,
    ...overrides,
  };
}

test("null, blank, and invalid optional numbers stay unset", () => {
  const entries = normalizeGroup([
    { name: "Null", priority: null, exclusiveID: null },
    { name: "Blank", priority: "", exclusiveID: " " },
    { name: "Invalid", priority: false, exclusiveID: [] },
    { name: "Missing" },
  ], "male");

  assert.equal(new Set(entries.map((entry) => entry.priority)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.priority >= 1);
    assert.equal(entry.exclusiveID, null);
  }
});

test("explicit zeroes and numeric strings retain their meaning", () => {
  const [zero, numeric] = normalizeGroup([
    { name: "Zero", priority: 0, exclusiveID: 0 },
    { name: "Numeric", priority: "3", exclusiveID: "12" },
  ], "male");

  assert.equal(zero.priority, 0);
  assert.equal(zero.exclusiveID, 0);
  assert.equal(numeric.priority, 3);
  assert.equal(numeric.exclusiveID, 12);
});

test("duplicate and generated IDs remain unique", () => {
  const entries = normalizeGroup([
    { name: "First", id: "same" },
    { name: "Second", id: "same" },
    { name: "Third", id: "same:1" },
    { name: "Fourth", id: "male:4" },
    { name: "Fifth" },
  ], "male");

  assert.equal(entries.length, 5);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 5);
  assert.equal(entries[0].id, "same");
});

test("selection removes one participant per pool without mutating input", () => {
  const state = createState([
    { name: "First", id: "same" },
    { name: "Second", id: "same" },
  ], [{ name: "Partner" }]);
  const result = pickPairFromCurrentPools(state);

  assert.ok(result.pair);
  assert.equal(result.male.length, 1);
  assert.equal(result.female.length, 0);
  assert.notEqual(result.male[0].id, result.pair.male.id);
  assert.equal(result.usedPairs.size, 1);
  assert.equal(result.pairHistory.length, 1);
  assert.equal(state.activeMale.length, 2);
  assert.equal(state.activeFemale.length, 1);
  assert.equal(state.usedPairs.size, 0);
  assert.equal(state.pairHistory.length, 0);
});

test("forced pairs use the current round count while history is retained", () => {
  const state = createState([
    { name: "Forced male", priority: 1, exclusiveID: 12 },
    { name: "Other male" },
  ], [
    { name: "Forced female", priority: 1, exclusiveID: 12 },
    { name: "Other female" },
  ], { pairHistory: Array.from({ length: 12 }, () => ({})) });
  const result = pickPairFromCurrentPools(state);

  assert.equal(result.pair.male.name, "Forced male");
  assert.equal(result.pair.female.name, "Forced female");
  assert.equal(result.pairHistory.length, 13);
});

test("locked pairs remain reserved until their configured spin", () => {
  const state = createState([
    { name: "Reserved male", priority: 3, exclusiveID: 12 },
  ], [{ name: "Reserved female", priority: 3, exclusiveID: 12 }]);

  assert.equal(buildCandidatePairs(state).pairs.length, 0);
  state.roundSpinCount = 2;
  assert.equal(buildCandidatePairs(state).forcedPairs.length, 1);
  state.roundSpinCount = 3;
  assert.equal(buildCandidatePairs(state).pairs.length, 0);
});

test("legacy callers can still derive spin order from history", () => {
  const state = createState([
    { name: "Male", priority: 2, exclusiveID: 12 },
  ], [{ name: "Female", priority: 2, exclusiveID: 12 }], { pairHistory: [{}] });
  delete state.roundSpinCount;

  assert.equal(buildCandidatePairs(state).forcedPairs.length, 1);
});

test("excluded participants and previously used pairs stay ineligible", () => {
  const state = createState([
    { name: "Male", id: "m" },
    { name: "Excluded", excluded: true },
  ], [{ name: "Female", id: "f" }], { usedPairs: new Set(["m::f"]) });
  state.activeMale = refillPool(state.activeMale);
  const result = pickPairFromCurrentPools(state);

  assert.equal(state.activeMale.length, 1);
  assert.equal(result.pair, null);
  assert.equal(result.reason, "used_pairs_exhausted");
});
