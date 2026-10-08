import bpy
from mathutils import Vector
import config as C

def collection(name, parent):
    c = bpy.data.collections.new(name)
    parent.children.link(c)
    return c

def setup():
    # A new scene preserves every existing scene and object if run interactively.
    scene = bpy.data.scenes.new(f'BB_{C.MILESTONE}_{C.MILESTONE_NAME}')
    bpy.context.window.scene = scene
    root = collection('BIZZY_BEE', scene.collection)
    geo = collection('GEO', root)
    groups = {n: collection(n, geo) for n in
              ['HEAD','EYES','THORAX','ABDOMEN','STINGER','WINGS','LEGS','ANTENNAE']}
    for n in ['CONTROLS','RIG','OPTIONAL_ATTACHMENTS']:
        groups[n] = collection(n, root)
    groups['STUDIO'] = collection('STUDIO', scene.collection)
    return scene, groups

def material(name, color, metallic=0, roughness=.35):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = roughness
    return m

def materials():
    return {
        'gold': material('MAT_BB_Gold', (.70,.40,.095), .72,.29),
        'dark': material('MAT_BB_DarkMetal', (.035,.043,.054), .55,.30),
        'joint': material('MAT_BB_JointMetal', (.12,.15,.18), .7,.27),
        'eye': material('MAT_BB_BlueEye_BLOCKOUT', (.012,.38,.70), .35,.16),
        'silver': material('MAT_BB_DrillSilver', (.62,.64,.68), 1.0,.22),
        'wing': material('MAT_BB_WingMembrane_BLOCKOUT', (.24,.40,.49), .25,.32),
    }

def place(obj, name, group, mat=None, parent=None):
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    group.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if parent:
        world = obj.matrix_world.copy()
        obj.parent = parent
        obj.matrix_world = world
    return obj

def empty(name, location, group, parent=None):
    o = bpy.data.objects.new(name, None)
    group.objects.link(o)
    o.location = location
    o.empty_display_type = 'ARROWS'
    o.empty_display_size = .17
    bpy.context.view_layer.update()
    if parent:
        world = o.matrix_world.copy()
        o.parent = parent
        o.matrix_world = world
    return o

def sphere(name, location, scale, group, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=location)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    return place(o, name, group, mat, parent)

def bar(name, a, b, radius, group, mat, parent=None, tip=None):
    a,b = Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=radius,
        radius2=radius if tip is None else tip, depth=(b-a).length, location=(a+b)/2)
    o=bpy.context.object
    o.rotation_mode='QUATERNION'
    o.rotation_quaternion=(b-a).to_track_quat('Z','Y')
    bevel=o.modifiers.new('Soft mechanical edges','BEVEL')
    bevel.width=.025
    bevel.segments=3
    for p in o.data.polygons:
        p.use_smooth=True
    bpy.context.view_layer.update()
    return place(o,name,group,mat,parent)

def curve(name, points, radius, group, mat, parent=None, closed=False):
    d=bpy.data.curves.new(name,'CURVE')
    d.dimensions='3D'
    d.bevel_depth=radius
    d.bevel_resolution=3
    s=d.splines.new('POLY')
    s.points.add(len(points)-1)
    for p,co in zip(s.points,points):
        p.co=(*co,1)
    s.use_cyclic_u=closed
    o=bpy.data.objects.new(name,d)
    group.objects.link(o)
    if mat: d.materials.append(mat)
    if parent: o.parent=parent
    return o

def shell_patch(name, center, radii, az_range, el_range, group, mat, parent=None, lift=1.035, thickness=.035, res=36, round_power=3.0, deform=None):
    """A curved armour plate lying on an ellipsoid.

    Angles in degrees. Azimuth 0 = straight forward (-Y), +90 = left side (+X),
    180 = back. Elevation 0 = equator, +90 = top.
    """
    import math
    cx, cy, cz = center
    rx, ry, rz = (r * lift for r in radii)
    a0, a1 = (math.radians(a) for a in az_range)
    e0, e1 = (math.radians(e) for e in el_range)
    verts, faces = [], []
    n = round_power
    for i in range(res + 1):
        for j in range(res + 1):
            # Square grid squeezed into a superellipse: smooth, rounded plate outline.
            u = j / res * 2 - 1; v = i / res * 2 - 1
            r = max(abs(u), abs(v))
            f = r / ((abs(u) ** n + abs(v) ** n) ** (1 / n)) if r > 0 else 0
            u, v = u * f, v * f
            az = a0 + (a1 - a0) * (u + 1) / 2
            el = e0 + (e1 - e0) * (v + 1) / 2
            local = (rx * math.cos(el) * math.sin(az), -ry * math.cos(el) * math.cos(az), rz * math.sin(el))
            if deform:
                local = deform(local)
            verts.append((cx + local[0], cy + local[1], cz + local[2]))
    for i in range(res):
        for j in range(res):
            k = i * (res + 1) + j
            faces.append((k, k + 1, k + res + 2, k + res + 1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(mesh); bm.free()
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    group.objects.link(o)
    mesh.materials.append(mat)
    for p in mesh.polygons:
        p.use_smooth = True
    sol = o.modifiers.new('Plate thickness', 'SOLIDIFY')
    sol.thickness = thickness
    sol.offset = 1
    bev = o.modifiers.new('Plate edge', 'BEVEL')
    bev.width = .012
    bev.segments = 2
    if parent:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o
