import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPoll, castVote, publicView, validShareToken } from "./poll-core.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const storePath = process.env.POLL_FILE || "/tmp/byospot-polls.json";
const polls = load();

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg"
};

function load() {
  try { return JSON.parse(fs.readFileSync(storePath, "utf8")); }
  catch (e) { return {}; }
}
function save() {
  fs.writeFileSync(storePath, JSON.stringify(polls));
}

function send(res, status, body, type) {
  res.writeHead(status, { "content-type": type || "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function match(pathname) {
  if (pathname === "/api/polls") return { kind: "collection" };
  var vote = pathname.match(/^\/api\/polls\/([A-Za-z0-9_-]+)\/vote$/);
  if (vote) return { kind: "vote", token: vote[1] };
  var poll = pathname.match(/^\/api\/polls\/([A-Za-z0-9_-]+)$/);
  if (poll) return { kind: "poll", token: poll[1] };
  return null;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on("data", function (c) { chunks.push(c); });
    req.on("end", function () {
      var text = Buffer.concat(chunks).toString("utf8");
      if (text.length > 4000) return reject(Object.assign(new Error("large"), { status: 400, publicMessage: "That request is too large." }));
      if (!text) return resolve({});
      try { resolve(JSON.parse(text)); }
      catch (e) { reject(Object.assign(new Error("json"), { status: 400, publicMessage: "That request could not be read." })); }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname) {
  const route = match(pathname);
  if (!route) return send(res, 404, { error: "This voting link isn't valid or has expired." });
  try {
    if (route.kind === "collection" && req.method === "POST") {
      const body = await readBody(req);
      const created = createPoll(body.restaurantIds);
      if (!created.ok) return send(res, created.status, { error: created.error });
      polls[created.poll.shareToken] = created.poll;
      save();
      return send(res, 201, publicView(created.poll, ""));
    }
    if (!validShareToken(route.token) || !polls[route.token]) {
      return send(res, 404, { error: "This voting link isn't valid or has expired." });
    }
    if (route.kind === "poll" && req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      return send(res, 200, publicView(polls[route.token], url.searchParams.get("voter") || ""));
    }
    if (route.kind === "vote" && req.method === "POST") {
      const body = await readBody(req);
      const result = castVote(polls[route.token], body);
      if (!result.ok) {
        return send(res, result.status, Object.assign({ error: result.error }, result.poll ? publicView(result.poll, body.participantToken || "") : {}));
      }
      polls[route.token] = result.poll;
      save();
      return send(res, 200, publicView(result.poll, body.participantToken || ""));
    }
    return send(res, 405, { error: "That action isn't available." });
  } catch (err) {
    return send(res, err.status || 500, { error: err.publicMessage || "We couldn't reach the voting service." });
  }
}

function start(port) {
  const server = http.createServer(function (req, res) {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith("/api/")) return handleApi(req, res, pathname);
    var file = path.normalize(path.join(root, pathname));
    if (!file.startsWith(root)) return send(res, 403, "no");
    var ext = path.extname(pathname);
    var exists = fs.existsSync(file) && fs.statSync(file).isFile();
    if (!exists) {
      if (ext) return send(res, 404, "Not found", "text/plain; charset=utf-8");
      file = path.join(root, "index.html");
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(function (resolve) {
    server.listen(port, "127.0.0.1", function () { resolve(server); });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 4173);
  start(port).then(function () { console.log("BYOSpot dev server http://127.0.0.1:" + port); });
}

export { start };
