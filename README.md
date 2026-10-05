# GodlyPaper Gallery

Community wallpaper registry for [GodlyPaper](https://github.com/fsilva-it/godlypaper) —
zero-infra: the index and previews are served by GitHub Pages, packages by
GitHub Releases, and submissions are moderated pull requests.

## Submitting a wallpaper

1. Package your wallpaper per the
   [package format spec](https://github.com/fsilva-it/godlypaper/blob/main/docs/spec/package-format-v1.md)
   and zip it as `<slug>.godlypaper`.
2. Upload the zip to a release **on your own repo** (temporary hosting).
3. Open a PR adding `wallpapers/<slug>/entry.json` (see `schemas/entry.schema.json`)
   with your asset URL + its sha256, plus `preview.jpg` (≤ 512 KB).
4. CI validates (schema, checksum, size, archive safety); a maintainer
   reviews; on merge the package is **re-hosted** into this repo's releases
   and appears in the app within minutes.

Rules: `contentRating: everyone`, real SPDX license, no ripped content — see
[MODERATION.md](MODERATION.md).

## Seed wallpapers

`wallpapers/*/` folders carrying content directly (instead of `entry.json`)
are first-party seeds, packaged by CI at publish time. Most are CC0; the
"art scene" seeds use CC BY 4.0 paintings by David Revoy — see each folder's
`CREDITS.txt`.

## Art scenes (still illustration + animated overlays)

`templates/art-scene/` shows a high-res still 1:1 in device pixels (no runtime
resampling, so it stays as sharp as the source) with cheap overlays: rain,
petals, fireflies, snow, light dust, mist, light pulse, vignette — all
adjustable in the app. Build one from any image:

    python3 scripts/make-art-scene.py art.png --title "Rain City" --effect rain --install

`--size` defaults to the main display's backing resolution; `--install` drops
it straight into the local library (quit GodlyPaper first).
