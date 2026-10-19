import { getSavedRoster, saveRoster, clearSavedRoster, validateRoster } from "../roster.js";

const state = {
  className: "",
  male: [],
  female: [],
  loaded: false,
};

const elements = {
  maleTbody: document.querySelector("#male-table tbody"),
  femaleTbody: document.querySelector("#female-table tbody"),
  addMaleBtn: document.getElementById("add-male"),
  addFemaleBtn: document.getElementById("add-female"),
  copyJsonBtn: document.getElementById("copy-json"),
  downloadJsonBtn: document.getElementById("download-json"),
  jsonPreview: document.getElementById("json-preview"),
  status: document.getElementById("status"),
  maleCount: document.getElementById("male-count"),
  femaleCount: document.getElementById("female-count"),
  classNameInput: document.getElementById("class-name-input"),
  applyRosterBtn: document.getElementById("apply-roster"),
  restoreRosterBtn: document.getElementById("restore-roster"),
};

function toOptionalNumber(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeEntry(entry) {
  if (!entry || typeof entry.name !== "string" || !entry.name.trim()) {
    throw new Error("Danh sách có tên trống hoặc không hợp lệ. Hãy kiểm tra data/students.json.");
  }

  for (const field of ["priority", "exclusiveID"]) {
    if (String(entry[field] ?? "").trim() && toOptionalNumber(entry[field]) === undefined) {
      throw new Error(`Giá trị ${field} của ${entry.name} phải là số. Hãy kiểm tra data/students.json.`);
    }
  }

  return {
    ...entry,
    name: String(entry?.name ?? ""),
    priority: toOptionalNumber(entry?.priority),
    exclusiveID: toOptionalNumber(entry?.exclusiveID),
  };
}

function compactEntry(entry) {
  return { ...entry, name: entry.name.trim() };
}

function snapshot() {
  return {
    ...(state.className.trim() ? { className: state.className.trim() } : {}),
    male: state.male.map(compactEntry),
    female: state.female.map(compactEntry),
  };
}

function renderJsonPreview() {
  elements.jsonPreview.value = JSON.stringify(snapshot(), null, 2);
  const invalidInput = document.querySelector("tbody input:invalid");
  elements.copyJsonBtn.disabled = !state.loaded || Boolean(invalidInput);
  elements.downloadJsonBtn.disabled = !state.loaded || Boolean(invalidInput);
  elements.applyRosterBtn.disabled = !state.loaded || Boolean(invalidInput);
  return !invalidInput;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function bindInput(input, onChange) {
  input.addEventListener("input", (event) => {
    onChange(event.target.value);
    input.setAttribute("aria-invalid", String(!input.validity.valid));
    setStatus(renderJsonPreview()
      ? "Có thay đổi chưa áp dụng. Chọn “Áp dụng và mở vòng quay” để dùng danh sách mới."
      : "Hãy điền đủ họ tên và kiểm tra các ô số trước khi xuất danh sách.");
  });
}

function createCellInput(type, value, label) {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  input.setAttribute("aria-label", label);
  if (type === "number") {
    input.step = "any";
    input.setAttribute("aria-describedby", "field-help");
  } else {
    input.required = true;
    input.setCustomValidity(input.value.trim() ? "" : "Vui lòng nhập họ và tên.");
  }
  return input;
}

function createRow(group, row, index) {
  const tr = document.createElement("tr");

  const nameTd = document.createElement("td");
  const priorityTd = document.createElement("td");
  const exclusiveTd = document.createElement("td");
  const actionTd = document.createElement("td");

  const rowLabel = `${group === "male" ? "nam" : "nữ"}, hàng ${index + 1}`;
  const nameInput = createCellInput("text", row.name, `Họ và tên ${rowLabel}`);
  const priorityInput = createCellInput("number", row.priority, `Ưu tiên ${rowLabel}`);
  const exclusiveInput = createCellInput("number", row.exclusiveID, `Mã ghép riêng ${rowLabel}`);
  nameInput.placeholder = "Nhập họ và tên";
  priorityInput.placeholder = "Tự động";
  exclusiveInput.placeholder = "Không có";

  bindInput(nameInput, (value) => {
    state[group][index].name = value;
    nameInput.setCustomValidity(value.trim() ? "" : "Vui lòng nhập họ và tên.");
  });

  bindInput(priorityInput, (value) => {
    state[group][index].priority = toOptionalNumber(value);
  });

  bindInput(exclusiveInput, (value) => {
    state[group][index].exclusiveID = toOptionalNumber(value);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "Xóa";
  removeBtn.setAttribute("aria-label", `Xóa ${row.name || rowLabel}`);
  removeBtn.className = "remove-btn";
  removeBtn.addEventListener("click", () => {
    state[group].splice(index, 1);
    renderTable(group);
    renderJsonPreview();
    const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
    const nextRow = tbody.children[Math.min(index, state[group].length - 1)];
    (nextRow?.querySelector("button") ?? (group === "male" ? elements.addMaleBtn : elements.addFemaleBtn)).focus();
    setStatus("Đã xóa một người. Tải tệp để lưu danh sách mới.");
  });

  nameTd.append(nameInput);
  priorityTd.append(priorityInput);
  exclusiveTd.append(exclusiveInput);
  actionTd.append(removeBtn);

  tr.append(nameTd, priorityTd, exclusiveTd, actionTd);
  return tr;
}

function renderTable(group) {
  const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
  tbody.replaceChildren();
  (group === "male" ? elements.maleCount : elements.femaleCount).textContent = state[group].length;

  if (!state[group].length) {
    const tr = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-cell";
    cell.textContent = "Chưa có người tham gia. Chọn “Thêm người” để bắt đầu.";
    tr.append(cell);
    tbody.append(tr);
  }

  state[group].forEach((row, index) => {
    tbody.append(createRow(group, row, index));
  });
}

function addRow(group) {
  state[group].push({ name: "", priority: undefined, exclusiveID: undefined });
  renderTable(group);
  renderJsonPreview();
  const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
  tbody.lastElementChild.querySelector("input").focus();
  setStatus("Đã thêm một hàng mới. Nhập họ và tên trước khi xuất danh sách.");
}

async function copyJsonToClipboard() {
  if (!state.loaded || !renderJsonPreview()) return;
  try {
    await navigator.clipboard.writeText(elements.jsonPreview.value);
    setStatus("Đã sao chép JSON. Dán nội dung vào data/students.json để cập nhật danh sách.");
  } catch {
    elements.jsonPreview.focus();
    elements.jsonPreview.select();
    setStatus("Không thể tự sao chép. Nội dung đã được chọn trong ô xem trước; hãy sao chép thủ công.");
  }
}

function downloadJson() {
  if (!state.loaded || !renderJsonPreview()) return;
  const blob = new Blob([elements.jsonPreview.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "students.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Đã tải students.json. Thay thế data/students.json trong dự án để áp dụng thay đổi.");
}

async function init() {
  try {
    let data;
    let storageMessage = "";
    try {
      data = getSavedRoster();
    } catch (error) {
      storageMessage = error.message + " Đang mở danh sách gốc.";
    }
    const usingSavedRoster = Boolean(data);
    if (!data) data = await loadDefaultRoster();
    state.className = data.className ?? "";
    elements.classNameInput.value = state.className;
    document.title = `Danh sách${state.className ? " lớp " + state.className : ""} · Vòng quay màu hồng`;
    const male = data.male.map(normalizeEntry);
    const female = data.female.map(normalizeEntry);
    state.male = male;
    state.female = female;
    state.loaded = true;
    for (const element of [elements.addMaleBtn, elements.addFemaleBtn, elements.classNameInput, elements.restoreRosterBtn]) {
      element.disabled = false;
    }

    renderTable("male");
    renderTable("female");
    renderJsonPreview();
    setStatus(storageMessage || `Đã mở ${male.length + female.length} bạn từ ${usingSavedRoster ? "danh sách đã lưu trên trình duyệt" : "danh sách gốc"}. Chỉnh sửa rồi áp dụng để bắt đầu quay.`);
  } catch (error) {
    setStatus(`Chưa mở được danh sách. ${error.message}`);
  }
}

async function loadDefaultRoster() {
  const response = await fetch("../data/students.json");
  if (!response.ok) {
    throw new Error(`Không tải được danh sách gốc (HTTP ${response.status}). Thử tải lại trang.`);
  }
  return validateRoster(await response.json());
}

function applyRoster() {
  if (!state.loaded || !renderJsonPreview()) return;
  try {
    saveRoster(snapshot());
    window.location.assign("../");
  } catch (error) {
    setStatus(error.message + " Bạn vẫn có thể tải JSON để giữ bản chỉnh sửa.");
  }
}

async function restoreDefaultRoster() {
  if (!state.loaded || !window.confirm("Dùng lại danh sách gốc? Hãy tải JSON trước nếu muốn giữ các chỉnh sửa hiện tại.")) return;
  try {
    // Fetch before clearing storage so a network error cannot discard the saved roster.
    const data = await loadDefaultRoster();
    clearSavedRoster();
    state.className = data.className ?? "";
    state.male = data.male.map(normalizeEntry);
    state.female = data.female.map(normalizeEntry);
    elements.classNameInput.value = state.className;
    renderTable("male");
    renderTable("female");
    renderJsonPreview();
    document.title = `Danh sách${state.className ? " lớp " + state.className : ""} · Vòng quay màu hồng`;
    setStatus("Đã khôi phục danh sách gốc. Chọn “Áp dụng và mở vòng quay” để bắt đầu.");
  } catch (error) {
    setStatus(error.message + " Danh sách hiện tại vẫn được giữ nguyên.");
  }
}

elements.addMaleBtn.addEventListener("click", () => addRow("male"));
elements.addFemaleBtn.addEventListener("click", () => addRow("female"));
elements.copyJsonBtn.addEventListener("click", copyJsonToClipboard);
elements.downloadJsonBtn.addEventListener("click", downloadJson);
elements.applyRosterBtn.addEventListener("click", applyRoster);
elements.restoreRosterBtn.addEventListener("click", restoreDefaultRoster);
bindInput(elements.classNameInput, (value) => { state.className = value; });

init();
