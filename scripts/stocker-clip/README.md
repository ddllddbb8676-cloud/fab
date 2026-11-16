# Stocker OUT video — 2026-11-16

User request: a standalone shot of withdrawing a FOUP from the stocker, with
the existing The Entertainer cue louder. No narration or game deployment.

The fixture copies the current `src/main.js` into the ignored output directory.
It disables the multiplayer connection, uses a fixed camera and the original
game renderer, stocker, store, `playActions` and avatar. The foreground carts are
hidden only in this local camera shot. Live accounts and game state are untouched.
The browser captures 450 deterministic simulation frames at 30 fps using
WebCodecs. This is a local game demonstration, not a live multiplayer recording.

1. `node scripts/stocker-clip/prepare.mjs`
2. `node scripts/stocker-clip/serve.mjs` (loopback-only port 4176).
3. Open the printed localhost page with the supported Browser plugin. Wait for
   `촬영 준비`, then use the `15초 촬영` button. Wait for the completion state.
4. `python -X utf8 scripts/stocker-clip/finish.py`
5. Review `outputs/stocker-clip-20261116/qa/` and the complete clip. Mark
   `verification.json.visualReviewComplete` true only after that review.
6. To deliver on the existing owner-private video Site, use its normal Sites
   workflow and `python scripts/stocker-clip/package.py <verified checkout>`.
   The four previous videos are checked and preserved byte-for-byte.

Output: `outputs/stocker-clip-20261116/FAB-stocker-OUT-music.mp4`, 15 seconds,
1080×1920, H.264/AAC. The original 10.2-second stocker music is synchronized to
the original `stocker-out` callback and normalized toward -14 LUFS; no narration
or extra background track. The script decodes all frames and checks audio clipping.
Browser screen recording, actual iPhone playback and a production deploy are
not claimed. The local-only fixture must never be shipped to the game site.

Completed 2026-11-16: 450 decoded frames, 15.00 seconds, 5,365,267 bytes.
Final audio -14.43 LUFS / -2.80 dBTP, zero clipped samples, about 8 LU louder
than the source file. Seven extracted frames reviewed; original-game stocker
retrieval, the OUT hold and the character carrying the FOUP remain visible.
Local browser playback reached 15 seconds without a media error.

Owner-private viewing/download: https://fab-promo-film.ddllddbb8676.chatgpt.site/stocker.html
Deployment `appgdep_6afac0577d848191bc797507ff61258e` succeeded.
Site source `de09541f56a7f9caf83d8a1314741cf0a0aa3c61`.
MP4 SHA-256 `d3eceeb935e44c500106c518088345293cb64a52830366d3e398bfb607d48221`.
The four existing tutorial/promo movies are preserved unchanged.
