export const ROSTER_STORAGE_KEY = "pairSpinner.roster.v1";

export function validateRoster(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Danh sách lớp phải là đối tượng có hai nhóm nam và nữ.");
  }

  const roster = {};
  for (const [group, label] of [["male", "nam"], ["female", "nữ"]]) {
    if (!Array.isArray(data[group])) {
      throw new Error(`Danh sách bạn ${label} phải là một mảng.`);
    }
    roster[group] = data[group].map((entry, index) => {
      const position = `Bạn ${label} ở dòng ${index + 1}`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)
        || typeof entry.name !== "string" || !entry.name.trim()) {
        throw new Error(`${position} cần có tên không để trống.`);
      }
      if (entry.excluded !== undefined && typeof entry.excluded !== "boolean") {
        throw new Error(`${position}: excluded phải là true hoặc false.`);
      }

      const normalized = { ...entry, name: entry.name.trim() };
      for (const field of ["priority", "exclusiveID"]) {
        const value = entry[field];
        if (value == null || (typeof value === "string" && !value.trim())) {
          delete normalized[field];
          continue;
        }
        if ((typeof value !== "number" && typeof value !== "string") || !Number.isFinite(Number(value))) {
          throw new Error(`${position}: ${field} phải là một số hữu hạn hoặc để trống.`);
        }
        normalized[field] = Number(value);
      }
      return normalized;
    });
    if (!roster[group].some((entry) => !entry.excluded)) {
      throw new Error(`Cần ít nhất một bạn ${label} không bị loại khỏi vòng quay.`);
    }
  }
  return roster;
}

export function getSavedRoster(storage) {
  let saved;
  try {
    saved = (storage ?? globalThis.localStorage).getItem(ROSTER_STORAGE_KEY);
  } catch {
    throw new Error("Không thể đọc danh sách đã lưu trong trình duyệt.");
  }
  if (saved === null) return null;

  try {
    return validateRoster(JSON.parse(saved));
  } catch (error) {
    throw new Error(`Danh sách đã lưu không hợp lệ. Hãy khôi phục danh sách gốc. ${error.message}`);
  }
}

export function saveRoster(data, storage) {
  const roster = validateRoster(data);
  let serialized;
  try {
    serialized = JSON.stringify(roster);
  } catch {
    throw new Error("Danh sách lớp không thể chuyển thành JSON hợp lệ.");
  }
  try {
    (storage ?? globalThis.localStorage).setItem(ROSTER_STORAGE_KEY, serialized);
  } catch {
    throw new Error("Không thể lưu danh sách trong trình duyệt. Hãy kiểm tra quyền lưu trữ hoặc dung lượng trống.");
  }
  return roster;
}

export function clearSavedRoster(storage) {
  try {
    (storage ?? globalThis.localStorage).removeItem(ROSTER_STORAGE_KEY);
  } catch {
    throw new Error("Không thể khôi phục danh sách gốc vì trình duyệt chặn xóa dữ liệu đã lưu.");
  }
}
