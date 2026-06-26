import { createHash } from "node:crypto";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectDirectory, "dist");

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.name !== "sw.js") {
      const details = await stat(path.join(directory, entry.name));
      files.push({ path: relativePath, size: details.size });
    }
  }

  return files;
}

const files = await listFiles(outputDirectory);
const version = createHash("sha256")
  .update(JSON.stringify(files))
  .digest("hex")
  .slice(0, 12);
const precacheAssets = ["./", ...files.map((file) => `./${file.path}`)];

const source = `const CACHE_NAME = "review-quiz-${version}";
const PRECACHE_ASSETS = ${JSON.stringify(precacheAssets, null, 2)};
const scopeUrl = new URL(self.registration.scope);
const scopeRoot = new URL("./", scopeUrl).toString();
const indexUrl = new URL("./index.html", scopeUrl).toString();
const assetUrls = PRECACHE_ASSETS.map((asset) => new URL(asset, scopeUrl).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(assetUrls)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches
        .match(indexUrl)
        .then((cached) => cached || caches.match(scopeRoot))
        .then((cached) => cached || fetch(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok && (response.type === "basic" || response.type === "cors")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }),
    ),
  );
});
`;

await writeFile(path.join(outputDirectory, "sw.js"), source, "utf8");
console.log(`Generated offline service worker ${version} with ${precacheAssets.length} assets.`);
