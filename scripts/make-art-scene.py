#!/usr/bin/env python3
"""Build an "art scene" web wallpaper from a still illustration.

The image is fill-cropped ONCE (lanczos, 4:4:4 JPEG so line art keeps its
color edges) to the target screen's exact backing resolution, so the page
can show it 1:1 in device pixels with zero runtime resampling — that's what
keeps it as sharp as the source. Animated overlays come from
templates/art-scene/index.html.

Usage:
  make-art-scene.py IMAGE --title "Rainy Street" [--effect rain|petals|fireflies|snow|dust|none]
                    [--color "r g b"] [--fog 0..1] [--glow 0..1] [--glowcolor "r g b"]
                    [--size 3360x2100] [--out DIR] [--install] [--author NAME] [--license SPDX]

--size defaults to the main display's backing resolution (screencapture).
--install copies the package straight into the GodlyPaper library (quit the app first).
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys, tempfile, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "..", "templates", "art-scene", "index.html")
LIB = os.path.expanduser("~/Library/Application Support/GodlyPaper/Wallpapers")

EFFECT_COLORS = {
    "rain": "0.78 0.86 1", "petals": "1 0.8 0.86", "fireflies": "1 0.88 0.45",
    "snow": "1 1 1", "dust": "1 0.93 0.8", "none": "1 1 1",
}


def backing_size():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "s.png")
        subprocess.run(["screencapture", "-x", "-m", p], check=True)
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p],
                             capture_output=True, text=True, check=True).stdout
    w = int(re.search(r"pixelWidth: (\d+)", out).group(1))
    h = int(re.search(r"pixelHeight: (\d+)", out).group(1))
    return w, h


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "art-scene"


def properties(a):
    effects = ["none", "rain", "petals", "fireflies", "snow", "dust"]
    return {
        "effect": {"type": "choice", "label": "Effect", "order": 0, "default": a.effect,
                   "options": [{"label": e.capitalize(), "value": e} for e in effects]},
        "density": {"type": "slider", "label": "Density", "order": 1, "default": 1, "min": 0.2, "max": 2, "step": 0.05},
        "speed": {"type": "slider", "label": "Speed", "order": 2, "default": 1, "min": 0.2, "max": 2.5, "step": 0.05},
        "particlecolor": {"type": "color", "label": "Particle color", "order": 3, "default": a.color},
        "fog": {"type": "slider", "label": "Mist", "order": 4, "default": a.fog, "min": 0, "max": 1, "step": 0.05},
        "glow": {"type": "slider", "label": "Light pulse", "order": 5, "default": a.glow, "min": 0, "max": 1, "step": 0.05},
        "glowcolor": {"type": "color", "label": "Light color", "order": 6, "default": a.glowcolor},
        "vignette": {"type": "slider", "label": "Vignette", "order": 7, "default": a.vignette, "min": 0, "max": 1, "step": 0.05},
        "drift": {"type": "bool", "label": "Camera drift (slightly softer)", "order": 8, "default": False},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--title", required=True)
    ap.add_argument("--id")
    ap.add_argument("--effect", default="rain", choices=list(EFFECT_COLORS))
    ap.add_argument("--color")
    ap.add_argument("--fog", type=float, default=0.0)
    ap.add_argument("--glow", type=float, default=0.0)
    ap.add_argument("--glowcolor", default="1 0.67 0.43")
    ap.add_argument("--vignette", type=float, default=0.35)
    ap.add_argument("--size")
    ap.add_argument("--author", default="Unknown")
    ap.add_argument("--author-url")
    ap.add_argument("--license", default="LicenseRef-Personal-Use")
    ap.add_argument("--tags", default="anime,illustration")
    ap.add_argument("--out")
    ap.add_argument("--install", action="store_true")
    a = ap.parse_args()
    a.color = a.color or EFFECT_COLORS[a.effect]
    sid = a.id or slugify(a.title)
    w, h = map(int, a.size.lower().split("x")) if a.size else backing_size()

    out = a.out or os.path.join(tempfile.mkdtemp(prefix="art-scene-"), sid)
    os.makedirs(out, exist_ok=True)

    # 1. Art: exact backing size, lanczos, full-chroma JPEG.
    vf = (f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int,"
          f"crop={w}:{h}")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.image, "-vf", vf,
                    "-pix_fmt", "yuvj444p", "-q:v", "1", os.path.join(out, "art.jpg")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(out, "art.jpg"),
                    "-vf", "scale=800:-2:flags=lanczos", "-q:v", "3", os.path.join(out, "preview.jpg")], check=True)

    # 2. Page with this scene's defaults baked in.
    props = properties(a)
    defaults = {k: {"value": v["default"]} for k, v in props.items()}
    html = open(TEMPLATE).read().replace(
        "<!--ART_DEFAULTS-->", "<script>window.ART_DEFAULTS = " + json.dumps(defaults) + ";</script>")
    open(os.path.join(out, "index.html"), "w").write(html)

    # 3. Manifest.
    author = {"name": a.author}
    if a.author_url:
        author["url"] = a.author_url
    manifest = {
        "schema": 1, "id": sid, "version": "1.0.0", "type": "web", "title": a.title,
        "author": author, "license": a.license, "entry": "index.html", "preview": "preview.jpg",
        "tags": [t.strip() for t in a.tags.split(",") if t.strip()] + ["art-scene"],
        "contentRating": "everyone", "web": {"allowNetwork": False}, "properties": props,
    }
    json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=2)
    print(f"built {sid} ({w}x{h}) -> {out}")

    # 4. Optional install (same layout ImportPipeline produces).
    if a.install:
        for d in os.listdir(LIB):
            try:
                if json.load(open(os.path.join(LIB, d, "item.json")))["manifest"]["id"] == sid:
                    shutil.rmtree(os.path.join(LIB, d))       # replace older build of same scene
            except Exception:
                pass
        iid = str(uuid.uuid4()).upper()
        stage = os.path.join(LIB, ".staging-" + iid)
        shutil.copytree(out, stage)
        size = sum(os.path.getsize(os.path.join(stage, f)) for f in os.listdir(stage))
        item = {"id": iid, "manifest": manifest, "thumbnail": "preview.jpg", "contentSizeBytes": size,
                "addedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
        json.dump(item, open(os.path.join(stage, "item.json"), "w"), indent=2)
        os.rename(stage, os.path.join(LIB, iid))
        print(f"installed {sid} -> {iid}")


if __name__ == "__main__":
    sys.exit(main())
