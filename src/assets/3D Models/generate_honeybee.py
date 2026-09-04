"""
Bizzybee — Procedural Rigged Honeybee (Apis mellifera)
=======================================================

Run this INSIDE Blender: Scripting tab -> Open this file -> Run Script (Alt+P).
Blender 4.0+ recommended (uses Principled BSDF v2 socket names).

What it builds:
  - A segmented honeybee body (head, thorax, striped abdomen, 6 legs each
    with 4 jointed segments, 2 pairs of wings, 2 antennae) as separate rigid
    mesh parts.
  - An armature ("BeeArmature") with one bone per moving part, rigidly
    bound to its mesh part via a Child Of constraint (no weight painting
    needed — every part moves as a solid piece when you pose its bone).
  - A short looping demo animation: legs cycle through an alternating
    tripod walk, wings flutter fast, antennae sway gently.
  - A camera + basic 3-point lighting so you can hit Render right away.

After running:
  - Press Space in the 3D viewport (or the timeline Play button) to see it move.
  - Go to the Armature's Pose Mode to hand-pose any bone yourself.
  - File > Save As to keep it, or File > Export to send it to a game engine
    (glTF export will carry the armature + animation with it).

Everything is parametric near the top of the file (BEE_SCALE, colors,
walk-cycle length, etc.) if you want to retune proportions or timing.
"""

import bpy
import bmesh
import math
from mathutils import Matrix, Vector

# ---------------------------------------------------------------------------
# 0. CONFIG
# ---------------------------------------------------------------------------

BEE_SCALE = 1.0          # overall uniform scale multiplier
WALK_CYCLE_FRAMES = 20   # length of one walk-cycle loop, in frames
WING_FLAP_FRAMES = 4     # length of one wing-flap loop, in frames (fast!)
ANTENNA_SWAY_FRAMES = 60 # slow gentle sway loop
FPS = 24

COL_CHITIN   = (0.05, 0.035, 0.02, 1.0)   # near-black body/leg chitin
COL_GOLD     = (0.85, 0.62, 0.08, 1.0)    # warm amber/gold stripe
COL_ABDOMEN  = (0.09, 0.06, 0.02, 1.0)    # dark base band colour
COL_WING     = (0.9, 0.88, 0.8, 0.25)     # pale, mostly-transparent wing
COL_EYE      = (0.02, 0.02, 0.03, 1.0)

# ---------------------------------------------------------------------------
# 1. SCENE RESET
# ---------------------------------------------------------------------------

def reset_scene():
    # Pure data-API clear (no bpy.ops.object.select_all/delete): those two
    # operators require an actual 3D-viewport context to poll() successfully,
    # which isn't guaranteed when this script is run from the Text Editor —
    # especially if Blender was left in Pose/Edit mode from a previous run.
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except RuntimeError:
            pass
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for block_collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                              bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for block in list(block_collection):
            if block.users == 0:
                block_collection.remove(block)

reset_scene()
scene = bpy.context.scene
scene.render.fps = FPS

# ---------------------------------------------------------------------------
# 2. MATERIALS
# ---------------------------------------------------------------------------

