// Measures real visits: time, requests kept, what was refused, and the size of
// the saved evidence. Run with: node test/web/measure.mjs https://example.com ...
// (after npm run build). It visits each address once, read-only, like a web lab.
import { capture } from "../../dist/web/capture.js";
import { buildEvidence } from "../../dist/web/evidence.js";

const addresses = process.argv.slice(2);
if (addresses.length === 0) {
  console.log("Give one or more addresses to measure.");
  process.exit(1);
}

for (const address of addresses) {
  const before = process.memoryUsage().rss;
  const started = performance.now();
  try {
    const live = await capture(address);
    const visitMs = Math.round(performance.now() - started);
    await live.close();
    const c = live.result;
    const types = {};
    for (const r of c.requests) types[r.resourceType] = (types[r.resourceType] ?? 0) + 1;
    const evidence = buildEvidence(c);
    console.log(
      JSON.stringify({
        address,
        visitMs,
        loadMs: c.loadMs,
        navigationError: c.navigationError,
        requests: c.requests.length,
        dropped: c.droppedRequests,
        types,
        hosts: new Set(c.requests.map((r) => r.host)).size,
        refusedByCheckpoint: c.blockedByPolicy.length,
        stoppedWrites: c.blockedMethods.length,
        consoleErrors: c.consoleErrors.length,
        evidence: Object.fromEntries(["observed", "interpretation", "hypothesis", "unknown"].map((k) => [k, evidence.filter((e) => e.certainty === k).length])),
        savedKB: Math.round(JSON.stringify(c).length / 1024),
        rssGrowthMB: Math.round((process.memoryUsage().rss - before) / 1048576),
      })
    );
  } catch (error) {
    console.log(JSON.stringify({ address, error: error.message }));
  }
}
