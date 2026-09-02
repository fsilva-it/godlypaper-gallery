#!/usr/bin/env node
// Builds index.json from wallpapers/*/entry.json (+ seed folders that carry
// manifest.json directly, used before first publish). Run by publish.yml;
// locally: node scripts/build-index.mjs <base-url-for-assets> [out-file]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseURL = process.argv[2] ?? "https://fsilva-it.github.io/godlypaper-gallery";
const outFile = process.argv[3] ?? "index.json";
const root = new URL("..", import.meta.url).pathname;
const wallpapersDir = join(root, "wallpapers");

const entries = [];
for (const slug of readdirSync(wallpapersDir).sort()) {
  const dir = join(wallpapersDir, slug);
  if (!statSync(dir).isDirectory()) continue;

  const entryFile = join(dir, "entry.json");
  if (existsSync(entryFile)) {
    // Published shape: metadata + package {url, sha256, size} already final.
    entries.push(JSON.parse(readFileSync(entryFile, "utf8")));
    continue;
  }

  // Seed shape: manifest.json + content in-repo; package zip built by CI
  // (dist/<slug>.godlypaper) and addressed relative to baseURL.
  const manifestFile = join(dir, "manifest.json");
  if (!existsSync(manifestFile)) continue;
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  const zipPath = join(root, "dist", `${slug}.godlypaper`);
  if (!existsSync(zipPath)) {
    console.error(`skip ${slug}: dist zip missing (run scripts/build-dist.sh first)`);
    continue;
  }
  const zip = readFileSync(zipPath);
  entries.push({
    slug,
    version: manifest.version ?? "1.0.0",
    type: manifest.type,
    title: manifest.title,
    author: manifest.author?.name,
    license: manifest.license ?? "UNLICENSED",
    preview: `${baseURL}/previews/${slug}.jpg`,
    package: {
      url: `${baseURL}/packages/${slug}.godlypaper`,
      sha256: createHash("sha256").update(zip).digest("hex"),
      size: zip.length,
    },
    tags: manifest.tags,
    contentRating: manifest.contentRating,
    minAppVersion: manifest.minAppVersion,
  });
}

const removedFile = join(root, "removed.json");
const removed = existsSync(removedFile) ? JSON.parse(readFileSync(removedFile, "utf8")) : [];
const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  removed,
  entries: entries.filter((e) => !removed.includes(e.slug)),
};
writeFileSync(join(root, outFile), JSON.stringify(index, null, 2));
console.log(`wrote ${outFile} with ${entries.length} entries`);
