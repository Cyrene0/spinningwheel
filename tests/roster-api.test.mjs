import assert from "node:assert/strict";
import test from "node:test";
import { createRosterHandler } from "../supabase/functions/roster-editor/handler.js";

const SHA = "a".repeat(40);
const NEW_SHA = "b".repeat(40);
const COMMIT_SHA = "c".repeat(40);
const ORIGIN = "https://cyrene0.github.io";
const CONTENTS_URL = "https://api.github.com/repos/Cyrene0/spinningwheel/contents/data/students.json";
const roster = () => ({ className: "8A1", male: [{ name: "Nam", id: "m1" }], female: [{ name: "Nguyễn Gia Linh" }] });

function request(overrides = {}, headers = {}) {
  return new Request("https://example.supabase.co/functions/v1/roster-editor", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify({ password: "class password", sha: SHA, roster: roster(), ...overrides }),
  });
}

function fixture(options = {}) {
  const calls = [];
  const authCalls = [];
  const handler = createRosterHandler({
    authorize: async (...args) => {
      authCalls.push(args);
      return options.auth ?? { status: 200, token: "server-secret-token" };
    },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (options.fetchError) throw new Error("sensitive upstream error");
      if (init.method === "PUT") {
        return Response.json(options.putBody ?? { content: { sha: NEW_SHA }, commit: { sha: COMMIT_SHA } },
          { status: options.putStatus ?? 200 });
      }
      return Response.json(options.getBody ?? { sha: SHA }, { status: options.getStatus ?? 200 });
    },
  });
  return { handler, calls, authCalls };
}

