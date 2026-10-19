import { validateRoster } from "../../../roster.js";

const CONTENTS_URL = "https://api.github.com/repos/Cyrene0/spinningwheel/contents/data/students.json";
const MAX_BODY_BYTES = 100 * 1024;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ALLOWED_ORIGINS = new Set([
  "https://cyrene0.github.io", "http://localhost:4173", "http://127.0.0.1:4173",
]);
const ENTRY_FIELDS = new Set(["name", "id", "sourceId", "sourceID", "priority", "exclusiveID", "excluded"]);

async function readBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new RangeError();
  if (!request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new RangeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function validatePublicRoster(data) {
  if (Array.isArray(data?.male) && Array.isArray(data?.female)
    && data.male.length + data.female.length > 500) {
    throw new Error("Danh sách không được vượt quá 500 người.");
  }
  const roster = validateRoster(data);
  if (Object.keys(data).some((field) => !["className", "male", "female"].includes(field))) {
    throw new Error("Danh sách có trường thông tin không được hỗ trợ.");
  }
  if ((roster.className?.length ?? 0) > 60) throw new Error("Tên lớp không được vượt quá 60 ký tự.");
  for (const entry of [...roster.male, ...roster.female]) {
    if (entry.name.length > 120) throw new Error("Họ tên không được vượt quá 120 ký tự.");
    if (Object.keys(entry).some((field) => !ENTRY_FIELDS.has(field))) {
      throw new Error("Người tham gia có trường thông tin không được hỗ trợ.");
    }
    for (const field of ["id", "sourceId", "sourceID"]) {
      const value = entry[field];
      if (value != null && !(typeof value === "string" && value.trim())
        && !(typeof value === "number" && Number.isFinite(value))) {
        throw new Error("Mã người tham gia phải là chuỗi không trống hoặc số hữu hạn.");
      }
    }
  }
  return roster;
}

export function createRosterHandler({ authorize, fetchImpl = fetch }) {
  return async (request) => {
    const origin = request.headers.get("origin");
    const corsHeaders = { Vary: "Origin" };
    if (ALLOWED_ORIGINS.has(origin)) corsHeaders["Access-Control-Allow-Origin"] = origin;
    const reply = (status, message) => Response.json(
      typeof message === "string" ? { message } : message,
      { status, headers: corsHeaders },
    );
    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, "Trang này không được phép gửi yêu cầu.");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "600",
      } });
    }
    if (request.method !== "POST") return reply(405, "Chỉ chấp nhận yêu cầu POST.");
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return reply(415, "Yêu cầu phải có định dạng application/json.");
    }

    let payload;
    try {
      payload = await readBody(request);
    } catch (error) {
      return error instanceof RangeError
        ? reply(413, "Yêu cầu không được vượt quá 100 KB.")
        : reply(400, "Nội dung yêu cầu không phải JSON UTF-8 hợp lệ.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)
      || typeof payload.password !== "string" || !payload.password.length || payload.password.length > 256) {
      return reply(400, "Mật khẩu phải là chuỗi từ 1 đến 256 ký tự.");
    }

    try {
      const clientIP = (request.headers.get("cf-connecting-ip")
        ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown").slice(0, 128);
      const auth = await authorize(payload.password, clientIP);
      if (auth?.status !== 200 || typeof auth.token !== "string" || !auth.token) {
        if (auth?.status === 401) return reply(401, "Mật khẩu không đúng.");
        if (auth?.status === 429) return reply(429, "Bạn đã thử quá nhiều lần. Hãy thử lại sau.");
        return reply(503, "Dịch vụ xác thực tạm thời chưa sẵn sàng.");
      }
      if (typeof payload.sha !== "string" || !SHA_PATTERN.test(payload.sha)
        || Object.keys(payload).some((field) => !["password", "sha", "roster"].includes(field))) {
        return reply(400, "Thông tin phiên bản danh sách không hợp lệ.");
      }
      let roster;
      try {
        roster = validatePublicRoster(payload.roster);
      } catch (error) {
        return reply(400, error.message);
      }

      const headers = {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${auth.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      };
      const currentResponse = await fetchImpl(`${CONTENTS_URL}?ref=main`, { headers });
      if (!currentResponse.ok) return reply(502, "Không đọc được danh sách từ GitHub. Hãy thử lại sau.");
      const current = await currentResponse.json();
      if (typeof current.sha !== "string" || !SHA_PATTERN.test(current.sha)) {
        return reply(502, "GitHub trả về phiên bản danh sách không hợp lệ.");
      }
      if (current.sha.toLowerCase() !== payload.sha.toLowerCase()) {
        return reply(409, "Danh sách đã được người khác cập nhật. Hãy tải lại trang trước khi sửa tiếp.");
      }
      const serialized = JSON.stringify(roster, null, 2) + "\n";
      const content = btoa(Array.from(new TextEncoder().encode(serialized), (byte) => String.fromCharCode(byte)).join(""));
      const updateResponse = await fetchImpl(CONTENTS_URL, {
        method: "PUT", headers,
        body: JSON.stringify({ message: "Update class roster from website", content, sha: current.sha, branch: "main" }),
      });
      if (updateResponse.status === 409) {
        return reply(409, "Danh sách vừa thay đổi. Hãy tải lại trang trước khi sửa tiếp.");
      }
      if (!updateResponse.ok) return reply(502, "Chưa lưu được danh sách lên GitHub. Các chỉnh sửa của bạn vẫn được giữ trên trang.");
      const updated = await updateResponse.json();
      if (!SHA_PATTERN.test(updated.content?.sha ?? "") || !SHA_PATTERN.test(updated.commit?.sha ?? "")) {
        return reply(502, "GitHub chưa trả về thông tin xác nhận hợp lệ. Hãy kiểm tra danh sách trước khi thử lại.");
      }
      return reply(200, {
        sha: updated.content.sha,
        commitUrl: `https://github.com/Cyrene0/spinningwheel/commit/${updated.commit.sha}`,
      });
    } catch {
      return reply(503, "Chưa kết nối được dịch vụ lưu danh sách. Hãy thử lại sau.");
    }
  };
}
