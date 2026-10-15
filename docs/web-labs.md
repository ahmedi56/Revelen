# Web labs: design, security and status

Web labs let a learner investigate how a public website behaves, from the
evidence one browser visit leaves behind, with a tutor that teaches instead of
reporting. This document covers the first vertical slice (Revelen 0.5.0).

## 1. Repository audit (before this work)

- **Shape.** A single MCP server over stdio (`src/index.ts`, 9 tools) for binary
  labs: REA + Ghidra behind `src/bridge/rea.ts`, a token optimizer, concept cards,
  quizzes, stories, and a progress file in `~/.revelen`.
- **Baseline.** `npm test` passed: 11 unit tests and 13 smoke checks, using a fake
  REA so no Ghidra is needed.
- **Findings that shaped the design.**
  - All tools were registered in one file. The web tools live in `src/web/` and
    register through one function, so the binary and web engines share nothing
    but the server and the progress file.
  - The tutor content (concepts, quizzes, stories) is deterministic and needs no
    AI provider. The web lesson follows the same rule.
  - Progress was a flat list per kind; web lessons were added as one more list.

## 2. Architecture and data flow

```
MCP client (Claude...)
   │ stdio
   ▼
src/web/tools.ts ──── 8 tools, validated with zod, bounded output
   │
   ├─ sessions.ts ──── starts a visit, saves it, finds it again
   │     │
   │     ├─ capture.ts ── Playwright + Chromium, one isolated context per visit
   │     │     │  every connection ─► egressProxy.ts ─► policy.ts (resolve, check, pin)
   │     │     │  every record ─► redact.ts (secrets removed before keeping)
   │     │     └─ browser closed as soon as the visit ends
   │     │
   │     └─ store.ts ──── ~/.revelen/web-labs/<id>.json (versioned, newest 20 kept)
   │
   ├─ evidence.ts ──── observed / interpretation / hypothesis / unknown
   └─ lesson.ts ────── question, graded hints, answer check, all from evidence
```

The flow of one lab: the address is checked → a proxy and a fresh Chromium start
→ the page loads, plus 2 seconds for late requests → the cleaned record is
saved → the browser closes. Every later tool works from the saved record,
which is also what makes a lab resumable.

### Module map (the spec's A to N)

| Spec module | Where it is now |
|---|---|
| A. Target and session management | `sessions.ts`, `store.ts` |
| B. Browser automation | `capture.ts` (Playwright adapter) |
| C. Network capture | `capture.ts` |
| D. DOM inspection | not yet (phase 7) |
| E. JavaScript and asset inspection | not yet (phase 7) |
| F. Browser storage | deliberately not captured |
| G. Evidence normalization | `evidence.ts` |
| H. Fingerprinting | not yet in Revelen (Revelen Learn has a simpler, separate one) |
| I. Lessons | `lesson.ts` |
| J. Hints and answers | `lesson.ts` |
| K. Progress | `store.ts`, `src/progress.ts` |
| L. MCP | `tools.ts` |
| M. Security policy | `policy.ts`, `egressProxy.ts`, `redact.ts`, read-only rule in `capture.ts` |
| N. Tests and diagnostics | `test/web-unit.test.mjs`, `test/web/`, `revelen_check_setup` |

## 3. Security

### What is enforced, and how it is tested

| Rule | How | Test |
|---|---|---|
| Only http/https, ports 80/443, no user:password, no local names | `checkUrlShape` | unit |
| No private, local, link-local, metadata or special addresses (IPv4 and IPv6, including IPv4 hidden in IPv6, NAT64, 6to4) | `isPublicAddress` | unit, 24 refused + 6 accepted examples |
| A name is refused if ANY of its addresses is private | `resolvePublic` | unit, with a fake DNS |
| Every connection is checked, not just the first address: redirects, images, scripts, other hosts | Chromium's only route out is `egressProxy.ts`; it resolves the name itself, checks it, and connects to the address it checked (defeats DNS rebinding) | browser: a private service receives zero requests; a redirect to it is refused |
| Chromium cannot skip the proxy for localhost, or use UDP around it | `bypass: "<-loopback>"`, QUIC off, WebRTC limited to proxied traffic | browser test above |
| Read-only: no POST, PUT, DELETE... | `page.route` aborts every other method | browser: the site never receives the POST |
| No downloads, permissions, service workers | browser context options | by configuration |
| Secrets are never kept | addresses cleaned, only a short list of harmless headers kept, JSON/text previews cleaned and capped at 1,500 characters, nothing over 64 KB previewed | unit and browser: cookie, token, API key and e-mail absent from the record |
| Website text cannot steer the tutor | all website-derived text is control-character-stripped, length-capped and wrapped in UNTRUSTED PAGE DATA markers; the skill tells the tutor never to follow it | by construction; not testable against every possible injection |
| Limits | 25 s navigation, 300 requests kept, 2 labs at once, browser closed after each visit, 20 saved labs | by configuration |
| No path tricks on saved labs | lab ids must match `w-` + 8 hex characters before they touch the disk | by construction |

