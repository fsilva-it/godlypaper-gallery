# Gallery Moderation Policy

- **What's accepted (v1):** video (`.mp4/.mov/.m4v`) and web wallpapers with
  `contentRating: everyone`, an SPDX license, and a working preview. Size
  limits: video ≤ 150 MB, web ≤ 30 MB, preview ≤ 512 KB.
- **What's rejected:** content ripped from Steam Workshop or other stores
  without a license permitting redistribution; NSFW/violent content;
  wallpapers whose JS exfiltrates data or mines (web packages default to
  `allowNetwork: false`; opting in flags the PR for extra scrutiny);
  archives with executables, symlinks, or path traversal (CI hard-rejects).
- **Review:** every submission is a PR validated by CI and reviewed by a
  maintainer before merge. On merge, CI re-hosts the package into this repo's
  releases so submissions cannot be swapped after review.
- **Takedowns:** open an issue titled `takedown: <slug>` with the legal basis
  (e.g. DMCA). Removal deletes the entry + release asset and appends the slug to
  `removed.json` (the index tombstone list) so clients purge cached listings.