test("successful Unicode update writes only the fixed file and branch", async () => {
  const { handler, calls, authCalls } = fixture();
  const data = roster();
  data.male[0] = { name: "  Nguyễn Văn An  ", id: 7, sourceId: "s1", sourceID: "s2", priority: "3", exclusiveID: 12, excluded: false };
  const response = await handler(request({ roster: data }, { "x-forwarded-for": "192.0.2.1, 192.0.2.2" }));

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, { sha: NEW_SHA, commitUrl: `https://github.com/Cyrene0/spinningwheel/commit/${COMMIT_SHA}` });
  assert.deepEqual(authCalls, [["class password", "192.0.2.1"]]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${CONTENTS_URL}?ref=main`);
  assert.equal(calls[1].url, CONTENTS_URL);
  assert.equal(calls[1].init.method, "PUT");
  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.branch, "main");
  assert.equal(body.sha, SHA);
  assert.equal(body.message, "Update class roster from website");
  const expected = { ...data, male: [{ ...data.male[0], name: "Nguyễn Văn An", priority: 3 }] };
  assert.equal(Buffer.from(body.content, "base64").toString("utf8"), JSON.stringify(expected, null, 2) + "\n");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.equal(JSON.stringify(result).includes("server-secret-token"), false);
});

test("GitHub 201 is accepted and uppercase submitted SHA is comparable", async () => {
  const { handler } = fixture({ putStatus: 201 });
  assert.equal((await handler(request({ sha: SHA.toUpperCase() }))).status, 200);
});

test("wrong password is rejected before roster validation or GitHub access", async () => {
  const { handler, calls, authCalls } = fixture({ auth: { status: 401, message: "private database detail" } });
  const response = await handler(request({ password: "wrong", roster: null }));
  assert.equal(response.status, 401);
  assert.equal(authCalls.length, 1);
  assert.equal(calls.length, 0);
  assert.doesNotMatch(await response.text(), /private|server-secret/);
});

test("rate limits and unavailable authorization do not reach GitHub", async () => {
  for (const status of [429, 503]) {
    const { handler, calls } = fixture({ auth: { status, message: "internal detail" } });
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.equal(calls.length, 0);
    assert.doesNotMatch(await response.text(), /internal detail/);
  }
});

test("malformed JSON and invalid or oversized passwords do not authenticate", async () => {
  const { handler, authCalls, calls } = fixture();
  const malformed = new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal((await handler(malformed)).status, 400);
  for (const password of ["", null, 42, "x".repeat(257)]) {
    assert.equal((await handler(request({ password }))).status, 400);
  }
  assert.equal(authCalls.length, 0);
  assert.equal(calls.length, 0);
});

test("actual UTF-8 bytes and declared length enforce the request cap", async () => {
  const { handler, authCalls } = fixture();
  const body = JSON.stringify({ password: "secret", sha: SHA, roster: roster(), padding: "ệ".repeat(40000) });
  assert.ok(body.length < 100 * 1024);
  const response = await handler(new Request("https://example.test", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  }));
  assert.equal(response.status, 413);
  assert.equal((await handler(request({}, { "Content-Length": String(100 * 1024 + 1) }))).status, 413);
  assert.equal(authCalls.length, 0);
});

test("invalid SHA and caller-controlled repository routing are rejected", async () => {
  for (const overrides of [{ sha: "bad" }, { repo: "other/repo" }, { ref: "branch" }, { path: "app.js" }]) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request(overrides))).status, 400);
    assert.equal(calls.length, 0);
  }
});

test("invalid rosters, unknown fields, and malformed IDs never call GitHub", async () => {
  const invalid = [null, { male: [], female: [] }, { ...roster(), extra: true },
    { ...roster(), className: "x".repeat(61) }, { ...roster(), male: [{ name: " " }] },
    { ...roster(), male: [{ name: "x".repeat(121) }] }, { ...roster(), male: [{ name: "An", priority: "NaN" }] },
    { ...roster(), male: [{ name: "An", excluded: true }] },
    { ...roster(), male: [{ name: "An", script: "alert(1)" }] },
    { ...roster(), male: [{ name: "An", id: {} }] },
    { ...roster(), male: Array.from({ length: 500 }, () => ({ name: "An" })) },
    JSON.parse('{"male":[{"name":"An","__proto__":{"polluted":true}}],"female":[{"name":"Bình"}]}')];
  for (const data of invalid) {
    const { handler, calls } = fixture();
    assert.equal((await handler(request({ roster: data }))).status, 400);
    assert.equal(calls.length, 0);
  }
  assert.equal({}.polluted, undefined);
});

test("code-looking names stay inert JSON data", async () => {
  const { handler, calls } = fixture();
  const data = roster();
  data.male[0].name = '<script>alert("x")</script> $(env)';
  assert.equal((await handler(request({ roster: data }))).status, 200);
  const written = JSON.parse(Buffer.from(JSON.parse(calls[1].init.body).content, "base64").toString("utf8"));
  assert.equal(written.male[0].name, data.male[0].name);
});

test("stale initial version prevents PUT and concurrent update reports conflict", async () => {
  const stale = fixture({ getBody: { sha: NEW_SHA } });
  assert.equal((await stale.handler(request())).status, 409);
  assert.equal(stale.calls.length, 1);
  const raced = fixture({ putStatus: 409 });
  assert.equal((await raced.handler(request())).status, 409);
  assert.equal(raced.calls.length, 2);
});

test("GitHub failures and malformed responses are sanitized", async () => {
  for (const options of [{ getStatus: 403 }, { getStatus: 404 }, { getBody: {} },
    { putStatus: 422 }, { putStatus: 500 }, { putBody: {} }, { fetchError: true }]) {
    const { handler, calls } = fixture(options);
    const response = await handler(request());
    assert.ok([502, 503].includes(response.status));
    assert.doesNotMatch(await response.text(), /sensitive|server-secret-token|Authorization/);
    if (options.getStatus || options.getBody || options.fetchError) assert.equal(calls.length, 1);
  }
});

test("CORS preflight supports only the site and loopback QA origins", async () => {
  for (const origin of [ORIGIN, "http://localhost:4173", "http://127.0.0.1:4173"]) {
    const { handler, calls, authCalls } = fixture();
    const response = await handler(new Request("https://example.test", { method: "OPTIONS", headers: { Origin: origin } }));
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(response.headers.get("Access-Control-Allow-Headers"), "content-type");
    assert.equal(calls.length + authCalls.length, 0);
  }
  const { handler, calls, authCalls } = fixture();
  const denied = await handler(request({}, { Origin: "https://attacker.test" }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(calls.length + authCalls.length, 0);
});

test("unsupported methods and content types are rejected before authorization", async () => {
  const { handler, authCalls } = fixture();
  assert.equal((await handler(new Request("https://example.test"))).status, 405);
  assert.equal((await handler(request({}, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal(authCalls.length, 0);
});
