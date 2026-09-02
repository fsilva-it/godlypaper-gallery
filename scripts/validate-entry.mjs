#!/usr/bin/env node
// Validates every wallpapers/<slug>/ in the given checkout (PR data):
// checks metadata shape, slug consistency/uniqueness, size limits, downloads
// the referenced package with a cap+timeout, re-verifies sha256, and walks
// the zip central directory rejecting traversal/symlinks/executables.
// Runs with NO secrets.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const checkout = process.argv[2] ?? ".";
const dir = join(checkout, "wallpapers");
const LIMITS = { video: 150 * 1024 * 1024, web: 30 * 1024 * 1024, preview: 512 * 1024 };
let failures = 0;
const fail = (slug, message) => { failures++; console.error(`✘ ${slug}: ${message}`); };
const seen = new Set();

// Walks the zip central directory: EOCD → central file headers.
function scanZip(slug, blob) {
  const eocd = blob.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) { fail(slug, "not a zip (no end-of-central-directory)"); return; }
  let off = blob.readUInt32LE(eocd + 16);
  const count = blob.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    if (off + 46 > blob.length || blob.readUInt32LE(off) !== 0x02014b50) {
      fail(slug, "corrupt central directory"); return;
    }
    const nameLen = blob.readUInt16LE(off + 28);
    const extraLen = blob.readUInt16LE(off + 30);
    const commentLen = blob.readUInt16LE(off + 32);
    const extAttrs = blob.readUInt32LE(off + 38);
    const name = blob.toString("utf8", off + 46, off + 46 + nameLen);
    const unixMode = extAttrs >>> 16;
    const isDirectory = name.endsWith("/");
    if (name.split("/").includes("..") || name.startsWith("/")) fail(slug, `zip path traversal: ${name}`);
    if ((unixMode & 0xf000) === 0xa000) fail(slug, `zip contains symlink: ${name}`);
    if (!isDirectory && unixMode !== 0 && (unixMode & 0o111)) fail(slug, `zip contains executable: ${name}`);
    off += 46 + nameLen + extraLen + commentLen;
  }
}

for (const slug of readdirSync(dir)) {
  const wp = join(dir, slug);
  if (!statSync(wp).isDirectory()) continue;
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(slug)) { fail(slug, "invalid slug"); continue; }

  const manifestPath = ["entry.json", "manifest.json"].map((f) => join(wp, f)).find(existsSync);
  if (!manifestPath) { fail(slug, "no entry.json/manifest.json"); continue; }
  let meta;
  try { meta = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch (e) { fail(slug, `bad JSON: ${e}`); continue; }

  // Impersonation guard: a folder may not list under someone else's slug.
  if (meta.slug !== undefined && meta.slug !== slug) fail(slug, `entry slug "${meta.slug}" does not match folder name`);
  const declared = meta.slug ?? meta.id ?? slug;
  if (declared !== slug) fail(slug, `declared id/slug "${declared}" does not match folder name`);
  if (seen.has(declared)) fail(slug, `duplicate slug "${declared}"`);
  seen.add(declared);

  if (!["video", "web"].includes(meta.type)) fail(slug, `type ${meta.type} not allowed`);
  if ((meta.contentRating ?? "everyone") !== "everyone") fail(slug, "gallery v1 accepts contentRating=everyone only");
  if (!meta.license || meta.license === "UNLICENSED") fail(slug, "SPDX license required");

  const preview = join(wp, "preview.jpg");
  if (existsSync(preview) && statSync(preview).size > LIMITS.preview) fail(slug, "preview > 512KB");

  if (meta.package?.url) {
    if (!/^[a-f0-9]{64}$/.test(meta.package.sha256 ?? "")) { fail(slug, "bad sha256"); continue; }
    const limit = LIMITS[meta.type] ?? LIMITS.web;
    console.log(`… downloading ${meta.package.url}`);
    let blob;
    try {
      const res = await fetch(meta.package.url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) { fail(slug, `package fetch ${res.status}`); continue; }
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > limit) break; // breaking cancels the stream
        chunks.push(chunk);
      }
      if (size > limit) { fail(slug, `package exceeds ${meta.type} size limit`); continue; }
      blob = Buffer.concat(chunks);
    } catch (e) {
      fail(slug, `package fetch failed: ${e}`); continue;
    }
    if (meta.package.size !== blob.length) fail(slug, `package.size ${meta.package.size} != actual ${blob.length}`);
    const digest = createHash("sha256").update(blob).digest("hex");
    if (digest !== meta.package.sha256) fail(slug, `sha256 mismatch (${digest})`);
    scanZip(slug, blob);
  }
  if (meta.web?.allowNetwork === true) console.warn(`⚠ ${slug}: allowNetwork=true — needs manual review`);
}

if (failures > 0) { console.error(`${failures} problem(s)`); process.exit(1); }
console.log("all submissions valid");
