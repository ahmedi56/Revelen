// Web lab tests with a real Chromium against the local test website.
// Needs Playwright's Chromium (npx playwright install chromium). No internet.
// Run with: npm run test:web
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { capture } from "../../dist/web/capture.js";
import { startTestSites } from "./site.mjs";

let sites;
before(async () => {
  sites = await startTestSites();
});
after(async () => {
  await sites.close();
});

const allowSite = () => [{ host: "127.0.0.1", port: sites.sitePort }];
const timings = [];

test("a visit records the redirect, the page, its files, its API, the failure and the late script", async () => {
  const started = performance.now();
  const live = await capture(sites.url("/start"), { allow: allowSite() });
  await live.close();
  timings.push(performance.now() - started);
  const c = live.result;
  const find = (part) => c.requests.find((r) => r.url.includes(part));

  const first = c.requests[0];
  assert.equal(first.status, 302);
  const home = c.requests.find((r) => r.redirectedFrom === first.id);
  assert.ok(home && home.isMainDocument && home.status === 200, "the redirect is followed to the main document");
  assert.equal(find("/style.css").resourceType, "stylesheet");
  assert.equal(find("/app.js").resourceType, "script");
  assert.equal(find("/missing.json").status, 404);
  assert.ok(find("/lazy.js"), "a script added 300 ms later is recorded");
  assert.ok(c.requests.length >= 8);
  assert.equal(c.title, "Test shop");
});

test("secrets never reach the evidence", async () => {
  const live = await capture(sites.url("/"), { allow: allowSite() });
  await live.close();
  const kept = JSON.stringify(live.result);
  assert.doesNotMatch(kept, /TOPSECRETCOOKIE123/, "cookies are not kept");
  assert.doesNotMatch(kept, /abcdefghijklmnopqrstuvwxyz123456/, "token in the address is removed");
  assert.doesNotMatch(kept, /sk-should-never-be-kept|someone@example\.com/, "secrets in the JSON preview are removed");
  const api = live.result.requests.find((r) => r.url.includes("/api/items"));
  assert.match(api.url, /q=bread/);
  assert.match(api.preview, /"items"/);
  const big = live.result.requests.find((r) => r.url.includes("/big.json"));
  assert.equal(big.preview, null, "large answers get no preview");
  assert.ok(big.responseBytes > 100_000);
});

test("the lab never changes data and never reaches private addresses", async () => {
  sites.privateHits.length = 0;
  sites.siteHits.length = 0;
  const live = await capture(sites.url("/"), { allow: allowSite() });
  await live.close();
  const c = live.result;
  assert.deepEqual(sites.privateHits, [], "the private service received nothing");
  assert.ok(!sites.siteHits.some((hit) => hit.startsWith("POST")), "the POST never reached the site");
  assert.ok(c.blockedMethods.some((m) => m.method === "POST"));
  const refused = c.blockedByPolicy.map((b) => b.host);
  for (const host of ["10.0.0.1", "169.254.169.254", "127.0.0.1"]) assert.ok(refused.includes(host), `${host} was refused`);
});

test("a redirect to a private address is refused", async () => {
  sites.privateHits.length = 0;
  const live = await capture(sites.url("/to-private"), { allow: allowSite() });
  await live.close();
  assert.deepEqual(sites.privateHits, []);
  assert.ok(live.result.blockedByPolicy.some((b) => b.host === "127.0.0.1" && b.port === sites.privatePort));
});

test("addresses outside the rules are refused before any browser starts", async () => {
  for (const bad of ["file:///C:/Windows/win.ini", "http://localhost/", "http://192.168.1.1/", `http://127.0.0.1:${sites.privatePort}/`]) {
    await assert.rejects(capture(bad, { allow: allowSite() }), `should refuse ${bad}`);
  }
});

test("the whole lesson works through MCP: start, timeline, inspect, hint, answer, resume, progress, stop", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "revelen-web-"));
  const client = new Client({ name: "revelen-web-test", version: "1.0.0" });
  const env = { ...process.env, REVELEN_HOME: home, REVELEN_WEB_TEST_ALLOW: `127.0.0.1:${sites.sitePort}` };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env }));
  const call = async (name, args) => (await client.callTool({ name, arguments: args })).content[0].text;

  try {
    const started = await call("revelen_start_web_lab", { url: sites.url("/start") });
    const id = /Web lab (w-[a-f0-9]{8})/.exec(started)[1];
    assert.match(started, /UNTRUSTED PAGE DATA/);
    assert.match(started, /Which request brought the page's HTML/);

    const timeline = await call("revelen_get_network_timeline", { lab: id, limit: 5 });
    assert.match(timeline, /r1 +GET +302/);
    assert.match(timeline, /more: call again with offset 5/);

    assert.match(await call("revelen_inspect_request", { lab: id, request: "r2" }), /main document/);
    assert.match(await call("revelen_list_evidence", { lab: id, certainty: "unknown" }), /cannot be seen from a browser/);

    assert.match(await call("revelen_web_answer", { lab: id, answer: "r1" }), /302/);
    assert.match(await call("revelen_web_hint", { lab: id }), /Hint 1/);

    // A second client, as if the learner came back the next day: the lab resumes from disk.
    const later = new Client({ name: "revelen-web-test-2", version: "1.0.0" });
    await later.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env }));
    const answer = (await later.callTool({ name: "revelen_web_answer", arguments: { lab: id, answer: "r2" } })).content[0].text;
    assert.match(answer, /Correct/);
    const progress = (await later.callTool({ name: "revelen_web_progress", arguments: {} })).content[0].text;
    assert.match(progress, new RegExp(`${id}.*solved`));
    await later.close();

    assert.match(await call("revelen_stop_web_lab", { lab: id }), /deleted/);
    assert.match(await call("revelen_get_network_timeline", { lab: id }), /no saved web lab/);
    const refused = await client.callTool({ name: "revelen_start_web_lab", arguments: { url: "http://localhost/" } });
    assert.equal(refused.isError, true);
  } finally {
    await client.close();
  }
});

