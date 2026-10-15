// Fast checks of the web lab's safety rules, cleaning, evidence and lesson.
// No browser and no internet: runs with every `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { createServer } from "node:http";
import { checkUrlShape, isPublicAddress, resolvePublic } from "../dist/web/policy.js";
import { startEgressProxy } from "../dist/web/egressProxy.js";
import { keepHeaders, KEPT_RESPONSE_HEADERS, redactText, sanitizeUrl } from "../dist/web/redact.js";
import { buildEvidence, mainDocument } from "../dist/web/evidence.js";
import { checkAnswer, freshLesson, nextHint } from "../dist/web/lesson.js";

// ---------- addresses ----------

test("private, local and special addresses are not public", () => {
  const notPublic = [
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "192.0.2.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2002:a00:1::1", "2001:db8::1", "::127.0.0.1",
  ];
  for (const ip of notPublic) assert.equal(isPublicAddress(ip), false, `${ip} should not be public`);
});

test("ordinary public addresses are public", () => {
  for (const ip of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4007:80b::200e", "::ffff:8.8.8.8"]) {
    assert.equal(isPublicAddress(ip), true, `${ip} should be public`);
  }
});

test("only plain http(s) addresses on normal ports, without passwords or local names, pass the first check", () => {
  for (const bad of ["file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", "http://user:pw@example.com",
    "http://localhost/", "http://printer.local/", "http://metadata.google.internal/", "http://127.0.0.1/", "http://[::1]/",
    "http://10.0.0.1/", "http://example.com:8080/", "http://intranet/", ""]) {
    assert.equal(checkUrlShape(bad).ok, false, `should refuse: ${bad}`);
  }
  for (const good of ["https://example.com", "example.com", "http://example.com/path?q=1", "https://sub.example.org:443/"]) {
    assert.equal(checkUrlShape(good).ok, true, `should accept: ${good}`);
  }
  assert.equal(checkUrlShape("http://127.0.0.1:5555/", [{ host: "127.0.0.1", port: 5555 }]).ok, true, "an exact test allowance passes");
  assert.equal(checkUrlShape("http://127.0.0.1:5556/", [{ host: "127.0.0.1", port: 5555 }]).ok, false, "...but only for that port");
});

test("a name is refused if ANY of its addresses is private (DNS tricks)", async () => {
  const fakeDns = (answers) => async (host) => answers[host] ?? [];
  const dns = fakeDns({ "good.test": ["93.184.216.34"], "mixed.test": ["93.184.216.34", "10.0.0.5"], "sneaky.test": ["127.0.0.1"], "v6.test": ["::ffff:192.168.0.1"] });
  assert.deepEqual(await resolvePublic("good.test", 443, [], dns), ["93.184.216.34"]);
  for (const host of ["mixed.test", "sneaky.test", "v6.test", "nothing.test"]) {
    await assert.rejects(resolvePublic(host, 443, [], dns), `should refuse ${host}`);
  }
  await assert.rejects(resolvePublic("good.test", 22, [], dns), "other ports are refused");
});

// ---------- the checkpoint (proxy), with local sockets only ----------

const ask = (port, line) =>
  new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () => socket.write(line));
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk;
      if (data.includes("\r\n\r\n")) {
        socket.destroy();
        resolve(data.split("\r\n")[0]);
      }
    });
    socket.on("error", () => resolve("error"));
  });

test("the checkpoint refuses private destinations and lets an exact allowance through", async () => {
  const local = createServer((req, res) => res.end("ok"));
  await new Promise((r) => local.listen(0, "127.0.0.1", r));
  const localPort = local.address().port;
  const dns = async (host) => ({ "evil.test": ["10.0.0.7"], "rebind.test": ["169.254.169.254"] })[host] ?? [];
  const proxy = await startEgressProxy({ allow: [{ host: "127.0.0.1", port: localPort }], lookup: dns });
  try {
    assert.match(await ask(proxy.port, "CONNECT evil.test:443 HTTP/1.1\r\nHost: evil.test:443\r\n\r\n"), /403/);
    assert.match(await ask(proxy.port, "CONNECT rebind.test:443 HTTP/1.1\r\n\r\n"), /403/);
    assert.match(await ask(proxy.port, "CONNECT 127.0.0.1:22 HTTP/1.1\r\n\r\n"), /403/);
    assert.match(await ask(proxy.port, "GET http://192.168.1.1/ HTTP/1.1\r\nHost: 192.168.1.1\r\n\r\n"), /403/);
    assert.match(await ask(proxy.port, `CONNECT 127.0.0.1:${localPort} HTTP/1.1\r\n\r\n`), /200/);
    assert.equal(proxy.blocked.length, 4);
    assert.ok(proxy.blocked.every((b) => !("path" in b)), "blocked records keep the host only");
  } finally {
    await proxy.close();
    local.close();
  }
});

