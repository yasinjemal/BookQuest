import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;

function ipv4Number(address: string): number {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => ((value << 8) | octet) >>> 0, 0);
}

export function isBlockedSourceAddress(address: string): boolean {
  const kind = net.isIP(address);
  if (kind === 4) {
    const value = ipv4Number(address);
    const inRange = (base: string, bits: number) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4Number(base) & mask);
    };
    return [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
      ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
      ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
      ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
      ["224.0.0.0", 4],
    ].some(([base, bits]) => inRange(String(base), Number(bits)));
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isBlockedSourceAddress(normalized.slice("::ffff:".length));
    }
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }
  return true;
}

async function approvedAddress(hostname: string) {
  if (hostname.toLowerCase() === "localhost") throw new Error("Private webpage addresses are not allowed");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isBlockedSourceAddress(entry.address))) {
    throw new Error("Private webpage addresses are not allowed");
  }
  return addresses[0];
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

export function extractReadableWebText(html: string): { title: string; text: string } {
  const title = decodeHtml(html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1] ?? "Web source")
    .replace(/\s+/g, " ")
    .trim();
  const text = decodeHtml(
    html
      .replace(/<(script|style|noscript|svg|canvas)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: title || "Web source", text };
}

async function requestPinned(url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const approved = await approvedAddress(url.hostname);
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          Accept: "text/html,text/plain;q=0.9",
          "User-Agent": "BookQuest-SourceImporter/1.0",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, approved.address, approved.family),
        timeout: 10_000,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy(new Error("Webpage is too large to import"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    request.on("timeout", () => request.destroy(new Error("Webpage import timed out")));
    request.on("error", reject);
    request.end();
  });
}

export async function fetchWebSource(rawUrl: string) {
  let url = new URL(rawUrl);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error("Use a public HTTP or HTTPS webpage URL");
    }
    if (url.port && !["80", "443"].includes(url.port)) {
      throw new Error("Custom webpage ports are not allowed");
    }
    const response = await requestPinned(url);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || redirect === 3) throw new Error("Webpage redirected too many times");
      url = new URL(location, url);
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Webpage returned HTTP ${response.status}`);
    }
    const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Webpage must return HTML or plain text");
    }
    const extracted = contentType.includes("text/html")
      ? extractReadableWebText(response.body)
      : { title: url.hostname, text: response.body.trim() };
    if (extracted.text.length < 100) throw new Error("Webpage does not contain enough readable text");
    return {
      finalUrl: url.toString(),
      title: extracted.title,
      contentType,
      text: extracted.text,
    };
  }
  throw new Error("Webpage import failed");
}
