# FAB cosmetics review: 30 numbered candidates

This folder preserves the original separate review collection. On 2026-11-09,
the owner approved numbers 1, 2, 4, 6, 7, 8, 10, 11, 13, 15, 17, 20, 21, 22, 24, 25, 26, 29, 30; those 19 designs shipped
at their reviewed prices. The other 11 remain proposals. See
../../docs/cosmetics-collection-2026-11-09.md for the production release.
The original review creation did not change production. Candidate numbers are
stable; a number selected by the owner refers to the same ID in catalog.js.

The existing src/avatar.js is used directly. Accessories are real Three.js
geometry attached to the same upper-body parent as current cosmetics. Suits
clone the live avatar's clothing geometry and bake UVs for procedural color
patterns; the face, gloves, boots and other avatars' shared resources remain
intact. equipCandidate(THREE, avatar, item) returns update(time) and dispose().
Dispose the candidate before the avatar or before changing suits.

Eight patterned suits, eight head items, six eyewear items and eight bags are
included. catalog.js holds Korean names, chip proposals, IDs, numbered review
order and descriptions. All have status: proposal.

## Review and reproducibility

- node --test prototypes/cosmetics-20261109/models.test.mjs
  checks all 30 candidates on the actual avatar, finite motion transforms,
  size and geometry budgets, cleanup, and shared-resource isolation.
- node prototypes/cosmetics-20261109/export.mjs
  serializes the same geometry/materials used by the WebGL preview.
- blender --background --factory-startup --python prototypes/cosmetics-20261109/render-catalog.py
  renders two angles per item, using the existing film export converter.
- python prototypes/cosmetics-20261109/contact-sheet.py
  creates 60 thumbnails and a numbered, priced overview.
- node prototypes/cosmetics-20261109/build.mjs
  bundles the review-only viewer into the ignored output's site/dist/.

Outputs: outputs/cosmetics-20261109/. Blender and Pillow are only build tools;
the review site has static images and one lazily created WebGL canvas. It
renders only while its dialog is visible, caps rendering at 30 fps and pixel
ratio at 1.8, and disposes prior candidates when switching. No third-party
fonts, game connections or analytics. On WebGL failure it shows the rendered
images and disables unavailable motion controls. Review selections stay in
this browser's localStorage and are only copied out by the owner.

## Integration after item approval

1. Copy only approved catalog entries and their agreed prices into the existing
   catalog/server validation. Do not treat proposal selection as a purchase.
2. Register approved accessory templates with the current appearance pool.
   Share geometry/materials across players and batch compatible static parts.
   The miniature OHT, propeller, ghost, UFO and black-hole orbit have bounded
   decorative updates; these never change player movement or gameplay.
3. Suits need a pattern-aware appearance path and compatible remote-player
   batching, instead of the current solid-color-only suitColor() lookup.
   Pool pattern textures (256x512 RGBA per pattern) and cloned clothing shapes.
4. Keep safety-team/event uniform overrides, other equipped items, face style
   and persisted identity/ownership behavior. Test equip/unequip, reconnect,
   event transitions and mobile multiplayer performance before game release.

The largest accessory has 4,032 triangles and at most 12 draw calls before the
future game-wide batching step. These counts are scene checks, not a measured
multiplayer/mobile frame-rate claim. Production integration and its performance
acceptance remain intentionally pending the owner's item approval.

## Delivered review

- Owner-private review: https://fab-item-lab-30.ddllddbb8676.chatgpt.site
- All-item contact sheet: /FAB-items-30.jpg on the same Site.
- Deployment appgdep_6af0aac849688191a656330912eaf480 succeeded.
- Review Site source SHA: eb4821950bef11663330ca3b0c573eaf86a6fde3.
- 31 model tests passed. All 30 primary and 30 alternate renders were inspected.
  Page, bundle and thumbnail HTTP responses were 200; all asset references and
  static control IDs were checked. Final bundle size is 807,288 bytes.
- Browser UI automation was unavailable because Work settings disable local
  browser use. Physical-phone touch/GPU performance was not tested.
- The game build copies explicit production paths and excludes this prototype
  directory. Game source, account data and the production deployment are unchanged.
