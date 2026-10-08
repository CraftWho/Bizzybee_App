# WIP M02 scripts (paused 2026-10-05)

These scripts build `output/milestones/BB_M02_Silhouette.blend`. M02 is **not finished**: the head is still being refined with the user, one piece at a time.

They are kept in a separate folder on purpose. The scripts one level up (`../build.py`, `../config.py`, `../core/`, `../parts/`) are still the **M01** versions, and M01 must stay rebuildable.

## Run (from the `bizzy_bee` folder)

```
blender --background --python wip_M02_scripts/build.py -- --render     # full renders
blender --background --python wip_M02_scripts/build.py -- --preview    # fast check
blender --background --python wip_M02_scripts/render_head_closeups.py  # head front/side/3-4 close-ups
blender --background --python wip_M02_scripts/render_side_overlay.py   # flat side view at the reference's scale
```

Without a desktop Blender, `pip install bpy` (Python 3.11) and run the same files with `python`.

## What's in here

- `config.py` - all M02 proportions. Head shape is controlled by `HEAD_SCALE`, `FACE_DIR`, `FACE_STRETCH`, `FACE_FALLOFF`, `FACE_NARROW`, `EYE_SIZE`, `EYE_TURN`, `EYE_OFFSET`.
- `parts/body.py` - `head_deform()` turns the round head into a teardrop by pulling the mouth area forward and down. It also builds the gold head plates (crown, two face panels, cheeks, back-skull), the eyes and the mandibles.
- `core/scene.py` - `shell_patch()` makes curved armour plates that sit on the head and follow the same deform.
- `parts/appendages.py` - legs, antennae and wings, all read from `config.py`.

When M02 is approved, these files replace the ones one level up (keep the M01 .blend), and this folder can go.
