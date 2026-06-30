#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const url = require("url");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 8899;
const HOST = "0.0.0.0";
const MAX_PORT_ATTEMPTS = 20;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function parsePort() {
  const argPort = process.argv.find((arg) => arg.startsWith("--port="));
  const raw = argPort ? argPort.slice("--port=".length) : process.env.PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address)
    .filter(Boolean);
}

function safePath(requestUrl) {
  const parsed = url.parse(requestUrl);
  const decoded = decodeURIComponent(parsed.pathname || "/");
  const pathname = decoded === "/" ? "/index.html" : decoded;
  const requested = path.normalize(path.join(ROOT, pathname));
  if (!requested.startsWith(ROOT + path.sep) && requested !== ROOT) return null;
  return requested;
}

function send(res, statusCode, body, headers = {}) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(statusCode, {
    "Content-Length": data.length,
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(data);
}

function handleRequest(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const filePath = safePath(req.url);
  if (!filePath) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      });
      res.end();
      return;
    }

    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        send(res, 500, "Read error", { "Content-Type": "text/plain; charset=utf-8" });
        return;
      }
      send(res, 200, data, { "Content-Type": contentType });
    });
  });
}

function listenOnAvailablePort(startPort, attempts = MAX_PORT_ATTEMPTS) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryPort = () => {
      const server = http.createServer(handleRequest);
      server.on("error", (error) => {
        if (error.code === "EADDRINUSE" && attempts > 0) {
          attempts -= 1;
          port += 1;
          tryPort();
          return;
        }
        reject(error);
      });
      server.listen(port, HOST, () => resolve({ server, port }));
    };
    tryPort();
  });
}

function printUrls(port) {
  const lan = localAddresses();
  console.log("");
  console.log("amy_cin Fishtail local server");
  console.log(`Root:  ${ROOT}`);
  console.log(`Mac:   http://127.0.0.1:${port}/index.html`);
  console.log(`Guide: http://127.0.0.1:${port}/docs/FISHTAIL_USER_GUIDE.html`);
  if (lan.length) {
    console.log("");
    console.log("iPad / local network:");
    lan.forEach((address) => {
      console.log(`  http://${address}:${port}/index.html`);
      console.log(`  http://${address}:${port}/docs/FISHTAIL_USER_GUIDE.html`);
    });
  } else {
    console.log("");
    console.log("No local network IPv4 address found. Connect the Mac to Wi-Fi/Ethernet for iPad access.");
  }
  console.log("");
  console.log("Press Ctrl-C to stop.");
}

listenOnAvailablePort(parsePort())
  .then(({ port }) => printUrls(port))
  .catch((error) => {
    console.error(`Could not start Fishtail server: ${error.message}`);
    process.exit(1);
  });
