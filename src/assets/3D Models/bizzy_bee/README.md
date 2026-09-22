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
