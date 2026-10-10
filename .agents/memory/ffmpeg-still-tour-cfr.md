---
name: FFmpeg still-tour frame rate
description: A reliable way to encode floor-by-floor still-image tours when chained xfade filters fail.
---

For a still-image tour, chained `xfade` transitions can fail after several clips with an invalid `1/0` frame-rate error. A concat-demuxer manifest followed by a constant-frame-rate filter encoded reliably here; use hard cuts if crossfades are not essential.

**Why:** Repeated `xfade` chains failed multiple times while stitching the Tower preview, while the concat-manifest path produced a valid H.264 MP4.

**How to apply:** Keep each still's duration explicit in the concat manifest, add the last image once more to define its end time, then set the output frame rate and verify duration with `ffprobe`.