test("the first visit lists what can be clicked or typed into", async () => {
  const live = await capture(sites.url("/"), { allow: allowSite() });
  await live.close();
  const texts = live.result.actions.map((a) => `${a.kind}:${a.text}`);
  assert.ok(texts.includes("click:Show more"));
  assert.ok(texts.includes("click:Load reviews"));
  assert.ok(texts.some((t) => t.startsWith("type:")), "the search box is listed");
});

test("comparisons through MCP: a request that brings data, a change without a request, a refused link", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "revelen-web-"));
  const client = new Client({ name: "revelen-web-test-3", version: "1.0.0" });
  const env = { ...process.env, REVELEN_HOME: home, REVELEN_WEB_TEST_ALLOW: `127.0.0.1:${sites.sitePort}` };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ["dist/index.js"], env }));
  const call = async (name, args) => (await client.callTool({ name, arguments: args })).content[0].text;
  const actionId = (list, words) => new RegExp(`(a\\d+) +${words}`).exec(list)[1];

  try {
    sites.privateHits.length = 0;
    const started = await call("revelen_start_web_lab", { url: sites.url("/") });
    const id = /Web lab (w-[a-f0-9]{8})/.exec(started)[1];
    const list = await call("revelen_compare_network_activity", { lab: id });
    assert.match(list, /UNTRUSTED PAGE DATA/);

    // Before lesson 1 is solved, hints and answers still belong to lesson 1.
    assert.match(await call("revelen_web_hint", { lab: id }), /Hint 1: the HTML/);
    assert.match(await call("revelen_web_answer", { lab: id, answer: "r1" }), /Correct/);
    assert.match(await call("revelen_web_hint", { lab: id }), /no open question/);

    // 1. A button that fetches reviews: the new data request is found.
    const reviews = await call("revelen_compare_network_activity", { lab: id, action: actionId(list, 'click button "Load reviews"') });
    const reviewLine = /(r\d+) +GET +200 +fetch .*\/api\/reviews.*NEW/.exec(reviews);
    assert.ok(reviewLine, `the reviews request is marked new:\n${reviews}`);
    assert.match(reviews, /Which one brought the new content/);
    const evidence = await call("revelen_list_evidence", { lab: id, certainty: "interpretation" });
    assert.match(evidence, /most likely caused/);
    assert.match(await call("revelen_web_answer", { lab: id, answer: "none" }), /Not quite/);
    assert.match(await call("revelen_web_answer", { lab: id, answer: reviewLine[1] }), /Correct/);

    // 2. Typing a search: words are sent, personal data is refused.
    const box = /(a\d+) +type into/.exec(list)[1];
    const refusedText = await client.callTool({ name: "revelen_compare_network_activity", arguments: { lab: id, action: box, text: "me@example.com" } });
    assert.equal(refusedText.isError, true);
    const search = await call("revelen_compare_network_activity", { lab: id, action: box, text: "rye" });
    assert.match(search, /\/api\/search\?q=rye.*NEW/);

    // 3. A button that changes the page without asking the server.
    const more = await call("revelen_compare_network_activity", { lab: id, action: actionId(list, 'click button "Show more"') });
    assert.match(more, /of which 0 new/);
    assert.match(await call("revelen_web_hint", { lab: id }), /Hint 1/);
    assert.match(await call("revelen_web_answer", { lab: id, answer: "none" }), /Correct: no request was needed/);

    // 4. A link to a private address: the click happens, the private service is never reached.
    const staff = await call("revelen_compare_network_activity", { lab: id, action: actionId(list, 'click link "Staff area"') });
    assert.ok(staff.length > 0);
    assert.deepEqual(sites.privateHits, [], "the private service received nothing");
    assert.ok(!sites.siteHits.some((hit) => hit.startsWith("POST")));

    assert.match(await call("revelen_web_progress", {}), /comparisons: 4/);
  } finally {
    await client.close();
  }
});

test("time per visit on the local site", () => {
  console.log(`  visit times (ms): ${timings.map((t) => Math.round(t)).join(", ")}`);
  assert.ok(timings.length > 0);
});
