import { CONFIG } from "./config.js";

function shortName(name) {
  const tokens = String(name).trim().split(/\s+/).filter(Boolean);
  return tokens.slice(-2).join(" ");
}

export class Wheel {
  constructor(canvas, group, getPalette, getThemeColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.group = group;
    this.rotation = 0;
    this.getPalette = getPalette;
    this.getThemeColor = getThemeColor;
    this.surfaceCache = new Map();
  }

  cacheKey(entries, skipLabels, palette, colors, fontSize) {
    const labels = JSON.stringify(entries.map((entry) => [entry.id, entry.name]));
    return [
      labels,
      entries.length,
      skipLabels ? "1" : "0",
      fontSize,
      palette.join(","),
      colors.text,
      colors.empty,
      colors.border,
      colors.centerFill,
      colors.centerStroke,
    ].join("::");
  }

  buildSurface(entries, skipLabels, palette, colors, fontSize) {
    const surface = document.createElement("canvas");
    surface.width = this.canvas.width;
    surface.height = this.canvas.height;
    const ctx = surface.getContext("2d");
    const radius = surface.width / 2;
    const center = radius;
    const sliceCount = Math.max(entries.length, 1);
    const angleStep = CONFIG.geometry.TWO_PI / sliceCount;

    for (let i = 0; i < sliceCount; i += 1) {
      const start = i * angleStep;
      const end = start + angleStep;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      ctx.fillStyle = entries.length ? palette[i % palette.length] : colors.empty;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      const gloss = ctx.createRadialGradient(center, center, radius * 0.2, center, center, radius * 0.98);
      gloss.addColorStop(0, "rgba(255,255,255,0.24)");
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gloss;
      ctx.fill();
      ctx.restore();

      if (entries.length && !skipLabels) {
        const mid = start + angleStep / 2;
        const labelRadius = radius - 28;
        const x = center + Math.cos(mid) * labelRadius;
        const y = center + Math.sin(mid) * labelRadius;
        const flipped = Math.cos(mid) < 0;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + (flipped ? Math.PI : 0));
        ctx.fillStyle = colors.text;
        ctx.font = `bold ${fontSize}px Segoe UI, sans-serif`;
        ctx.textAlign = flipped ? "left" : "right";
        ctx.textBaseline = "middle";
        const maxLabelWidth = this.getMaxLabelWidth(radius, angleStep, fontSize);
        const compact = ctx.measureText(entries[i].name).width <= maxLabelWidth
          ? entries[i].name
          : shortName(entries[i].name);
        const safeLabel = this.truncateLabelToWidth(compact, ctx, maxLabelWidth);
        ctx.fillText(safeLabel, 0, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, radius - 6, 0, CONFIG.geometry.TWO_PI);
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, radius - 16, 0, CONFIG.geometry.TWO_PI);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 17, 0, CONFIG.geometry.TWO_PI);
    ctx.fillStyle = colors.centerFill;
    ctx.fill();
    ctx.strokeStyle = colors.centerStroke;
    ctx.lineWidth = 3;
    ctx.stroke();

