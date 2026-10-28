import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.YAREN_SCANNER_PORT || 4738);
const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, "scan.m");
const binary = path.join(os.tmpdir(), "yaren-scanner");

const server = http.createServer((request, response) => {
  const origin = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") {
    response.writeHead(204, origin);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/scanners") {
    listScanners()
      .then((devices) => json(response, 200, { devices }, origin))
      .catch((error) => json(response, 500, { error: messageOf(error) }, origin));
    return;
  }
  if (request.method === "POST" && request.url === "/scan") {
    readBody(request)
      .then((body) => scan(body.deviceId ?? ""))
      .then((file) => {
        response.writeHead(200, { ...origin, "Content-Type": "image/jpeg", "Content-Length": file.length });
        response.end(file);
      })
      .catch((error) => json(response, 500, { error: messageOf(error) }, origin));
    return;
  }
  json(response, 404, { error: "Not found." }, origin);
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") process.exit(0);
  console.error(error);
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Scanner bridge listening on 127.0.0.1:${port}`);
});

function json(response, status, body, headers) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { ...headers, "Content-Type": "application/json" });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve({ deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : "" });
      } catch {
        reject(new Error("The scan request could not be read."));
      }
    });
    request.on("error", reject);
  });
}

async function listScanners() {
  const output = await runScanner(["list"]);
  const parsed = JSON.parse(output.trim() || "[]");
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return items.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && !/camera|facetime|isight|continuity|iphone|ipad|webcam/i.test(item.name));
}

async function scan(deviceId) {
  const folder = path.join(os.tmpdir(), "yaren-scans");
  await mkdir(folder, { recursive: true });
  const destination = path.join(folder, `scan-${Date.now()}.jpg`);
  try {
    await runScanner(["scan", deviceId, destination]);
    const info = await stat(destination);
    if (!info.size) throw new Error("The scanner returned an empty page.");
    if (info.size > 10 * 1024 * 1024) throw new Error("The scan is larger than 10 MB. Scan again at a lower resolution.");
    return await readFile(destination);
  } finally {
    await rm(destination, { force: true });
  }
}

async function runScanner(args) {
  if (process.platform === "darwin") return runMac(args);
  if (process.platform === "win32") return runWindows(args);
  return runSane(args);
}

async function runMac(args) {
  await ensureMacBinary();
  return exec(binary, args);
}

async function ensureMacBinary() {
  const sourceInfo = await stat(source);
  const binaryInfo = await stat(binary).catch(() => null);
  if (binaryInfo && binaryInfo.mtimeMs >= sourceInfo.mtimeMs) return;
  await exec("clang", ["-fobjc-arc", "-framework", "Foundation", "-framework", "ImageCaptureCore", "-o", binary, source]);
}

function runWindows(args) {
  const script = path.join(here, "scan.ps1");
  return exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", script, ...args]);
}

function runSane(args) {
  if (args[0] === "list") {
    return exec("scanimage", ["-L"]).then((output) => {
      const devices = output.split("\n").flatMap((line) => {
        const match = line.match(/device `([^']+)' is a (.+)/);
        return match ? [{ id: match[1], name: match[2].trim() }] : [];
      });
      return JSON.stringify(devices);
    });
  }
  return exec("scanimage", ["--device-name", args[1], "--format=jpeg", "--resolution", "200", "--output-file", args[2]]).then(() => "");
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (error.code === "ENOENT") reject(new Error("Scanner support is not available on this computer."));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || stdout.trim() || "The scanner could not complete the scan."));
    });
  });
}

function messageOf(error) {
  return error instanceof Error && error.message ? error.message : "The scanner could not complete the scan.";
}