def make_material(name, rgba, roughness=0.35, alpha=1.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = transmission
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = 'BLEND'
        mat.show_transparent_back = False
    return mat

mat_chitin  = make_material("Bee_Chitin", COL_CHITIN, roughness=0.25)
mat_gold    = make_material("Bee_GoldStripe", COL_GOLD, roughness=0.4)
mat_abdomen = make_material("Bee_AbdomenBase", COL_ABDOMEN, roughness=0.3)
mat_wing    = make_material("Bee_Wing", COL_WING, roughness=0.15, alpha=0.28)
mat_eye     = make_material("Bee_Eye", COL_EYE, roughness=0.1)

# ---------------------------------------------------------------------------
# 3. MESH-BUILDING HELPERS  (all bmesh-based: no operator/context dependence)
# ---------------------------------------------------------------------------

def new_object_from_bmesh(name, bm, location=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj

def add_material(obj, mat):
    obj.data.materials.append(mat)

def make_ellipsoid(name, location, radii, material, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        v.co.x *= radii[0]
        v.co.y *= radii[1]
        v.co.z *= radii[2]
    obj = new_object_from_bmesh(name, bm, location)
    add_material(obj, material)
    return obj

def make_tapered_segment(name, start, end, radius_start, radius_end, material, segs=8):
    """A cylinder-like segment running from `start` to `end` in world space,
    tapering from radius_start to radius_end (a leg/antenna bone-segment)."""
    start = Vector(start)
    end = Vector(end)
    length = (end - start).length
    bm = bmesh.new()
    ret = bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=True, segments=segs,
        radius1=radius_start, radius2=radius_end, depth=length,
    )
    # create_cone builds along +Z through the origin; shift so base sits at z=0
    for v in bm.verts:
        v.co.z += length / 2.0
    mesh = bpy.data.meshes.new(name + "_mesh")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = start
    # orient local +Z to point from start to end
    direction = (end - start).normalized()
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction)
    bpy.context.scene.collection.objects.link(obj)
    add_material(obj, material)
    return obj

def make_wing(name, base, tip_offset, width, material):
    """A flat lens/oval wing mesh, base at `base`, extending toward tip_offset."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
    tip_len = Vector(tip_offset).length
    for v in bm.verts:
        v.co.x *= width
        v.co.y *= tip_len
        v.co.z *= width * 0.12  # squash flat
    obj = new_object_from_bmesh(name, bm, base)
    direction = Vector(tip_offset).normalized()
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(direction)
    add_material(obj, material)
    return obj

# ---------------------------------------------------------------------------
# 4. BUILD THE BODY  (head / thorax / abdomen / eyes)
# ---------------------------------------------------------------------------

s = BEE_SCALE
head_loc    = Vector((0, 0.62, 0.15)) * s
thorax_loc  = Vector((0, 0.32, 0.16)) * s
abdomen_loc = Vector((0, -0.22, 0.10)) * s

head = make_ellipsoid("Head", head_loc, Vector((0.16, 0.17, 0.16)) * s, mat_chitin)
thorax = make_ellipsoid("Thorax", thorax_loc, Vector((0.22, 0.23, 0.20)) * s, mat_chitin)
abdomen = make_ellipsoid("Abdomen", abdomen_loc, Vector((0.20, 0.42, 0.19)) * s, mat_abdomen)

eye_l = make_ellipsoid("Eye_L", head_loc + Vector((0.15, 0.04, 0.02)) * s, Vector((0.06, 0.09, 0.09)) * s, mat_eye)
eye_r = make_ellipsoid("Eye_R", head_loc + Vector((-0.15, 0.04, 0.02)) * s, Vector((0.06, 0.09, 0.09)) * s, mat_eye)

# Abdomen stripes: three extra thin gold bands wrapped around the abdomen
stripe_objs = []
for i, t in enumerate([0.15, 0.42, 0.68]):
    band_y = abdomen_loc.y + 0.42 * s - t * 0.80 * s
    band = make_ellipsoid(f"AbdomenStripe_{i}", (abdomen_loc.x, band_y, abdomen_loc.z),
                           Vector((0.205, 0.06, 0.195)) * s, mat_gold)
    stripe_objs.append(band)

# ---------------------------------------------------------------------------
# 5. LEG / ANTENNA / WING GEOMETRY DEFINITIONS
# ---------------------------------------------------------------------------
# Each leg is defined by an attach point on the thorax and a simple 4-joint
# zig-zag (coxa -> femur -> tibia -> tarsus) ending near the ground (z ~ 0).

LEG_DEFS = []
for pair_name, y_off, lean in (("Front", 0.16, 0.10), ("Mid", 0.00, 0.0), ("Hind", -0.16, -0.14)):
    for side, x_sign in (("L", 1), ("R", -1)):
        attach = Vector((0.20 * x_sign, thorax_loc.y + y_off, thorax_loc.z - 0.02)) * 1.0
        LEG_DEFS.append({
            "name": f"Leg{pair_name}{side}",
            "attach": attach,
            "x_sign": x_sign,
            "lean": lean,
        })

def leg_joint_chain(attach, x_sign, lean):
    """Return 4 world-space points: coxa_start, femur_start, tibia_start, tarsus_start, tarsus_end."""
    p0 = attach.copy()
    p1 = p0 + Vector((0.10 * x_sign, 0.02 * lean, -0.05)) * s          # end of coxa
    p2 = p1 + Vector((0.16 * x_sign, 0.10 * lean, -0.14)) * s          # end of femur
    p3 = p2 + Vector((0.05 * x_sign, 0.06 * lean, -0.10)) * s          # end of tibia
    p4 = p3 + Vector((0.02 * x_sign, 0.10 * lean, -0.01)) * s          # end of tarsus (foot, near ground)
    return [p0, p1, p2, p3, p4]

# ---------------------------------------------------------------------------
# 6. BUILD LEGS
# ---------------------------------------------------------------------------

leg_meshes = {}   # leg name -> {segment_name: obj}
leg_points = {}   # leg name -> [p0..p4]

for leg in LEG_DEFS:
    pts = leg_joint_chain(leg["attach"], leg["x_sign"], leg["lean"])
    leg_points[leg["name"]] = pts
    seg_names = ["Coxa", "Femur", "Tibia", "Tarsus"]
    radii = [(0.055, 0.045), (0.045, 0.03), (0.03, 0.018), (0.018, 0.01)]
    objs = {}
    for i, seg_name in enumerate(seg_names):
        full_name = f"{leg['name']}_{seg_name}"
        obj = make_tapered_segment(full_name, pts[i], pts[i + 1], radii[i][0] * s, radii[i][1] * s, mat_chitin)
        objs[seg_name] = obj
    leg_meshes[leg["name"]] = objs

# ---------------------------------------------------------------------------
# 7. BUILD ANTENNAE
# ---------------------------------------------------------------------------

antenna_points = {}
antenna_meshes = {}
for side, x_sign in (("L", 1), ("R", -1)):
    base = head_loc + Vector((0.08 * x_sign, 0.10, 0.10)) * s
    mid = base + Vector((0.06 * x_sign, 0.16, 0.14)) * s
    tip = mid + Vector((0.10 * x_sign, 0.10, 0.06)) * s
    name = f"Antenna{side}"
    antenna_points[name] = [base, mid, tip]
    seg1 = make_tapered_segment(f"{name}_Seg1", base, mid, 0.018 * s, 0.012 * s, mat_chitin)
    seg2 = make_tapered_segment(f"{name}_Seg2", mid, tip, 0.012 * s, 0.006 * s, mat_chitin)
    antenna_meshes[name] = {"Seg1": seg1, "Seg2": seg2}

# ---------------------------------------------------------------------------
# 8. BUILD WINGS
# ---------------------------------------------------------------------------

wing_defs = [
    ("WingFL", Vector((0.05, 0.30, 0.30)) * s, Vector((0.50, -0.14, 0.06)) * s, 0.14 * s),
    ("WingFR", Vector((-0.05, 0.30, 0.30)) * s, Vector((-0.50, -0.14, 0.06)) * s, 0.14 * s),
    ("WingHL", Vector((0.04, 0.20, 0.27)) * s, Vector((0.34, -0.22, -0.02)) * s, 0.09 * s),
    ("WingHR", Vector((-0.04, 0.20, 0.27)) * s, Vector((-0.34, -0.22, -0.02)) * s, 0.09 * s),
]
wing_meshes = {}
wing_bases = {}
for name, base, tip_offset, width in wing_defs:
    wing_meshes[name] = make_wing(name, base, tip_offset, width, mat_wing)
    wing_bases[name] = base

# ---------------------------------------------------------------------------
# 9. ARMATURE
# ---------------------------------------------------------------------------

arm_data = bpy.data.armatures.new("BeeArmature_data")
arm_obj = bpy.data.objects.new("BeeArmature", arm_data)
bpy.context.scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')
ebones = arm_data.edit_bones

def add_bone(name, head, tail, parent=None):
    b = ebones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = parent
        b.use_connect = False
    return b

root = add_bone("Root", (0, 0, 0), (0, 0.08, 0))
b_thorax = add_bone("Thorax", thorax_loc, thorax_loc + Vector((0, 0.12, 0)), root)
b_head = add_bone("Head", head_loc - Vector((0, 0.1, 0)), head_loc + Vector((0, 0.15, 0)), b_thorax)
b_abdomen = add_bone("Abdomen", abdomen_loc + Vector((0, 0.35, 0)), abdomen_loc - Vector((0, 0.35, 0)), b_thorax)

antenna_bones = {}
for name, pts in antenna_points.items():
    b1 = add_bone(f"{name}_Seg1", pts[0], pts[1], b_head)
    b2 = add_bone(f"{name}_Seg2", pts[1], pts[2], b1)
    antenna_bones[name] = (b1, b2)

leg_bones = {}
for leg_name, pts in leg_points.items():
    seg_names = ["Coxa", "Femur", "Tibia", "Tarsus"]
    parent = b_thorax
    chain = []
    for i, seg_name in enumerate(seg_names):
        b = add_bone(f"{leg_name}_{seg_name}", pts[i], pts[i + 1], parent)
        parent = b
        chain.append(b)
    leg_bones[leg_name] = chain

wing_bones = {}
for name, base, tip_offset, width in wing_defs:
    b = add_bone(f"{name}_Bone", base, base + Vector(tip_offset).normalized() * 0.15, b_thorax)
    b.align_roll(Vector((0, 0, 1)))  # local Z -> world up, so local X becomes the flap-hinge axis
    wing_bones[name] = b

bpy.ops.object.mode_set(mode='OBJECT')

# ---------------------------------------------------------------------------
# 10. RIGID-ATTACH EACH MESH PART TO ITS BONE (Child Of constraint)
# ---------------------------------------------------------------------------

def attach_to_bone(obj, bone_name):
    con = obj.constraints.new('CHILD_OF')
    con.target = arm_obj
    con.subtarget = bone_name
    pbone = arm_obj.pose.bones[bone_name]
    con.inverse_matrix = (arm_obj.matrix_world @ pbone.matrix).inverted()

attach_to_bone(head, "Head")
attach_to_bone(eye_l, "Head")
attach_to_bone(eye_r, "Head")
attach_to_bone(thorax, "Thorax")
attach_to_bone(abdomen, "Abdomen")
for band in stripe_objs:
    attach_to_bone(band, "Abdomen")

for name, segs in antenna_meshes.items():
    attach_to_bone(segs["Seg1"], f"{name}_Seg1")
    attach_to_bone(segs["Seg2"], f"{name}_Seg2")

for leg_name, segs in leg_meshes.items():
    for seg_name, obj in segs.items():
        attach_to_bone(obj, f"{leg_name}_{seg_name}")

for name, obj in wing_meshes.items():
    attach_to_bone(obj, f"{name}_Bone")

# ---------------------------------------------------------------------------
# 11. ANIMATION — walk cycle (legs), wing flap, antenna sway
# ---------------------------------------------------------------------------

bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='POSE')
pose = arm_obj.pose

def keyframe_bone_rotation(bone_name, frame, euler_degrees):
    pb = pose.bones[bone_name]
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = tuple(math.radians(d) for d in euler_degrees)
    pb.keyframe_insert(data_path="rotation_euler", frame=frame)

def get_action_fcurves(action):
    """Return every F-Curve on an Action, regardless of Blender version.

    Blender 4.4+ moved F-Curves off Action.fcurves and into a
    layers -> strips -> channelbags hierarchy (the "layered/slotted
    actions" system); older Blender still exposes the flat Action.fcurves
    list directly. Support both so this script keeps working either way.
    """
    if action is None:
        return []
    fcurves = []
    layers = getattr(action, "layers", None)
    if layers:
        for layer in layers:
            for strip in layer.strips:
                for cbag in getattr(strip, "channelbags", []):
                    fcurves.extend(cbag.fcurves)
    if not fcurves and hasattr(action, "fcurves"):
        fcurves = list(action.fcurves)
    return fcurves

def add_cycle_modifier(bone_name):
    if arm_obj.animation_data and arm_obj.animation_data.action:
        target_path = f'pose.bones["{bone_name}"].rotation_euler'
        for fc in get_action_fcurves(arm_obj.animation_data.action):
            if fc.data_path == target_path:
                if not any(m.type == 'CYCLES' for m in fc.modifiers):
                    fc.modifiers.new('CYCLES')

# --- Walk cycle: alternating tripod gait -----------------------------------
# Group A: FrontL + HindR + MidL swing forward together
# Group B: FrontR + HindL + MidR swing forward on the opposite half-cycle
group_a = ["LegFrontL", "LegHindR", "LegMidL"]
group_b = ["LegFrontR", "LegHindL", "LegMidR"]
half = WALK_CYCLE_FRAMES // 2

for group, phase in ((group_a, 0), (group_b, half)):
    for leg_name in group:
        femur = f"{leg_name}_Femur"
        tibia = f"{leg_name}_Tibia"
        f0, f1, f2 = 1 + phase, 1 + phase + half // 2, 1 + phase + half
        # forward-swing / lift, then plant-and-push-back
        keyframe_bone_rotation(femur, ((f0 - 1) % WALK_CYCLE_FRAMES) + 1, (-18, 0, 0))
        keyframe_bone_rotation(femur, ((f1 - 1) % WALK_CYCLE_FRAMES) + 1, (18, 0, 0))
        keyframe_bone_rotation(femur, ((f2 - 1) % WALK_CYCLE_FRAMES) + 1, (-18, 0, 0))
        keyframe_bone_rotation(tibia, ((f0 - 1) % WALK_CYCLE_FRAMES) + 1, (10, 0, 0))
        keyframe_bone_rotation(tibia, ((f1 - 1) % WALK_CYCLE_FRAMES) + 1, (-14, 0, 0))
        keyframe_bone_rotation(tibia, ((f2 - 1) % WALK_CYCLE_FRAMES) + 1, (10, 0, 0))

for leg_name in group_a + group_b:
    add_cycle_modifier(f"{leg_name}_Femur")
    add_cycle_modifier(f"{leg_name}_Tibia")

# --- Wing flap: fast up/down flutter ---------------------------------------
# (bone roll was aligned so world-up = local Z; local X is the flap-hinge axis)
for name in ("WingFL_Bone", "WingHL_Bone", "WingFR_Bone", "WingHR_Bone"):
    keyframe_bone_rotation(name, 1, (-12, 0, 0))
    keyframe_bone_rotation(name, 1 + WING_FLAP_FRAMES // 2, (65, 0, 0))
    keyframe_bone_rotation(name, 1 + WING_FLAP_FRAMES, (-12, 0, 0))
    add_cycle_modifier(name)

# --- Antenna sway: slow gentle wave -----------------------------------------
for name in ("AntennaL_Seg1", "AntennaR_Seg1"):
    keyframe_bone_rotation(name, 1, (0, 0, -6))
    keyframe_bone_rotation(name, 1 + ANTENNA_SWAY_FRAMES // 2, (0, 0, 6))
    keyframe_bone_rotation(name, 1 + ANTENNA_SWAY_FRAMES, (0, 0, -6))
    add_cycle_modifier(name)

# Set all fcurve interpolation to smooth Bezier for organic motion
if arm_obj.animation_data and arm_obj.animation_data.action:
    for fc in get_action_fcurves(arm_obj.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.handle_left_type = 'AUTO_CLAMPED'
            kp.handle_right_type = 'AUTO_CLAMPED'

bpy.ops.object.mode_set(mode='OBJECT')

scene.frame_start = 1
scene.frame_end = max(WALK_CYCLE_FRAMES, ANTENNA_SWAY_FRAMES) + 1
scene.frame_set(1)

# ---------------------------------------------------------------------------
# 12. GROUP EVERYTHING, ADD CAMERA + LIGHTING
# ---------------------------------------------------------------------------

all_body_parts = [head, eye_l, eye_r, thorax, abdomen] + stripe_objs
for segs in antenna_meshes.values():
    all_body_parts += list(segs.values())
for segs in leg_meshes.values():
    all_body_parts += list(segs.values())
all_body_parts += list(wing_meshes.values())

bee_collection = bpy.data.collections.new("Honeybee")
bpy.context.scene.collection.children.link(bee_collection)
for obj in all_body_parts + [arm_obj]:
    for coll in obj.users_collection:
        coll.objects.unlink(obj)
    bee_collection.objects.link(obj)

def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

cam_data = bpy.data.cameras.new("BeeCam")
cam_data.lens = 40
cam_obj = bpy.data.objects.new("BeeCam", cam_data)
cam_obj.location = (2.1, -1.5, 0.75)
bpy.context.scene.collection.objects.link(cam_obj)
look_at(cam_obj, (0, 0.05, 0.15))
scene.camera = cam_obj

sun_data = bpy.data.lights.new("Sun", type='SUN')
sun_data.energy = 3.0
sun_obj = bpy.data.objects.new("Sun", sun_data)
sun_obj.location = (2, -2, 3)
sun_obj.rotation_euler = (math.radians(45), 0, math.radians(35))
bpy.context.scene.collection.objects.link(sun_obj)

fill_data = bpy.data.lights.new("Fill", type='AREA')
fill_data.energy = 40.0
fill_data.size = 1.5
fill_obj = bpy.data.objects.new("Fill", fill_data)
fill_obj.location = (-1.5, -1.0, 0.8)
bpy.context.scene.collection.objects.link(fill_obj)

for engine_name in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        scene.render.engine = engine_name
        break
    except TypeError:
        continue

print("=" * 60)
print("Honeybee build complete.")
print(f"  Mesh parts: {len(all_body_parts)}")
print(f"  Armature bones: {len(arm_data.bones)}")
print(f"  Animation frame range: {scene.frame_start}-{scene.frame_end}")
print("=" * 60)
