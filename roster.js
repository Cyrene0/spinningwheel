export function validateRoster(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Danh sách lớp phải là đối tượng có hai nhóm nam và nữ.");
  }

  const roster = {};
  if (data.className !== undefined) {
    if (typeof data.className !== "string") {
      throw new Error("Tên lớp phải là chuỗi ký tự.");
    }
    if (data.className.trim()) roster.className = data.className.trim();
  }
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
