import assert from "node:assert/strict";
import test from "node:test";
import { Wheel, wheelRotationForWinner } from "../wheel.js";

const TWO_PI = Math.PI * 2;
const colors = {
  text: "#231330", empty: "#fff", border: "#ddd", centerFill: "#fff", centerStroke: "#ddd",
};

function createContext() {
  const labels = [];
  const stack = [];
  return {
    labels, rotation: 0, font: "", textAlign: "", textBaseline: "",
    beginPath() {}, moveTo() {}, arc() {}, closePath() {}, fill() {}, stroke() {},
    clearRect() {}, translate() {}, drawImage() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    save() {
      stack.push({ rotation: this.rotation, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline });
    },
    restore() { Object.assign(this, stack.pop()); },
    rotate(angle) { this.rotation += angle; },
    measureText(text) { return { width: String(text).length * Number.parseFloat(this.font.slice(5)) * 0.53 }; },
    fillText(text) {
      labels.push({ text, rotation: this.rotation, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline });
    },
  };
}

function createWheel() {
  const ctx = createContext();
  return new Wheel({ width: 440, height: 440, getContext: () => ctx }, "female", () => ["#fff"], (_, fallback) => fallback);
}

function replaceGlobal(t, key, value) {
  const original = globalThis[key];
  globalThis[key] = value;
  t.after(() => {
    if (original === undefined) delete globalThis[key];
    else globalThis[key] = original;
  });
}

test("renaming an entry invalidates the wheel surface cache", () => {
  const wheel = createWheel();
  const entries = [{ id: "same", name: "Before" }];
  const key = wheel.cacheKey(entries, false, ["#fff"], colors, 20);
  entries[0].name = "After";
  assert.notEqual(wheel.cacheKey(entries, false, ["#fff"], colors, 20), key);
});

test("22 and 32 entry wheels have readable fonts and radial label space", () => {
  const wheel = createWheel();
  for (const [count, minimumFont, minimumWidth] of [[22, 16, 120], [32, 14, 100]]) {
    const font = wheel.getLabelFontSize(count);
    assert.ok(font >= minimumFont);
    assert.ok(wheel.getMaxLabelWidth(220, TWO_PI / count, font) >= minimumWidth);
  }
  wheel.canvas.width = 880;
  assert.equal(wheel.getLabelFontSize(32), 30);
});

test("dense wheel labels follow the radius, remain upright, and retain given-name context", (t) => {
  const wheel = createWheel();
  const ctx = createContext();
  replaceGlobal(t, "document", { createElement: () => ({ getContext: () => ctx }) });
  const entries = Array.from({ length: 32 }, (_, id) => ({ id, name: "Nguyễn Phạm Hồng Hạnh" }));
  wheel.buildSurface(entries, false, ["#fff"], colors, wheel.getLabelFontSize(entries.length));

  assert.equal(ctx.labels.length, entries.length);
  assert.ok(Math.abs(ctx.labels[0].rotation - Math.PI / 32) < 1e-10);
  assert.equal(ctx.labels[0].textAlign, "right");
  assert.equal(ctx.labels[16].textAlign, "left");
  for (const label of ctx.labels) {
    assert.equal(label.text, "Hồng Hạnh");
    assert.equal(label.textBaseline, "middle");
    assert.ok(Math.cos(label.rotation) >= 0);
  }
});

test("long labels truncate within their available width", () => {
  const wheel = createWheel();
  const ctx = createContext();
  ctx.font = "bold 15px Segoe UI";
  const label = wheel.truncateLabelToWidth("Averylongunbrokenname", ctx, 90);
  assert.ok(label.endsWith("…"));
  assert.ok(ctx.measureText(label).width <= 90);
});

test("every winner still aligns with the pointer after either direction of rotation", () => {
  const wheel = createWheel();
  for (const count of [1, 22, 32]) {
    const entries = Array.from({ length: count }, (_, id) => ({ id, name: `Entry ${id}` }));
    for (const rotation of [-13, 0, 450]) {
      for (const entry of entries) {
        const finalRotation = wheelRotationForWinner(entries, entry.id, rotation);
        assert.ok(finalRotation > rotation);
        assert.equal(wheel.getEntryAtPointer(entries, finalRotation), entry);
      }
    }
  }
});

test("reduced motion draws the final winner and emits one completed tick without animation frames", async (t) => {
  replaceGlobal(t, "matchMedia", (query) => {
    assert.equal(query, "(prefers-reduced-motion: reduce)");
    return { matches: true };
  });
  replaceGlobal(t, "requestAnimationFrame", () => assert.fail("Reduced motion must not schedule frames"));
  const wheel = createWheel();
  const entries = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const drawn = [];
  const ticks = [];
  wheel.draw = (items) => drawn.push(items);
  const finalRotation = wheelRotationForWinner(entries, "b", wheel.rotation);
  await wheel.animateTo(finalRotation, entries, 3600, { onTick: (entry, progress) => ticks.push([entry, progress]) });

  assert.deepEqual(drawn, [entries]);
  assert.deepEqual(ticks, [[entries[1], 1]]);
  assert.ok(wheel.rotation >= 0 && wheel.rotation < TWO_PI);
});

test("regular animation still completes at the selected winner", async (t) => {
  replaceGlobal(t, "matchMedia", () => ({ matches: false }));
  replaceGlobal(t, "requestAnimationFrame", (frame) => frame(performance.now() + 100));
  const wheel = createWheel();
  const entries = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const ticks = [];
  wheel.draw = () => {};
  await wheel.animateTo(wheelRotationForWinner(entries, "a", wheel.rotation), entries, 1, {
    onTick: (entry, progress) => ticks.push([entry, progress]),
  });
  assert.equal(wheel.getEntryAtPointer(entries), entries[0]);
  assert.deepEqual(ticks.at(-1), [entries[0], 1]);
});
