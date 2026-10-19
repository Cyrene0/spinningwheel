const ROSTER_EDITOR_URL = "https://efqejyuhihuklitycshk.supabase.co/functions/v1/roster-editor";

export async function computeBlobSha(text) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const header = encoder.encode(`blob ${bytes.length}\0`);
  const blob = new Uint8Array(header.length + bytes.length);
  blob.set(header);
  blob.set(bytes, header.length);
  const hash = await crypto.subtle.digest("SHA-1", blob);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function saveRosterToGitHub({ password, sha, roster }) {
  let response;
  try {
    response = await fetch(ROSTER_EDITOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ password, sha, roster }),
    });
  } catch {
    throw new Error("Không kết nối được. Thử lại.");
  }

  if (!response.ok) {
    const messages = {
      401: "Sai mật khẩu.",
      409: "Danh sách đã thay đổi. Giữ lại JSON rồi tải lại trang.",
      429: "Thử lại sau ít phút.",
      503: "Chưa cấu hình lưu danh sách.",
    };
    const error = new Error(messages[response.status] ?? "Không lưu được. Thử lại.");
    error.status = response.status;
    throw error;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Chưa xác nhận được kết quả lưu. Giữ lại JSON rồi tải lại trang.");
  }
  if (!/^[a-f0-9]{40}$/i.test(result?.sha ?? "")) {
    throw new Error("Chưa xác nhận được kết quả lưu. Giữ lại JSON rồi tải lại trang.");
  }
  return result;
}
