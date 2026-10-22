# ARC promotional video maintenance

The finished video is `docs/media/arc-promo.mp4` (30 seconds, 1080p, with audio). The English and Chinese READMEs use a GitHub video attachment at the top for inline playback. `docs/media/arc-loop.gif` is a separate silent preview.

## Files

| File | Purpose |
| --- | --- |
| `promo.html` | All visuals. `render(t)` deterministically draws each frame by time. Copy lives in `CAPS` and `BL`/`BR`. `buildLoop(...)` parameters set the loop count and duration. |
| `synth.py` | Synthesizes music and effects from the page's exported event timeline (`SFX`, `MARKS`), synchronized with visuals. |
| `render.py` | Captures frames, encodes with ffmpeg, mixes audio, normalizes to -14 LUFS, and exports a silent preview GIF. |

## Preview

Open `promo.html#play` in a browser for continuous playback. `promo.html#19.4` freezes at 19.4 seconds.

## Re-render

Dependencies: python3, playwright (chromium), numpy, scipy, and ffmpeg. Geist fonts are not committed:

```sh
cd assets/promo
npm pack geist && tar xzf geist-*.tgz && mkdir -p fonts
cp package/dist/fonts/geist-sans/Geist-{Regular,Medium,SemiBold,Bold}.woff2 package/dist/fonts/geist-mono/GeistMono-{Regular,Medium}.woff2 fonts/
rm -rf package geist-*.tgz && cd ../..
python3 assets/promo/render.py              # Replace the video and GIF under docs/media.
python3 assets/promo/render.py --still 19.4  # Export one frame to assets/promo/out/.
```

The full video takes about 3 minutes to render. Sound effects follow loop timing changes automatically without manual synchronization.

To update the README video, upload `docs/media/arc-promo.mp4` using the attachment button in GitHub's Markdown editor. Put the resulting `https://github.com/user-attachments/assets/...` URL on its own line. Update both READMEs. A repository-relative MP4 path is only a link and cannot replace the attachment player.

## Conventions

- Represent third-party products with letter circles rather than official logos.
- Demo tasks, test counts, and turns are illustrative data.
- Follow `assets/brand/README.md` for marks and colors. Use the primary set.
