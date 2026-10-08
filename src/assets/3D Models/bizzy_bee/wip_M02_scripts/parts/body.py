import math
import bpy
import bmesh
from mathutils import Vector, Matrix
import config as C
from core.scene import sphere, bar, empty, shell_patch

def abdomen_frame():
    """Rotation, front point and rear point of the abdomen shell."""
    rot = Matrix.Rotation(C.ABDOMEN_TILT, 4, 'X')
    centre = Vector(C.ABDOMEN)
    L = C.ABDOMEN_SCALE[1]
    rear = centre + rot @ Vector((0, L, 0)) - Vector((0, 0, C.ABDOMEN_DROOP))
    return rot, centre, centre + rot @ Vector((0, -L, 0)), rear

def droop(u):
    """Extra downward pull on the rear of the abdomen (0 at the waist half)."""
    k = max(0.0, (u - .35) / .65)
    return C.ABDOMEN_DROOP * k * k

def head_deform(p):
    """Turn the round head into the reference teardrop.

    The back of the skull stays round. The lower front (mouth area) is pulled
    forward and down into a tapered face that ends at the mandibles.
    p is relative to the head centre.
    """
    rx, ry, rz = C.HEAD_SCALE
    q = Vector((p[0] / rx, p[1] / ry, p[2] / rz))
    if q.length == 0:
        return p
    d = Vector(C.FACE_DIR).normalized()
    c = max(0.0, q.normalized().dot(d))
    w = c ** C.FACE_FALLOFF
    out = Vector(p) + d * (C.FACE_STRETCH * w * q.length)
    out.x *= 1 - C.FACE_NARROW * w        # face narrows toward the mouth
    return tuple(out)

def mouth_tip():
    """Point at the end of the face where the mandibles hinge (world space)."""
    rx, ry, rz = C.HEAD_SCALE
    d = Vector(C.FACE_DIR).normalized()
    surface = Vector((d.x * rx, d.y * ry, d.z * rz))
    return Vector(C.HEAD) + Vector(head_deform(tuple(surface)))

