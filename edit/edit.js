import { validateRoster } from "../roster.js";
import { computeBlobSha, saveRosterToGitHub } from "./github-save.js";

const state = {
  className: "",
  male: [],
  female: [],
  loaded: false,
  baseSha: "",
  saving: false,
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
  saveBtn: document.getElementById("save-roster"),
  saveDialog: document.getElementById("save-dialog"),
  saveForm: document.getElementById("save-form"),
  passwordInput: document.getElementById("save-password"),
  confirmSaveBtn: document.getElementById("confirm-save"),
  cancelSaveBtn: document.getElementById("cancel-save"),
  saveError: document.getElementById("save-error"),
  backLink: document.querySelector(".back-link"),
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
  const disabled = !state.loaded || state.saving || Boolean(invalidInput);
  elements.copyJsonBtn.disabled = disabled;
  elements.downloadJsonBtn.disabled = disabled;
  elements.saveBtn.disabled = disabled;
  return !invalidInput;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function bindInput(input, onChange) {
  input.addEventListener("input", (event) => {
    if (state.saving) return;
    onChange(event.target.value);
    input.setAttribute("aria-invalid", String(!input.validity.valid));
    setStatus(renderJsonPreview()
      ? "Có thay đổi chưa lưu."
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
    if (state.saving) return;
    state[group].splice(index, 1);
    renderTable(group);
    renderJsonPreview();
    const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
    const nextRow = tbody.children[Math.min(index, state[group].length - 1)];
    (nextRow?.querySelector("button") ?? (group === "male" ? elements.addMaleBtn : elements.addFemaleBtn)).focus();
    setStatus("Có thay đổi chưa lưu.");
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
  if (!state.loaded || state.saving) return;
  state[group].push({ name: "", priority: undefined, exclusiveID: undefined });
  renderTable(group);
  renderJsonPreview();
  const tbody = group === "male" ? elements.maleTbody : elements.femaleTbody;
  tbody.lastElementChild.querySelector("input").focus();
  setStatus("Đã thêm một hàng mới. Nhập họ và tên trước khi xuất danh sách.");
}

async function copyJsonToClipboard() {
  if (!state.loaded || state.saving || !renderJsonPreview()) return;
  try {
    await navigator.clipboard.writeText(elements.jsonPreview.value);
    setStatus("Đã sao chép JSON.");
  } catch {
    elements.jsonPreview.focus();
    elements.jsonPreview.select();
    setStatus("Không thể tự sao chép. Nội dung đã được chọn trong ô xem trước; hãy sao chép thủ công.");
  }
}

function downloadJson() {
  if (!state.loaded || state.saving || !renderJsonPreview()) return;
  const blob = new Blob([elements.jsonPreview.value], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "students.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Đã tải students.json.");
}

async function init() {
  try {
    const { roster: data, sha } = await loadDefaultRoster();
    state.className = data.className ?? "";
    elements.classNameInput.value = state.className;
    document.title = `Danh sách${state.className ? " lớp " + state.className : ""} · Vòng quay màu hồng`;
    const male = data.male.map(normalizeEntry);
    const female = data.female.map(normalizeEntry);
    state.male = male;
    state.female = female;
    state.baseSha = sha;
    state.loaded = true;
    for (const element of [elements.addMaleBtn, elements.addFemaleBtn, elements.classNameInput]) {
      element.disabled = false;
    }

    renderTable("male");
    renderTable("female");
    renderJsonPreview();
    setStatus(`${male.length + female.length} bạn.`);
  } catch (error) {
    setStatus(`Chưa mở được danh sách. ${error.message}`);
  }
}

async function loadDefaultRoster() {
  const response = await fetch("../data/students.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Không tải được danh sách gốc (HTTP ${response.status}). Thử tải lại trang.`);
  }
  const text = await response.text();
  const roster = validateRoster(JSON.parse(text));
  const sha = await computeBlobSha(text);
  return { roster, sha };
}

function setSaving(saving) {
  state.saving = saving;
  for (const input of document.querySelectorAll("tbody input, tbody button")) input.disabled = saving;
  for (const control of [elements.addMaleBtn, elements.addFemaleBtn, elements.classNameInput]) {
    control.disabled = !state.loaded || saving;
  }
  for (const control of [elements.passwordInput, elements.confirmSaveBtn, elements.cancelSaveBtn, elements.jsonPreview]) {
    control.disabled = saving;
  }
  elements.backLink.setAttribute("aria-disabled", String(saving));
  elements.saveDialog.setAttribute("aria-busy", String(saving));
  elements.confirmSaveBtn.textContent = saving ? "Đang lưu…" : "Lưu";
  renderJsonPreview();
}

function openSaveDialog() {
  if (!state.loaded || state.saving || !renderJsonPreview()) return;
  try {
    validateRoster(snapshot());
  } catch (error) {
    setStatus(error.message);
    return;
  }
  elements.passwordInput.value = "";
  elements.saveError.textContent = "";
  elements.saveDialog.showModal();
  elements.passwordInput.focus();
}

async function saveRoster() {
  if (!state.loaded || state.saving || !elements.passwordInput.value || !renderJsonPreview()) return;
  let roster;
  try {
    roster = validateRoster(snapshot());
  } catch (error) {
    elements.saveError.textContent = error.message;
    return;
  }
  const request = { password: elements.passwordInput.value, sha: state.baseSha, roster };
  elements.passwordInput.value = "";
  elements.saveError.textContent = "";
  setSaving(true);
  try {
    const result = await saveRosterToGitHub(request);
    state.baseSha = result.sha;
    elements.saveDialog.close();
    setStatus("Đã lưu. Chờ trang cập nhật.");
  } catch (error) {
    elements.saveError.textContent = error.message;
    setStatus(error.message);
  } finally {
    request.password = "";
    elements.passwordInput.value = "";
    setSaving(false);
    if (elements.saveDialog.open) elements.passwordInput.focus();
  }
}

elements.addMaleBtn.addEventListener("click", () => addRow("male"));
elements.addFemaleBtn.addEventListener("click", () => addRow("female"));
elements.copyJsonBtn.addEventListener("click", copyJsonToClipboard);
elements.downloadJsonBtn.addEventListener("click", downloadJson);
elements.saveBtn.addEventListener("click", openSaveDialog);
elements.saveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveRoster();
});
elements.cancelSaveBtn.addEventListener("click", () => {
  if (state.saving) return;
  elements.passwordInput.value = "";
  elements.saveDialog.close();
});
elements.saveDialog.addEventListener("cancel", (event) => {
  if (state.saving) event.preventDefault();
  else elements.passwordInput.value = "";
});
elements.saveDialog.addEventListener("close", () => { elements.passwordInput.value = ""; });
elements.backLink.addEventListener("click", (event) => {
  if (state.saving) event.preventDefault();
});
bindInput(elements.classNameInput, (value) => { state.className = value; });

init();
