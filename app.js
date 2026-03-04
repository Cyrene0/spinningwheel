const TWO_PI = Math.PI * 2;

const state = {
  allStudents: { male: [], female: [] },
  pools: { male: [], female: [] },
  current: { male: null, female: null },
  spinning: false,
};

const elements = {
  spinBtn: document.getElementById("spin-btn"),
  resetBtn: document.getElementById("reset-btn"),
  maleCanvas: document.getElementById("male-wheel"),
  femaleCanvas: document.getElementById("female-wheel"),
  maleName: document.getElementById("male-name"),
  femaleName: document.getElementById("female-name"),
  malePoolStatus: document.getElementById("male-pool-status"),
  femalePoolStatus: document.getElementById("female-pool-status"),
  pairResult: document.getElementById("pair-result"),
};

const palettes = {
  male: ["#ff9ecf", "#ff7dc0", "#ffaed8", "#ff92cb", "#ffbede", "#ff8fc6"],
  female: ["#ffb6df", "#ff97d0", "#ffc9e8", "#ff84c7", "#ffaddb", "#ff6dbc"],
};

class Wheel {
  constructor(canvas, group) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.group = group;
    this.rotation = 0;
  }

  draw(entries) {
    const ctx = this.ctx;
    const radius = this.canvas.width / 2;
    const center = radius;
    const sliceCount = Math.max(entries.length, 1);
    const angleStep = TWO_PI / sliceCount;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = 0; i < sliceCount; i += 1) {
      const start = this.rotation + i * angleStep;
      const end = start + angleStep;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius - 6, start, end);
      ctx.closePath();
      ctx.fillStyle = entries.length ? palettes[this.group][i % palettes[this.group].length] : "#ffe5f4";
      ctx.fill();

      if (entries.length) {
        const mid = start + angleStep / 2;
        const labelRadius = radius * 0.67;
        const x = center + Math.cos(mid) * labelRadius;
        const y = center + Math.sin(mid) * labelRadius;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(mid + Math.PI / 2);
        ctx.fillStyle = "#5f1642";
        ctx.font = "bold 15px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(entries[i].name, 0, 0);
        ctx.restore();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, 17, 0, TWO_PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#ff5eaf";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  animateTo(finalRotation, entries, durationMs = 3600) {
    const start = this.rotation;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const frame = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const eased = 1 - (1 - t) ** 3;
        this.rotation = start + (finalRotation - start) * eased;
        this.draw(entries);

        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          this.rotation %= TWO_PI;
          this.draw(entries);
          resolve();
        }
      };

      requestAnimationFrame(frame);
    });
  }
}

const maleWheel = new Wheel(elements.maleCanvas, "male");
const femaleWheel = new Wheel(elements.femaleCanvas, "female");

async function init() {
  try {
    const response = await fetch("./data/students.json");
    if (!response.ok) {
      throw new Error(`Failed to load student data (${response.status})`);
    }

    const data = await response.json();
    state.allStudents.male = normalizeGroup(data.male);
    state.allStudents.female = normalizeGroup(data.female);
    refillPool("male");
    refillPool("female");
    renderAll();
  } catch (error) {
    elements.pairResult.textContent = `Error: ${error.message}`;
    elements.spinBtn.disabled = true;
  }
}

function normalizeGroup(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return { name: entry, excluded: false, priority: false };
      }
      if (entry && typeof entry.name === "string") {
        return {
          name: entry.name,
          excluded: Boolean(entry.excluded),
          priority: Boolean(entry.priority),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function filteredGroup(group) {
  return state.allStudents[group].filter((student) => !student.excluded);
}

function refillPool(group) {
  state.pools[group] = shuffle([...filteredGroup(group)]);
}

function pickWinner(group) {
  if (state.pools[group].length === 0) {
    refillPool(group);
  }

  const pool = state.pools[group];
  if (pool.length === 0) {
    return null;
  }

  const priorityIndex = pool.findIndex((entry) => entry.priority);
  if (priorityIndex !== -1) {
    return pool.splice(priorityIndex, 1)[0];
  }

  return pool.pop();
}

function wheelRotationForWinner(entries, winnerName, currentRotation) {
  const index = entries.findIndex((entry) => entry.name === winnerName);
  if (index === -1 || entries.length === 0) {
    return currentRotation + TWO_PI * 5;
  }

  const angleStep = TWO_PI / entries.length;
  const centerAngle = index * angleStep + angleStep / 2;
  const pointerAngle = -Math.PI / 2;
  const normalizedCurrent = ((currentRotation % TWO_PI) + TWO_PI) % TWO_PI;
  const targetNormalized = pointerAngle - centerAngle;
  const delta = ((targetNormalized - normalizedCurrent + TWO_PI) % TWO_PI) + TWO_PI * 5;
  return currentRotation + delta;
}

async function spinBoth() {
  if (state.spinning) {
    return;
  }

  const maleEntries = [...state.pools.male];
  const femaleEntries = [...state.pools.female];

  const maleWinner = pickWinner("male");
  const femaleWinner = pickWinner("female");

  if (!maleWinner && !femaleWinner) {
    elements.pairResult.textContent = "No available students in JSON data.";
    renderStatus();
    return;
  }

  state.spinning = true;
  elements.spinBtn.disabled = true;

  const maleFinal = maleWinner
    ? wheelRotationForWinner(maleEntries, maleWinner.name, maleWheel.rotation)
    : maleWheel.rotation;
  const femaleFinal = femaleWinner
    ? wheelRotationForWinner(femaleEntries, femaleWinner.name, femaleWheel.rotation)
    : femaleWheel.rotation;

  await Promise.all([
    maleWheel.animateTo(maleFinal, maleEntries, 3800),
    femaleWheel.animateTo(femaleFinal, femaleEntries, 3500),
  ]);

  state.current = { male: maleWinner, female: femaleWinner };
  state.spinning = false;
  elements.spinBtn.disabled = false;
  renderResult();
  renderStatus();
  maleWheel.draw(state.pools.male);
  femaleWheel.draw(state.pools.female);
}

function resetPools() {
  refillPool("male");
  refillPool("female");
  state.current = { male: null, female: null };
  renderAll();
}

function renderResult() {
  elements.maleName.textContent = state.current.male?.name ?? "—";
  elements.femaleName.textContent = state.current.female?.name ?? "—";

  if (!state.current.male && !state.current.female) {
    elements.pairResult.textContent = "Spin to choose a pair.";
    return;
  }

  elements.pairResult.textContent = `${state.current.male?.name ?? "(none)"} + ${state.current.female?.name ?? "(none)"}`;
}

function renderStatus() {
  elements.malePoolStatus.textContent = `${state.pools.male.length} names left in active male pool`;
  elements.femalePoolStatus.textContent = `${state.pools.female.length} names left in active female pool`;
}

function renderAll() {
  renderResult();
  renderStatus();
  maleWheel.draw(state.pools.male);
  femaleWheel.draw(state.pools.female);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

elements.spinBtn.addEventListener("click", spinBoth);
elements.resetBtn.addEventListener("click", resetPools);

init();