// ---------- cleaning ----------

test("secrets are removed from addresses, texts and headers", () => {
  const url = sanitizeUrl("https://user:pw@shop.test/api?q=bread&token=abc&session_id=42&page=2&x=eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop#frag");
  assert.doesNotMatch(url, /user|pw@|abc&|=42|#frag|eyJ/);
  assert.match(url, /q=bread/);
  assert.match(url, /page=2/);

  const text = redactText('{"apiKey":"sk-123","owner":"a@b.com","token":"t","name":"rye","jwt":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"}');
  assert.doesNotMatch(text, /sk-123|a@b\.com|"t"|eyJzdWIi/);
  assert.match(text, /"name":"rye"/);

  const headers = keepHeaders({ "set-cookie": "s=1", authorization: "Bearer x", "content-type": "text/html", "x-api-token": "y" }, KEPT_RESPONSE_HEADERS);
  assert.deepEqual(Object.keys(headers), ["content-type"]);
});

// ---------- evidence and the lesson, from a made-up visit ----------

const visit = {
  requestedUrl: "http://shop.test/start", finalUrl: "http://shop.test/", title: "Shop", startedAt: "2026-01-01T00:00:00.000Z",
  loadMs: 100, navigationError: null, droppedRequests: 0, blockedByPolicy: [{ at: "", host: "10.0.0.1", port: 80, reason: "private" }],
  blockedMethods: [], consoleErrors: [],
  requests: [
    { id: "r1", url: "http://shop.test/start", host: "shop.test", method: "GET", resourceType: "document", isMainDocument: true, status: 302, failure: null, contentType: "text/plain", responseBytes: 5, startMs: 0, durationMs: 3, redirectedFrom: null, requestHeaders: {}, responseHeaders: {}, preview: null },
    { id: "r2", url: "http://shop.test/", host: "shop.test", method: "GET", resourceType: "document", isMainDocument: true, status: 200, failure: null, contentType: "text/html", responseBytes: 900, startMs: 4, durationMs: 5, redirectedFrom: "r1", requestHeaders: {}, responseHeaders: {}, preview: null },
    { id: "r3", url: "http://shop.test/app.js", host: "shop.test", method: "GET", resourceType: "script", isMainDocument: false, status: 200, failure: null, contentType: "text/javascript", responseBytes: 300, startMs: 20, durationMs: 4, redirectedFrom: null, requestHeaders: {}, responseHeaders: {}, preview: null },
    { id: "r4", url: "http://cdn.test/items", host: "cdn.test", method: "GET", resourceType: "fetch", isMainDocument: false, status: 200, failure: null, contentType: "application/json", responseBytes: 40, startMs: 30, durationMs: 9, redirectedFrom: null, requestHeaders: {}, responseHeaders: {}, preview: "{}" },
  ],
};

test("evidence is labelled, and every interpretation says what it rests on", () => {
  const evidence = buildEvidence(visit);
  const of = (c) => evidence.filter((e) => e.certainty === c);
  assert.equal(of("observed").filter((e) => e.kind === "request").length, 4);
  assert.ok(of("observed").some((e) => e.kind === "redirect"));
  assert.ok(of("observed").some((e) => e.kind === "blocked"));
  assert.ok(of("interpretation").length >= 1 && of("interpretation").every((e) => e.basedOn.length > 0));
  assert.ok(of("hypothesis").some((e) => e.requestIds.includes("r4")), "JSON for scripts is only a hypothesis");
  assert.ok(of("unknown").length >= 1);
  assert.equal(mainDocument(visit).id, "r2", "after a redirect, the page is the last document");
});

test("the lesson checks answers against the evidence and gives graded hints", () => {
  let state = freshLesson();
  const wrongRedirect = checkAnswer(visit, state, "r1");
  assert.equal(wrongRedirect.correct, false);
  assert.match(wrongRedirect.text, /302/);
  const wrongScript = checkAnswer(visit, wrongRedirect.state, "3");
  assert.match(wrongScript.text, /script/);
  state = wrongScript.state;
  const hints = [];
  for (let i = 0; i < 4; i++) {
    const h = nextHint(visit, state);
    hints.push(h.text);
    state = h.state;
  }
  assert.match(hints[1], /redirect/i);
  assert.match(hints[2], /r2/);
  assert.equal(hints[3], hints[2], "after the last hint, it stays on the answer");
  const right = checkAnswer(visit, state, " R2 ");
  assert.equal(right.correct, true);
  assert.equal(right.state.attempts, 3);
  assert.ok(right.state.solvedAt);
});
