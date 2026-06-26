import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "app");
const preferredPort = Number(process.env.REVIEW_QUIZ_PORT || 4173);
const build = "20260626-annotation-pwa";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^([/\\])+/, "");
  const target = path.join(root, normalized || "index.html");
  if (!target.startsWith(root)) return path.join(root, "index.html");
  return target;
}

function openBrowser(url) {
  if (process.env.REVIEW_QUIZ_NO_OPEN === "1") return;
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {});
}

function createAppServer() {
  return createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      let target = safePath(requestUrl.pathname);

      if (!existsSync(target) || path.extname(target) === "") {
        target = path.join(root, "index.html");
      }

      const data = await readFile(target);
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
        "Cache-Control": target.endsWith("index.html") ? "no-store" : "public, max-age=31536000",
      });
      response.end(data);
    } catch (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`文件不存在：${error.message}`);
    }
  });
}

function listen(port, attemptsLeft = 20) {
  const server = createAppServer();
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/?build=${build}`;
    console.log("复习搭子电脑版已启动：");
    console.log(url);
    console.log("关闭这个窗口即可停止本机服务。");
    openBrowser(url);
  });
}

listen(preferredPort);