    return surface;
  }

  draw(entries, options = {}) {
    const { skipLabels = false } = options;
    const ctx = this.ctx;
    const radius = this.canvas.width / 2;

    const palette = this.getPalette(this.group);
    const colors = {
      text: this.getThemeColor("--theme-text", "#5f1642"),
      empty: this.getThemeColor("--theme-btn-secondary-bg", "#ffe5f4"),
      border: this.getThemeColor("--theme-wheel-border", this.getThemeColor("--theme-canvas-border", "#ffc2e3")),
      centerFill: this.getThemeColor("--theme-center-fill", "#fff"),
      centerStroke: this.getThemeColor("--theme-center-stroke", this.getThemeColor("--theme-base", CONFIG.theme.defaultBase)),
    };
    const fontSize = this.getLabelFontSize(entries.length);
    const key = this.cacheKey(entries, skipLabels, palette, colors, fontSize);

    let surface = this.surfaceCache.get(key);
    if (!surface) {
      surface = this.buildSurface(entries, skipLabels, palette, colors, fontSize);
      this.surfaceCache.set(key, surface);
      if (this.surfaceCache.size > 8) {
        const oldest = this.surfaceCache.keys().next().value;
        this.surfaceCache.delete(oldest);
      }
    }

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(this.rotation);
    ctx.translate(-radius, -radius);
    ctx.drawImage(surface, 0, 0);
    ctx.restore();
  }

  getLabelFontSize(entryCount) {
    const scale = this.canvas.width / 440;
    if (entryCount <= 12) return 20 * scale;
    if (entryCount <= 18) return 18 * scale;
    if (entryCount <= 26) return 17 * scale;
    if (entryCount <= 36) return 15 * scale;
    return Math.max(8, 540 / entryCount) * scale;
  }

  getMaxLabelWidth(radius, angleStep, fontSize) {
    // Keep each radial label outside the narrow center of its wedge.
    const innerRadius = Math.max(30, fontSize * 0.55 / Math.sin(Math.min(angleStep, Math.PI) / 2) + 4);
    return Math.max(0, radius - 28 - innerRadius);
  }

  truncateLabelToWidth(label, ctx, maxWidth) {
    if (ctx.measureText(label).width <= maxWidth) {
      return label;
    }

    const ellipsis = "…";
    const ellipsisWidth = ctx.measureText(ellipsis).width;
    if (ellipsisWidth > maxWidth) {
      return "";
    }

    let clipped = label;
    while (clipped.length > 0 && ctx.measureText(`${clipped}${ellipsis}`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    return `${clipped}${ellipsis}`;
  }

  getEntryAtPointer(entries, rotation = this.rotation) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }

    const angleStep = CONFIG.geometry.TWO_PI / entries.length;
    const pointerAngle = -Math.PI / 2;
    const normalizedRotation = ((rotation % CONFIG.geometry.TWO_PI) + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI;
    const wheelAngleAtPointer = pointerAngle - normalizedRotation;
    const normalizedPointer = ((wheelAngleAtPointer % CONFIG.geometry.TWO_PI) + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI;
    const index = Math.floor(normalizedPointer / angleStep) % entries.length;
    return entries[index] ?? null;
  }

  animateTo(finalRotation, entries, durationMs = CONFIG.settings.defaultSpinDurationMs, hooks = {}) {
    const { onTick } = hooks;
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches || durationMs <= 0) {
      this.rotation = finalRotation % CONFIG.geometry.TWO_PI;
      this.draw(entries);
      if (typeof onTick === "function") {
        onTick(this.getEntryAtPointer(entries), 1);
      }
      return Promise.resolve();
    }

    const start = this.rotation;
    const startTime = performance.now();
    let lastDrawnAt = 0;

    return new Promise((resolve) => {
      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durationMs, 1);

        const easeOutQuint = 1 - (1 - t) ** 5;
        const lateWobble = Math.sin(t * Math.PI * 12) * (1 - t) ** 2 * 0.012;
        const eased = Math.min(1, easeOutQuint + lateWobble);
        this.rotation = start + (finalRotation - start) * eased;

        if (now - lastDrawnAt >= CONFIG.animation.frameIntervalMs || t === 1) {
          this.draw(entries, { skipLabels: false });
          if (typeof onTick === "function") {
            onTick(this.getEntryAtPointer(entries, this.rotation), t);
          }
          lastDrawnAt = now;
        }

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.rotation %= CONFIG.geometry.TWO_PI;
          this.draw(entries);
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }
}

/**
 * Computes final wheel rotation so the winner's slice center aligns with the top pointer.
 */
export function wheelRotationForWinner(entries, winnerId, currentRotation) {
  const index = entries.findIndex((entry) => entry.id === winnerId);
  if (index === -1 || entries.length === 0) {
    return currentRotation + CONFIG.geometry.TWO_PI * CONFIG.animation.extraRotations;
  }

  const angleStep = CONFIG.geometry.TWO_PI / entries.length;
  const centerAngle = index * angleStep + angleStep / 2;
  const pointerAngle = -Math.PI / 2;
  const normalizedCurrent = ((currentRotation % CONFIG.geometry.TWO_PI) + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI;
  const targetNormalized = pointerAngle - centerAngle;
  const delta = ((targetNormalized - normalizedCurrent + CONFIG.geometry.TWO_PI) % CONFIG.geometry.TWO_PI)
    + CONFIG.geometry.TWO_PI * CONFIG.animation.extraRotations;
  return currentRotation + delta;
}
