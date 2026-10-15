// A small website that runs on this computer, so the web lab tests never depend
// on the internet. It has one of each thing the lab must handle: a redirect,
// a JSON API, a failing request, a late (lazy) script, a large answer, a cookie,
// a request that would change data, and attempts to reach private addresses.
//
// It also starts a second server, the "private service". Nothing in a web lab
// may ever reach it; the tests check that it received zero requests.
import { createServer } from "node:http";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

export async function startTestSites() {
  const privateHits = [];
  const privateServer = createServer((req, res) => {
    privateHits.push(`${req.method} ${req.url}`);
    res.end("private data");
  });
  const privatePort = await listen(privateServer);

  const siteHits = [];
  let sitePort = 0;
  const page = (title, body) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="/style.css"></head><body>${body}</body></html>`;

  const site = createServer((req, res) => {
    siteHits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url, "http://localhost");
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, { "content-type": type, ...headers });
      res.end(body);
    };

    switch (url.pathname) {
      case "/start": // a redirect into the site
        return send(302, "text/plain", "moved", { location: "/" });
      case "/":
        return send(
          200,
          "text/html; charset=utf-8",
          page(
            "Test shop",
            `<h1>Test shop</h1>
<button id="more">Show more</button><p id="out"></p>
<input type="search" id="q" aria-label="Search breads"><ul id="results"></ul>
<button id="reviews">Load reviews</button><ul id="review-list"></ul>
<a href="http://127.0.0.1:${privatePort}/admin">Staff area</a>
<img src="/logo.png" alt="">
<img src="http://10.0.0.1/tracker.png" alt="">
<script src="/app.js"></script>`
          ),
          { "set-cookie": "session=TOPSECRETCOOKIE123; HttpOnly", "x-powered-by": "TestServer" }
        );
      case "/style.css":
        return send(200, "text/css", "body { font-family: sans-serif; }");
      case "/logo.png":
        return send(200, "image/png", Buffer.from("89504e470d0a1a0a", "hex"));
      case "/app.js":
        return send(
          200,
          "text/javascript",
          `fetch("/api/items?q=bread&token=abcdefghijklmnopqrstuvwxyz123456").then(r => r.json()).then(d => { document.getElementById("out").textContent = d.items.length + " items"; });
fetch("/missing.json").catch(() => {});
fetch("/big.json").then(r => r.text()).catch(() => {});
fetch("/api/save", { method: "POST", body: "x=1" }).catch(() => {});
fetch("http://169.254.169.254/latest/meta-data/").catch(() => {});
fetch("http://127.0.0.1:${privatePort}/admin").catch(() => {});
setTimeout(() => { const s = document.createElement("script"); s.src = "/lazy.js"; document.body.appendChild(s); }, 300);
document.getElementById("more").addEventListener("click", () => { document.getElementById("out").textContent = "You clicked and the page changed by itself."; });
document.getElementById("q").addEventListener("keydown", (e) => { if (e.key === "Enter") fetch("/api/search?q=" + encodeURIComponent(e.target.value)).then(r => r.json()).then(d => { document.getElementById("results").innerHTML = d.found.map(x => "<li>" + x + "</li>").join(""); }); });
document.getElementById("reviews").addEventListener("click", () => { fetch("/api/reviews").then(r => r.json()).then(d => { document.getElementById("review-list").innerHTML = d.reviews.map(x => "<li>" + x + "</li>").join(""); }); });`
        );
      case "/lazy.js":
        return send(200, "text/javascript", "window.lazyLoaded = true;");
      case "/api/items":
        return send(200, "application/json", JSON.stringify({ items: ["bread", "rye"], apiKey: "sk-should-never-be-kept", owner: "someone@example.com" }));
      case "/api/search":
        return send(200, "application/json", JSON.stringify({ found: ["Seeded rye", "Rye loaf"].filter((x) => x.toLowerCase().includes((url.searchParams.get("q") || "").toLowerCase())) }));
      case "/api/reviews":
        return send(200, "application/json", JSON.stringify({ reviews: ["Lovely crust", "Best rye in town", "Friendly staff"] }));
      case "/api/save":
        return send(200, "application/json", '{"saved":true}');
      case "/big.json":
        return send(200, "application/json", JSON.stringify({ filler: "x".repeat(200_000) }));
      case "/to-private": // a redirect to a private address: must be refused
        return send(302, "text/plain", "moved", { location: `http://127.0.0.1:${privatePort}/` });
      default:
        return send(404, "text/plain", "not found");
    }
  });
  sitePort = await listen(site);

  return {
    sitePort,
    privatePort,
    siteHits,
    privateHits,
    url: (path) => `http://127.0.0.1:${sitePort}${path}`,
    close: async () => {
      await new Promise((resolve) => site.close(resolve));
      await new Promise((resolve) => privateServer.close(resolve));
    },
  };
}
