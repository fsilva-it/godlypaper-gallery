#!/usr/bin/env node
// Re-hosts submitter-hosted packages into this repo's rolling "wallpapers"
// release, so deleted submitter repos can't break the gallery. Rewrites each
// entry.json's package.url in place (committed by the workflow if changed).
// Requires GITHUB_TOKEN and GITHUB_REPOSITORY.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY; // owner/name
if (!token || !repo) { console.log("no token/repo — skipping re-host (local run)"); process.exit(0); }

const api = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      ...init.headers,
    },
  });

// Ensure the rolling release exists.
let release = await (await api(`/repos/${repo}/releases/tags/wallpapers`)).json();
if (release.message === "Not Found") {
  release = await (await api(`/repos/${repo}/releases`, {
    method: "POST",
    body: JSON.stringify({
      tag_name: "wallpapers",
      name: "Wallpaper packages",
      body: "Rolling storage for gallery packages (managed by CI).",
    }),
  })).json();
}

const hosted = `https://github.com/${repo}/releases/download/wallpapers/`;
const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "wallpapers");

for (const slug of readdirSync(dir)) {
  const entryFile = join(dir, slug, "entry.json");
  if (!statSync(join(dir, slug)).isDirectory() || !existsSync(entryFile)) continue;
  const entry = JSON.parse(readFileSync(entryFile, "utf8"));
  if (!entry.package?.url || entry.package.url.startsWith(hosted)) continue;

  console.log(`re-hosting ${slug} from ${entry.package.url}`);
  const res = await fetch(entry.package.url);
  if (!res.ok) throw new Error(`${slug}: fetch ${res.status}`);
  const blob = Buffer.from(await res.arrayBuffer());
  const digest = createHash("sha256").update(blob).digest("hex");
  if (digest !== entry.package.sha256) throw new Error(`${slug}: sha256 mismatch after review!`);

  const assetName = `${slug}-${entry.version}.godlypaper`;
  // Replace an existing asset of the same name.
  const assets = await (await api(`/repos/${repo}/releases/${release.id}/assets?per_page=100`)).json();
  const existing = assets.find?.((a) => a.name === assetName);
  if (existing) await api(`/repos/${repo}/releases/assets/${existing.id}`, { method: "DELETE" });
  const upload = await fetch(
    `https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/zip",
        "Content-Length": String(blob.length),
      },
      body: blob,
    }
  );
  if (!upload.ok) throw new Error(`${slug}: upload ${upload.status}`);
  entry.package.url = `${hosted}${assetName}`;
  writeFileSync(entryFile, JSON.stringify(entry, null, 2) + "\n");
  console.log(`✓ ${slug} → ${entry.package.url}`);
}
console.log("re-host complete");
