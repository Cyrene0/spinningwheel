const state = {
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
    name: String(entry?.name ?? ""),
    priority: toOptionalNumber(entry?.priority),
    exclusiveID: toOptionalNumber(entry?.exclusiveID),
  };
}

function compactEntry(entry) {
  const compacted = { name: entry.name.trim() };

  if (typeof entry.priority === "number") {
    compacted.priority = entry.priority;
  }

  if (typeof entry.exclusiveID === "number") {
    compacted.exclusiveID = entry.exclusiveID;
  }

  return compacted;
}

function snapshot() {
  return {
    male: state.male.map(compactEntry),
    female: state.female.map(compactEntry),
  };
}

function renderJsonPreview() {
  elements.jsonPreview.value = JSON.stringify(snapshot(), null, 2);
  const invalidInput = document.querySelector("tbody input:invalid");
  elements.copyJsonBtn.disabled = !state.loaded || Boolean(invalidInput);
  elements.downloadJsonBtn.disabled = !state.loaded || Boolean(invalidInput);
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
      ? "Có thay đổi chưa lưu. Tải tệp hoặc sao chép JSON để giữ lại bản chỉnh sửa."
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
    const response = await fetch("../data/students.json");
    if (!response.ok) {
      throw new Error(`Không tải được danh sách (HTTP ${response.status}). Thử tải lại trang.`);
    }

    const data = await response.json();
    if (!Array.isArray(data?.male) || !Array.isArray(data?.female)) {
      throw new Error("Tệp danh sách phải có hai mảng male và female. Hãy kiểm tra data/students.json.");
    }
    const male = data.male.map(normalizeEntry);
    const female = data.female.map(normalizeEntry);
    state.male = male;
    state.female = female;
    state.loaded = true;
    elements.addMaleBtn.disabled = false;
    elements.addFemaleBtn.disabled = false;

    renderTable("male");
    renderTable("female");
    renderJsonPreview();
    setStatus(`Đã tải ${male.length + female.length} người tham gia. Bạn có thể chỉnh sửa và xuất danh sách.`);
  } catch (error) {
    setStatus(`Chưa mở được danh sách. ${error.message}`);
  }
}

elements.addMaleBtn.addEventListener("click", () => addRow("male"));
elements.addFemaleBtn.addEventListener("click", () => addRow("female"));
elements.copyJsonBtn.addEventListener("click", copyJsonToClipboard);
elements.downloadJsonBtn.addEventListener("click", downloadJson);

init();
