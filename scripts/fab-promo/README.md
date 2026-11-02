# FAB 58-second film

This is an isolated, scripted promo scene using the shipped game's Three.js model
builders, avatar poses, cosmetics, destruction, FOUP debris, emote textures and
sound synthesizers. It does not contact the game Worker, write player records,
or change the production game. These are staged NPC shots, not recordings of
live multiplayer participants.

The film starts with an EMO press and includes a top-view coordinated destruction
of one bay. Every delivered video frame includes `< fab.semitoon.com >`.

## Local workflow

The Windows output root is `outputs/fab-promo-2026-11-02/` (Git-ignored).
Requirements: the repository's installed Three.js, `@napi-rs/canvas` in the
output's `tools/` directory, Blender 5.2, Python with Pillow/NumPy/imageio-ffmpeg,
and Windows Malgun Gothic / Segoe UI Emoji fonts. No browser automation is used.

1. `node scripts/fab-promo/make-film.mjs` exports all ten scenes in one pass.
2. Run Blender in a separate background process:
   `blender --background --factory-startup --python scripts/fab-promo/render-film.py -- "01-emo,02-bay"`.
   Supply the other clip IDs in the same way. Disjoint clip lists may render
   concurrently. `--preview` makes 540x960 sample frames; full frames are
   1080x1920 at 30 fps. `--frames=0,60` selects frames for checks.
3. `python scripts/fab-promo/edit-film.py` checks the frame counts, encodes the
   shots, mixes original game effects and newly synthesized music, and adds
   the persistent URL and short Korean captions. `--assets-only` prepares
   captions and audio before rendering finishes.

Re-export **all clips together** after model changes, because `assets.json` has
one shared index space. Do not mix clip JSON from different export runs. Move
prior final frames/encoded shots into a versioned output directory before
rerendering changed scenes; the renderer and editor resume existing files.

The cinematic camera can remove the foreground equipment row for close shots,
like a removable set wall. The source game remains unchanged. Review the rendered
frames for obstructions, faces, color, timing, and title placement before delivery.

## Timeline

| Seconds | Scene |
| --- | --- |
| 0–4 | EMO press and original equipment collapse |
| 4–12 | Twenty NPCs, one bay, top-view destruction wave |
| 12–18 | Safety team chase |
| 18–22 | Repair |
| 22–28 | FOUP throw and wafer spill |
| 28–34 | Broom cleanup and dust |
| 34–40 | OHT hanging ride |
| 40–48 | Cosmetic changes |
| 48–54 | Sitting, lying down and emotes |
| 54–58 | Group ending and invitation |

The mobile review page is a separate owner-private Sites project. Its manifest
and video are stored only in the ignored output directory. No social media
publication is part of this workflow.

## Delivered first cut — 2026-11-02

- File: `outputs/fab-promo-2026-11-02/FAB-promo-58s-v1.mp4`
- 58.00 seconds, 1080x1920, 30 fps, H.264/AAC, 12,040,363 bytes.
- All 1,740 decoded frames passed the persistent URL visibility check.
- Fifteen extracted final-video frames were visually reviewed across every scene.
- Stereo 48 kHz audio decoded successfully without clipping (peak -4.21 dBFS).
- SHA-256: `17380734c1527dd93ece13b592506e12b70fcabbc7962cedcc600155eadd063e`
- Private review and download: https://fab-promo-film.ddllddbb8676.chatgpt.site
- Sites deployment: `appgdep_6ae87eca299c8191bbb4554e5542de71` (succeeded).
- Browser/physical-phone playback QA was unavailable because local browser use
  was disabled in Work settings; media decoding and page structure were checked.

The rendered film uses game source revision `58810de`; production gameplay and
player data were not changed by this filming task. Verification details and
the contact sheet are saved under the output's `qa/` directory.
