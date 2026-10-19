import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { computeBlobSha, saveRosterToGitHub } from "../edit/github-save.js";

const sha = "a".repeat(40);
const roster = { className: "8A1", male: [{ name: "An" }], female: [{ name: "Nguyễn Gia Linh" }] };

test("Git blob hash matches empty and exact UTF-8 file content", async () => {
  assert.equal(await computeBlobSha(""), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  const text = `${JSON.stringify(roster, null, 2)}\n`;
  const expected = createHash("sha1").update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest("hex");
  assert.equal(await computeBlobSha(text), expected);
  assert.notEqual(await computeBlobSha(text.trim()), expected);
});

test("save sends only password, file SHA and roster to the fixed endpoint", async (t) => {
  const result = { sha, commitUrl: "https://github.com/Cyrene0/spinningwheel/commit/example" };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://efqejyuhihuklitycshk.supabase.co/functions/v1/roster-editor");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "omit");
    assert.deepEqual(options.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(options.body), { password: "test-password", sha, roster });
    return { ok: true, json: async () => result };
  });
  assert.deepEqual(await saveRosterToGitHub({ password: "test-password", sha, roster }), result);
});

test("server failures produce fixed messages without reflecting response secrets", async (t) => {
  const expected = new Map([
    [401, "Sai mật khẩu."],
    [409, "Danh sách đã thay đổi. Giữ lại JSON rồi tải lại trang."],
    [429, "Thử lại sau ít phút."],
    [503, "Chưa cấu hình lưu danh sách."],
    [500, "Không lưu được. Thử lại."],
  ]);
  let status;
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status, json: () => assert.fail("Error body should not be reflected") }));
  for (const [code, message] of expected) {
    status = code;
    await assert.rejects(saveRosterToGitHub({ password: "test-password", sha, roster }), (error) => error.status === code && error.message === message);
  }
});

test("network and unconfirmed success responses cannot be mistaken for a save", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("private network detail"); });
  await assert.rejects(saveRosterToGitHub({ password: "test-password", sha, roster }), /Không kết nối được/);
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ sha: "invalid" }) }));
  await assert.rejects(saveRosterToGitHub({ password: "test-password", sha, roster }), /Chưa xác nhận được/);
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new Error("bad JSON"); } }));
  await assert.rejects(saveRosterToGitHub({ password: "test-password", sha, roster }), /Chưa xác nhận được/);
});
