// 🚧 THE CHECKPOINT: every connection the lab's browser makes goes through here.
//
// The browser is started with this small proxy as its only way out. The proxy
// receives the NAME the browser wants to reach (the browser does not look up
// addresses itself when it uses a proxy), checks it with the gatekeeper,
// resolves it once, refuses anything that is not public, and then connects to
// exactly the address it checked. That covers what a check on the first
// address alone would miss: redirects, images and scripts from other hosts,
// and names whose DNS answer changes between two lookups.

import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import { type Allowance, PolicyError, resolvePublic, systemLookup, type Lookup } from "./policy.js";

export interface BlockedConnection {
  at: string;
  host: string; // the name only, never the full address with its path
  port: number;
  reason: string;
}

export interface EgressProxy {
  port: number;
  blocked: BlockedConnection[];
  close: () => Promise<void>;
}

interface ProxyOptions {
  allow?: Allowance[];
  lookup?: Lookup;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

const MAX_BLOCKED_RECORDS = 100;

export async function startEgressProxy({ allow = [], lookup = systemLookup, maxConnections = 48, idleTimeoutMs = 30_000 }: ProxyOptions = {}): Promise<EgressProxy> {
  const blocked: BlockedConnection[] = [];
  const sockets = new Set<Socket>();

  const refuse = (host: string, port: number, reason: string) => {
    if (blocked.length < MAX_BLOCKED_RECORDS) blocked.push({ at: new Date().toISOString(), host: host.slice(0, 200), port, reason });
  };

  // Resolve and check a destination; returns the one checked address to connect to.
  const destination = async (host: string, port: number): Promise<string> => {
    const addresses = await resolvePublic(host, port, allow, lookup);
    return addresses[0];
  };

  // Plain http:// requests arrive as "GET http://host/path".
  async function onRequest(req: IncomingMessage, res: ServerResponse) {
    let target: URL;
    try {
      target = new URL(req.url ?? "");
      if (target.protocol !== "http:") throw new Error();
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = target.port ? Number(target.port) : 80;
    let address: string;
    try {
      address = await destination(target.hostname, port);
    } catch (error) {
      refuse(target.hostname, port, error instanceof PolicyError ? error.message : "Could not check this address.");
      res.writeHead(403, { "content-type": "text/plain" }).end("Blocked by Revelen: not a public website.");
      return;
    }

    // Hop-by-hop headers belong to the browser-to-proxy leg, not to the website.
    const headers = { ...req.headers };
    for (const name of ["proxy-connection", "proxy-authorization", "connection", "keep-alive"]) delete headers[name];

    const upstream = httpRequest(
      { host: address, port, method: req.method, path: target.pathname + target.search, headers, setHost: false, timeout: idleTimeoutMs },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      }
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502).end();
      else res.destroy();
    });
    req.pipe(upstream);
  }

  // https:// connections arrive as "CONNECT host:443". The proxy only joins two
  // pipes: the encrypted conversation stays between the browser and the website.
  async function onConnect(req: IncomingMessage, client: Socket, head: Buffer) {
    const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(req.url ?? "");
    if (!match) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const host = match[1];
    const port = Number(match[2]);
    let address: string;
    try {
      address = await destination(host, port);
    } catch (error) {
      refuse(host, port, error instanceof PolicyError ? error.message : "Could not check this address.");
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = connect({ host: address, port });
    sockets.add(upstream);
    upstream.setTimeout(idleTimeoutMs, () => upstream.destroy());
    upstream.on("close", () => sockets.delete(upstream));
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on("error", () => client.destroy());
    client.on("error", () => upstream.destroy());
  }

  const server = createServer((req, res) => void onRequest(req, res));
  server.on("connect", (req, client: Socket, head) => void onConnect(req, client, head));
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.maxConnections = maxConnections;

  // Listen on this computer only, on a port the system picks.
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };

  return {
    port,
    blocked,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
