#!/usr/bin/env python3
"""Fallback index builder (same output as build-index.mjs) for machines
without node."""
import hashlib, json, os, sys, datetime

base_url = sys.argv[1] if len(sys.argv) > 1 else "https://fsilva-it.github.io/godlypaper-gallery"
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
entries = []
wallpapers = os.path.join(root, "wallpapers")
for slug in sorted(os.listdir(wallpapers)):
    d = os.path.join(wallpapers, slug)
    if not os.path.isdir(d):
        continue
    entry_file = os.path.join(d, "entry.json")
    if os.path.exists(entry_file):
        entries.append(json.load(open(entry_file)))
        continue
    manifest_file = os.path.join(d, "manifest.json")
    if not os.path.exists(manifest_file):
        continue
    manifest = json.load(open(manifest_file))
    zip_path = os.path.join(root, "dist", slug + ".godlypaper")
    if not os.path.exists(zip_path):
        print(f"skip {slug}: dist zip missing", file=sys.stderr)
        continue
    blob = open(zip_path, "rb").read()
    entries.append({
        "slug": slug,
        "version": manifest.get("version", "1.0.0"),
        "type": manifest["type"],
        "title": manifest["title"],
        "author": (manifest.get("author") or {}).get("name"),
        "license": manifest.get("license", "UNLICENSED"),
        "preview": f"{base_url}/previews/{slug}.jpg",
        "package": {
            "url": f"{base_url}/packages/{slug}.godlypaper",
            "sha256": hashlib.sha256(blob).hexdigest(),
            "size": len(blob),
        },
        "tags": manifest.get("tags"),
        "contentRating": manifest.get("contentRating"),
        "minAppVersion": manifest.get("minAppVersion"),
    })

removed_file = os.path.join(root, "removed.json")
removed = json.load(open(removed_file)) if os.path.exists(removed_file) else []
index = {
    "schemaVersion": 1,
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "removed": removed,
    "entries": [e for e in entries if e["slug"] not in removed],
}
out = os.path.join(root, "index.json")
json.dump(index, open(out, "w"), indent=2)
print(f"wrote index.json with {len(entries)} entries")
