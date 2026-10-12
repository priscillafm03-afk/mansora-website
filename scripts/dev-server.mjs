// Local preview that mimics Vercel: serves public/ with clean URLs, applies the
// headers and rewrites from vercel.json, and runs the api/ functions.
// Usage: npm run dev   (http://localhost:3000)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const PORT = Number(process.env.PORT || 3000);
// Without a Resend key locally, log emails instead of sending them.
if (!process.env.RESEND_API_KEY) process.env.MAIL_MOCK ??= "1";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".xml": "application/xml",
  ".txt": "text/plain", ".webmanifest": "application/manifest+json", ".json": "application/json",
};

const toRegex = (src) => new RegExp("^" + src.replace(/\(\.\*\)/g, "(.*)") + "$");

function headersFor(path, drop = []) {
  const out = {};
  for (const rule of config.headers) {
    if (toRegex(rule.source).test(path)) for (const h of rule.headers) out[h.key] = h.value;
  }
  delete out["Strict-Transport-Security"]; // not meaningful on http://localhost
  out["Content-Security-Policy"] = (out["Content-Security-Policy"] || "").replace("; upgrade-insecure-requests", "") + "; report-uri /__csp-report";
  for (const k of drop) delete out[k];
  return out;
}

async function tryFile(p) {
  try { return (await stat(p)).isFile() ? p : null; } catch { return null; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);

  // Local only: log Content-Security-Policy violations so a too-strict policy is easy to spot.
  if (path === "/__csp-report") {
    let body = "";
    for await (const c of req) body += c;
    try {
      const r = JSON.parse(body)["csp-report"] || {};
      console.log(`[CSP] blocked ${r["effective-directive"] || r["violated-directive"]}: ${r["blocked-uri"]} (${r["source-file"] || ""}:${r["line-number"] || ""})`);
    } catch { console.log("[CSP]", body); }
    res.writeHead(204); return res.end();
  }

  const redirect = config.redirects.find((r) => r.source === path);
  if (redirect) { res.writeHead(308, { Location: redirect.destination }); return res.end(); }
  const rewrite = config.rewrites.find((r) => r.source === path);
  if (rewrite) path = rewrite.destination;

  if (path.startsWith("/api/")) {
    const name = path.slice(5).replace(/[^a-z0-9-]/gi, "");
    const file = await tryFile(join(root, "api", `${name}.js`));
    if (!file || name.startsWith("_")) { res.writeHead(404); return res.end("Not found"); }
    const mod = await import(pathToFileURL(file).href);
    const handler = mod[req.method];
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, {
      method: req.method, headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = handler ? await handler(request) : new Response("Method not allowed", { status: 405 });
    res.writeHead(response.status, { ...headersFor(path), ...Object.fromEntries(response.headers) });
    return res.end(Buffer.from(await response.arrayBuffer()));
  }

  if (path.endsWith(".html")) { res.writeHead(308, { Location: path.slice(0, -5) || "/" }); return res.end(); }
  const pub = join(root, "public");
  const safe = normalize(join(pub, path));
  if (!safe.startsWith(pub)) { res.writeHead(400); return res.end(); }
  const file = (await tryFile(safe)) || (await tryFile(safe + ".html")) || (await tryFile(join(safe, "index.html")));
  if (!file) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Not found"); }
  const drop = (url.searchParams.get("drop") || "").split(",").filter(Boolean); // debug: ?drop=Content-Security-Policy
  // gzip text files like Vercel does, so local Lighthouse runs are representative
  let body = await readFile(file);
  const type = TYPES[extname(file)] || "application/octet-stream";
  const extra = {};
  if (/text|javascript|json|xml|manifest/.test(type) && /gzip/.test(req.headers["accept-encoding"] || "")) {
    body = gzipSync(body); extra["content-encoding"] = "gzip";
  }
  res.writeHead(200, { "content-type": type, ...extra, ...headersFor(path, drop) });
  res.end(body);
}).listen(PORT, () => console.log(`MANSORA preview on http://localhost:${PORT}`));
