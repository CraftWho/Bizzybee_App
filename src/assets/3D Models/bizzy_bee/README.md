# Bizzy Bee — modular Blender asset

## Milestone 1

Proportion blockout based on picture 4, with picture 3 as side-profile support.
Existing Blender files are preserved. The build creates a new scene and writes
only output/milestones/BB_M01_Blockout.blend and its review renders.

Run Blender in background with `--python` pointing to build.py, followed by
`-- --render` to generate three review images. Use a fresh Blender process for
each build; interactive reruns retain older scenes and may cause name suffixes.

Coordinates: front -Y, left +X, up +Z. Proportions live in config.py.
core/scene.py owns materials and geometry helpers; parts/body.py owns chassis
and mandibles; parts/appendages.py owns articulated legs, antennae and wings.
core/studio.py owns review lighting and cameras. build.py assembles and validates.

## Controls and attachment contract

CTRL_Master > CTRL_Body > head / abdomen / legs / wing sockets.
CTRL_Stinger follows abdomen. Each wing has its own socket-positioned pivot.
Each leg has upper and lower controls, and an ATT_Foot mount for removable tools.
Rigid pieces are parented, with no soft deformation. This is a posing hierarchy;
the production armature and animation are later milestones.

Select CTRL_Head and adjust custom property mandible_open from 0 to 1 for shared
opening. CTRL_Mandible_L/R ordinary local Z rotations add independent movement.
The shared opening uses delta rotation drivers so both methods can coexist.

ATT_Leg_* accepts BB_LEG_V1 modules; ATT_Foot_* accepts BB_TOOL_V1 modules.
ATT_Wing_* accepts BB_WING_V1; head, thorax, abdomen and rear mounts accept
BB_EQUIPMENT_V1. Mount origins are mating points; their local axes match world
axes at rest, +Z up. Left is +X, right -X. Replacement modules must use the same
rest origin/orientation and parent to the mount. These interfaces are provisional
until proportions are reviewed. Full drill swap validation is milestone 7.

## Scope still pending

Eye shapes are glossy blue placeholders, not the finished hex-cell lens system.
Wings have membrane, border and central spar; detailed veins and transmission
are pending. Body banding indicates panel placement; grille, armor refinement,
fasteners, claw refinement, production rig and hover animation are pending.
The abdomen is a continuous shell with no longitudinal terminal seam.

Next review: head/body size, abdomen tilt and length, wing span, leg stance,
and mandible proportions in side/front/three-quarter views.

## Reference images (`reference/`)

Recovered 2026-09-30. The original build chat was lost; the user re-supplied these.
The M01 build notes referred to them by upload names (primary, profile, mechanical details).

- `BB_Ref_01_Badge.png` - app badge art (same image as `src/assets/icons/bizzy-bee-badge-source.png`).
- `BB_Ref_02_Render_Side.png` - 3D-style side render. Best guide for proportions and materials.
- `BB_Ref_03_Illustration_ThreeQuarter.png` - three-quarter illustration. Best guide for head, mandibles, rivets.
- `BB_Ref_04_Illustration_Side.png` - flat side illustration. Best guide for silhouette and leg stance.
- `BB_Ref_05_Head_Front.png` - head from the front (added 2026-10-01). **The target for the head**: wide shield shape, big side eyes with thick gold rims, gold crown, two-panel face shield with centre seam, cheek plates under the eyes, four dark mandible blades. No beak.

### Inspiration (`reference/inspiration/`)

The two images that first inspired the bee: `BB_Inspiration_01_Blossom_Branch.png`
(bee on a blossom branch) and `BB_Inspiration_02_Flying_Sprite_Sheet.png` (4-frame
flying sprite sheet). Kept for history and mood only. The user confirmed the current
design (the four references above) stands - this is not a rebrand. The sprite sheet may
still help later with the hover/flap animation in M07.

Also useful: `BeeDiagram_01_External.jpg` (project root) for real bee anatomy
(segmented legs, pollen basket, fore/hind wing sizes, elbowed antennae).

Design traits all references share: narrow waist connector between thorax and abdomen;
gold helmet faceplate (no beak - the point is the mandibles); one large faceted blue eye per side in a gold ring;
elbowed, gold-banded antennae; six 3-segment legs rooted on the thorax with gold joints
and hooked claw feet; large forewing + smaller hind wing with gold vein web; thorax with
gold collar, wing-socket ring, bolt disc and vent grille; riveted abdomen plates tapering
to a silver drill stinger; standing pose, body roughly horizontal.

## Milestone plan

The original milestone list was lost with the first chat. This plan was agreed 2026-09-30.
Only M01 and M07 (drill/tool swap) are from the original notes.

| # | Name | Scope |
|---|------|-------|
| M01 | Proportion blockout | Done 2026-09-06. Parts, controls, attachment mounts, mandible driver. |
| M02 | Silhouette | Waist connector, helmet head shape, abdomen taper, standing pose. |
| M03 | Legs and antennae | 3-segment legs, hooked claw feet, elbowed banded antennae. |
| M04 | Wings | Fore/hind wing shapes, gold vein web, membrane look. |
| M05 | Head details | Faceted hex eye lenses, gold eye rings, faceplate, mandibles. |
| M06 | Armor and hardware | Plate seams, rivets, collar, wing-socket ring, bolt disc, vent grille. |
| M07 | Rig and swap | Production armature, hover animation, drill-stinger / tool swap validation. |

Workflow: each milestone is built from these scripts, rendered (Front/Side/ThreeQuarter),
and reviewed by the user before the next one starts. Output files are named
`BB_M0X_<Name>.blend` and `BB_M0X_<View>.png`. Earlier milestone files are kept.