def build(g, m, master):
    body = empty('CTRL_Body', C.THORAX, g['CONTROLS'], master)
    head = empty('CTRL_Head', C.HEAD, g['CONTROLS'], body)
    hx, hy, hz = C.HEAD
    tz = C.THORAX_SCALE

    # --- Thorax: big dark sphere, gold collar facing the head.
    sphere('BB_Thorax', C.THORAX, C.THORAX_SCALE, g['THORAX'], m['dark'], body)
    sphere('BB_Thorax_FrontCollar', (0, -.60, 2.56), (.76, .16, .80), g['THORAX'], m['gold'], body)

    # --- Neck: visible dark joint between head and collar, with a gold ring.
    neck_front, neck_back = (0, hy + C.HEAD_SCALE[1] * .72, hz - .06), (0, -.66, 2.52)
    bar('BB_Neck', neck_front, neck_back, C.NECK_RADIUS, g['THORAX'], m['joint'], body)
    sphere('BB_Neck_Ring', tuple((a + b) / 2 for a, b in zip(neck_front, neck_back)), (.36, .06, .36), g['THORAX'], m['gold'], body)

    # --- Head: dark skull, teardrop from the side, shield-shaped from the front.
    # Plate layout follows reference/BB_Ref_05_Head_Front.png.
    hobj = sphere('BB_Head', C.HEAD, C.HEAD_SCALE, g['HEAD'], m['dark'], head)
    for v in hobj.data.vertices:
        v.co = head_deform(tuple(v.co))   # sphere() applies scale; origin is the head centre
    hobj.data.update()
    R = C.HEAD_SCALE
    kw = dict(deform=head_deform)
    # Crown: gold dome across the top, between the antenna sockets.
    shell_patch('BB_HeadPlate_Crown', C.HEAD, R, (-80, 80), (40, 92), g['HEAD'], m['gold'], head, round_power=5.0, **kw)
    # Face shield: two long panels with a centre seam, forehead down to the mandibles.
    shell_patch('BB_HeadPlate_Face_L', C.HEAD, R, (1.5, 30), (-70, 36), g['HEAD'], m['gold'], head, round_power=6.0, **kw)
    shell_patch('BB_HeadPlate_Face_R', C.HEAD, R, (-30, -1.5), (-70, 36), g['HEAD'], m['gold'], head, round_power=6.0, **kw)
    # Cheeks: angled plates under each eye, running down to the mandible hinge.
    for side, s in [('L', 1), ('R', -1)]:
        az = (36, 72) if s == 1 else (-72, -36)
        shell_patch('BB_HeadPlate_Cheek_' + side, C.HEAD, R, az, (-74, -30), g['HEAD'], m['gold'], head, round_power=4.0, **kw)

    # Lower back of the skull.
    shell_patch('BB_HeadPlate_BackSkull', C.HEAD, R, (128, 232), (-46, 18), g['HEAD'], m['gold'], head, **kw)

    # --- Eyes: big lenses bulging out of the sides, thick gold rims.
    ex, ez = C.EYE_OFFSET
    er = C.EYE_SIZE
    for side, s in [('L', 1), ('R', -1)]:
        # Eyes sit on the sides but turn partly forward, so they read from the front too.
        t = math.radians(C.EYE_TURN)
        out = Vector((s * math.cos(t), -math.sin(t), 0))
        base = Vector((s * .56, hy + ex, hz + ez))
        for nm, mat, push, sc in [('BB_EyeRim_', m['gold'], .14, (.20, er * 1.16, er * 1.20)),
                                  ('BB_Eye_', m['eye'], .26, (.16, er, er * 1.04))]:
            o = sphere(nm + side, tuple(base + out * push), sc, g['EYES'], mat, head)
            o.rotation_euler.z = -s * t

    # --- Mandibles: two per side (outer blade + inner prong), meeting at the centre.
    tip = mouth_tip()
    for side, s in [('L', 1), ('R', -1)]:
        base = tip + Vector((s * .34, .08, .14))
        pivot = empty('CTRL_Mandible_' + side, tuple(base), g['CONTROLS'], head)
        mid = tip + Vector((s * .28, -.14, -.10))
        point = tip + Vector((s * .03, -.34, -.30))
        bar('BB_Mandible_' + side, tuple(base), tuple(mid), .11, g['HEAD'], m['dark'], pivot, tip=.085)
        bar('BB_Mandible_' + side + '_Blade', tuple(mid), tuple(point), .085, g['HEAD'], m['dark'], pivot, tip=.008)
        bar('BB_Mandible_' + side + '_Inner', tuple(tip + Vector((s * .12, .04, .06))), tuple(tip + Vector((s * .05, -.24, -.20))), .065, g['HEAD'], m['dark'], pivot, tip=.008)
        pivot['hinge_axis'] = 'local Z; mirrored open angles'
    head['mandible_open'] = 0.0
    head.id_properties_ui('mandible_open').update(min=0, max=1, description='Shared opening; individual hinge rotations remain editable')
    for side, s in [('L', 1), ('R', -1)]:
        pivot = bpy.data.objects['CTRL_Mandible_' + side]
        # Delta rotation leaves ordinary rotation available for independent posing.
        d = pivot.driver_add('delta_rotation_euler', 2).driver
        d.type = 'SCRIPTED'
        v = d.variables.new(); v.name = 'opening'; v.type = 'SINGLE_PROP'; v.targets[0].id = head
        v.targets[0].data_path = '["mandible_open"]'
        d.expression = f'opening * {s * .6}'

    # --- Waist: narrow connector from thorax rear to abdomen front.
    rot, centre, front, rear = abdomen_frame()
    thorax_rear = Vector((0, tz[1] * .80, C.THORAX[2] - .12))
    waist_end = front + rot @ Vector((0, .18, 0))
    abdomen = empty('CTRL_Abdomen', thorax_rear, g['CONTROLS'], body)
    bar('BB_Waist', thorax_rear, waist_end, C.WAIST_RADIUS, g['ABDOMEN'], m['joint'], abdomen)
    sphere('BB_Waist_Ring', thorax_rear.lerp(waist_end, .45), (.36, .12, .36), g['ABDOMEN'], m['gold'], abdomen)

    # --- Abdomen: continuous lathed shell, egg-shaped (fat front, tapered rear).
    verts = []; faces = []; bands = []
    rings = 40; sides = 64
    W, L, H = C.ABDOMEN_SCALE
    for i in range(rings + 1):
        t = math.pi * i / rings
        u = i / rings
        taper = 1 - C.ABDOMEN_TAPER * u ** 1.6
        for j in range(sides):
            a = 2 * math.pi * j / sides
            local = Vector((W * taper * math.sin(t) * math.cos(a),
                            -L * math.cos(t),
                            H * taper * math.sin(t) * math.sin(a)))
            verts.append(tuple(rot @ local + centre - Vector((0, 0, droop(u)))))
    # Four gold bands, like the references (dark nose, dark tail).
    band_rings = [(7, 11), (15, 19), (23, 27), (31, 34)]
    for i in range(rings):
        gold = any(a <= i < b for a, b in band_rings)
        for j in range(sides):
            faces.append((i * sides + j, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, (i + 1) * sides + j))
            bands.append(0 if gold else 1)
    mesh = bpy.data.meshes.new('BB_Abdomen_ContinuousShell'); mesh.from_pydata(verts, [], faces); mesh.update()
    o = bpy.data.objects.new('BB_Abdomen', mesh); g['ABDOMEN'].objects.link(o)
    mesh.materials.append(m['gold']); mesh.materials.append(m['dark'])
    for p, b in zip(mesh.polygons, bands): p.material_index = b; p.use_smooth = True
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh); bm.free()
    o.parent = abdomen; o.matrix_parent_inverse = abdomen.matrix_world.inverted()

    # --- Drill stinger: gold collar + silver cone off the tapered rear.
    # The tail tip curls down, so the stinger follows that curl, not the body axis.
    tail_dir = (Matrix.Rotation(-C.STINGER_CURL, 4, 'X') @ rot) @ Vector((0, 1, 0))
    socket = rear - tail_dir * .10
    tip = rear + tail_dir * .62
    stinger = empty('CTRL_Stinger', socket, g['CONTROLS'], abdomen)
    bar('BB_StingerSocket', socket, socket.lerp(tip, .25), .22, g['STINGER'], m['gold'], stinger)
    bar('BB_Stinger', socket.lerp(tip, .20), tip, .18, g['STINGER'], m['silver'], stinger, tip=0)
    return body, head, abdomen, stinger