The test allowance (`REVELEN_WEB_TEST_ALLOW=127.0.0.1:<port>`) exists so the
tests can visit their own local site. It only admits the exact host and port
listed, and no MCP tool can set it.

### Limits of this protection, stated plainly

- **This is for local use by the learner.** The browser runs on the learner's
  computer with their user rights. Chromium's sandbox is the main barrier
  against a hostile page. A hosted, multi-user version needs much more: each
  browser in its own container or VM, a network firewall enforcing the same
  egress rules below the proxy, and authentication.
- **The proxy checks where connections go, not what is inside HTTPS.** It
  cannot see methods inside encrypted connections; the read-only rule in the
  browser covers that, but WebSocket messages are not inspected.
- **DNS prefetching** by Chromium can still send DNS queries (not connections)
  for names on a page.
- **Redaction is pattern-based.** It removes common secrets; it cannot promise
  to recognise every secret a website might put in its traffic.

## 4. Supported websites, with evidence

Measured on 2026-10-14, one read-only visit each, `node test/web/measure.mjs`:

| Site | Kind | Visit (incl. browser start) | Page load | Requests | Hosts | Writes stopped | Saved |
|---|---|---|---|---|---|---|---|
| example.com | static HTML | 4,321 ms, then 2,908 ms | 432 ms | 2 | 1 | 0 | 4 KB |
| vuejs.org | Vue site on Netlify | 4,716 ms | 1,892 ms | 50 | 5 | 0 | 78 KB |
| wordpress.org | WordPress | 6,346 ms | 3,476 ms | 51 | 9 | 5 | 45 KB |
| local test site | redirect, API, 404, lazy script, 200 KB answer | about 4,400 ms | — | 10+ | 1 | 1 | — |

What this shows: plain HTML, a modern JavaScript site and a WordPress site can
all be visited and recorded. It does not show that every site works: sites
behind logins, sites that block automated browsers, sites on unusual ports,
and sites that need WebSockets for their content are not supported or not
tested. Single-page apps that load content only after clicks need the
before-and-after comparison, which is not built yet.

Every visit costs about 2 seconds of fixed time (browser start, plus the 2
seconds of waiting after load). The memory of the measuring process grew by
67 MB on the first visit (Playwright loading) and by 3 to 15 MB on later ones.

## 5. What a web lab cannot do

A URL is the start of an investigation, not a key to a website's source code.

| Can be observed | Cannot be recovered |
|---|---|
| Which requests a browser makes, their types, status codes, sizes, timing | The server's code, database or private logic |
| The HTML, CSS and JavaScript a server chooses to send | The original, uncompiled source the developers wrote |
| Signs that hint at a CMS or framework | Proof of the full architecture: a sign is a clue, not a verdict |

Revelen never probes admin pages, guesses hidden addresses, bypasses logins or
tests for vulnerabilities.

## 6. Unresolved risks

1. A hostile page and the local Chromium sandbox: acceptable for one learner on
   their own machine, not for a public service.
2. Pattern-based redaction can miss an unusual secret format.
3. Prompt injection through website text is reduced (markers, cleaning, skill
   rules), not eliminated: it depends on the AI client respecting the markers.
4. Playwright and Chromium are a large download (about 150 MB) that `npx revelen`
   users must run once; binary labs keep working without it.
5. Request initiators (which script started a request) are not captured, so
   the tutor cannot yet connect a request to the code that made it.

## 7. Backlog and next releases

| Release | Content | Why in this order |
|---|---|---|
| 0.6 | `revelen_compare_network_activity`: approved clicks on a still-open page, before-and-after timelines | the spec's MVP priority, and the way to test hypotheses |
| 0.7 | `revelen_inspect_page_structure`: headings, landmarks, forms (read-only), scripts and styles listed | turns "what loaded" into "what it built" |
| 0.8 | request initiators through the Chrome DevTools Protocol, fingerprints with stated confidence | lets the tutor connect a request to its script |
| 0.9 | more lessons (caching, third-party hosts, failed requests), shared quiz engine with binary labs | content, once the evidence is rich enough |
| later | Mode B, a web interface (likely inside Revelen Learn) using these same modules through an API, with browsers in containers | only when there are users beyond the local machine |
