// 🛡️ THE GATEKEEPER: decides which addresses a web lab may visit.
//
// A web lab opens a real browser on an address the learner (or an AI) typed.
// Without care, that browser could be pointed at things that are not public
// websites: the learner's own computer (localhost), their home router
// (192.168.x.x), or a cloud server's secret metadata service (169.254.169.254).
// That attack is called SSRF (server-side request forgery).
//
// Checking the name typed is not enough: a public-looking name can resolve to
// a private address, and can change its answer between two lookups (DNS
// rebinding). So this file checks the RESOLVED addresses, and the egress proxy
// (egressProxy.ts) calls it again for every single connection the browser makes.

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Verdict = { ok: true; url: URL } | { ok: false; reason: string };

// An exact host and port that tests may reach even though it is local.
// Only the test suite sets this (see sessions.ts). The MCP tools cannot.
export interface Allowance {
  host: string;
  port: number;
}

export const ALLOWED_PORTS = new Set([80, 443]);
const MAX_URL_LENGTH = 2048;

// Names that never point at a public website, whatever DNS says.
const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|corp)$/i;

const isAllowed = (host: string, port: number, allow: Allowance[] = []) =>
  allow.some((a) => a.host === host && a.port === port);

const portOf = (url: URL) => (url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80);

// Step 1: is the address well formed, and of a kind we accept at all?
export function checkUrlShape(input: string, allow: Allowance[] = []): Verdict {
  if (typeof input !== "string" || input.length === 0) return { ok: false, reason: "No address was given." };
  if (input.length > MAX_URL_LENGTH) return { ok: false, reason: "That address is too long." };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "That is not a valid web address." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Only http and https addresses can be investigated, not "${url.protocol}".` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Addresses with a user name or password in them are not accepted." };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const port = portOf(url);
  if (isAllowed(host, port, allow)) return { ok: true, url };
  if (!ALLOWED_PORTS.has(port)) return { ok: false, reason: "Only the normal web ports (80 and 443) are allowed." };
  if (!host || LOCAL_NAMES.test(host) || !host.includes(".") && !isIP(host)) {
    return { ok: false, reason: "That address points at a local or private machine, not a public website." };
  }
  if (isIP(host) && !isPublicAddress(host)) {
    return { ok: false, reason: "That address points at a local or private machine, not a public website." };
  }
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// Which IP addresses are public?
// ---------------------------------------------------------------------------

const v4Number = (ip: string) => ip.split(".").reduce((n, part) => n * 256 + Number(part), 0);

// [first address of a range, prefix length]: every range here is NOT public.
const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // this computer (loopback)
  ["169.254.0.0", 16], // link-local, including cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // old 6to4 relays
  ["192.168.0.0", 16], // private (home routers)
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and 255.255.255.255 broadcast
];

function isPublicV4(ip: string): boolean {
  const n = v4Number(ip);
  return !PRIVATE_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4Number(base);
    return n >= start && n < start + size;
  });
}

// Write an IPv6 address out in full, as 16 bytes, so its parts can be compared.
function v6Bytes(ip: string): number[] | null {
  let text = ip.toLowerCase().split("%")[0]; // drop a zone such as %eth0
  // An IPv4 address written at the end (::ffff:1.2.3.4) becomes two hex groups.
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const [a, b, c, d] = tail[1].split(".").map(Number);
    text = text.slice(0, -tail[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = rest !== undefined && rest ? rest.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (rest === undefined && left.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...left, ...Array(rest === undefined ? 0 : missing).fill("0"), ...right];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of groups) {
    const value = parseInt(group || "0", 16);
    if (Number.isNaN(value) || value > 0xffff) return null;
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

const embeddedV4 = (bytes: number[], from: number) => bytes.slice(from, from + 4).join(".");

function isPublicV6(ip: string): boolean {
  const b = v6Bytes(ip);
  if (!b) return false; // could not read it: refuse
  const first = b[0];
  const zeros = (count: number) => b.slice(0, count).every((x) => x === 0);

  // IPv4 hidden inside IPv6: judge the IPv4 address.
  if (zeros(10) && b[10] === 0xff && b[11] === 0xff) return isPublicV4(embeddedV4(b, 12)); // ::ffff:a.b.c.d
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0)) {
    return isPublicV4(embeddedV4(b, 12)); // 64:ff9b::/96, NAT64
  }
  if (b[0] === 0x20 && b[1] === 0x02) return isPublicV4(embeddedV4(b, 2)); // 2002::/16, 6to4

  if (zeros(12)) return false; // ::, ::1 and the old ::a.b.c.d form
  if ((first & 0xe0) !== 0x20) return false; // only 2000::/3 is global unicast; fc00::/7, fe80::/10, ff00::/8 and the rest are not
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // 2001:db8::/32, documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] < 0x02) return false; // 2001::/23, protocol assignments (includes Teredo)
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPublicV4(ip);
  if (kind === 6) return isPublicV6(ip);
  return false;
}

// ---------------------------------------------------------------------------
// Step 2: resolve the name and check every address it points to.
// ---------------------------------------------------------------------------

export type Lookup = (host: string) => Promise<string[]>;

export const systemLookup: Lookup = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

// Returns the addresses to connect to. Refuses if ANY of them is not public: a name
// that answers with both a public and a private address is treated as hostile.
export async function resolvePublic(host: string, port: number, allow: Allowance[] = [], lookup: Lookup = systemLookup): Promise<string[]> {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (isAllowed(bare, port, allow)) return isIP(bare) ? [bare] : await lookup(bare);
  if (!ALLOWED_PORTS.has(port)) throw new PolicyError("Only the normal web ports (80 and 443) are allowed.");
  if (LOCAL_NAMES.test(bare)) throw new PolicyError("That name points at a local or private machine.");

  const addresses = isIP(bare) ? [bare] : await lookup(bare).catch(() => {
    throw new PolicyError("That website's name could not be found.");
  });
  if (addresses.length === 0) throw new PolicyError("That website's name could not be found.");
  if (addresses.some((address) => !isPublicAddress(address))) {
    throw new PolicyError("That name points at a local or private machine, so it is not visited.");
  }
  return addresses;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}
