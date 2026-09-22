import math
import bpy
import bmesh
from mathutils import Vector, Matrix
import config as C
from core.scene import sphere, bar, empty, place

def build(g,m,master):
    body=empty('CTRL_Body',C.THORAX,g['CONTROLS'],master)
    head=empty('CTRL_Head',C.HEAD,g['CONTROLS'],body)
    sphere('BB_Head',C.HEAD,C.HEAD_SCALE,g['HEAD'],m['dark'],head)
    sphere('BB_Thorax',C.THORAX,C.THORAX_SCALE,g['THORAX'],m['dark'],body)
    sphere('BB_Thorax_FrontCollar',(0,-.55,2.55),(.87,.25,.86),g['THORAX'],m['gold'],body)
    sphere('BB_Head_CentralArmor',(0,-1.68,2.58),(.29,.30,.63),g['HEAD'],m['gold'],head)
    for side,s in [('L',1),('R',-1)]:
        sphere('BB_EyeRim_'+side,(s*.55,-1.50,2.62),(.27,.49,.52),g['EYES'],m['gold'],head)
        sphere('BB_Eye_'+side,(s*.70,-1.53,2.63),(.20,.40,.43),g['EYES'],m['eye'],head)
        pivot=empty('CTRL_Mandible_'+side,(s*.25,-1.67,2.06),g['CONTROLS'],head)
        bar('BB_Mandible_'+side,(s*.25,-1.67,2.06),(s*.07,-1.94,1.80),.13,g['HEAD'],m['joint'],pivot,tip=.025)
        pivot['hinge_axis']='local Z; mirrored open angles'
    head['mandible_open']=0.0
    head.id_properties_ui('mandible_open').update(min=0,max=1,description='Shared opening; individual hinge rotations remain editable')
    for side,s in [('L',1),('R',-1)]:
        pivot=bpy.data.objects['CTRL_Mandible_'+side]
        # Delta rotation leaves ordinary rotation available for independent posing.
        d=pivot.driver_add('delta_rotation_euler',2).driver
        d.type='SCRIPTED'
        v=d.variables.new(); v.name='opening'; v.type='SINGLE_PROP'; v.targets[0].id=head
        v.targets[0].data_path='["mandible_open"]'
        d.expression=f'opening * {s*.6}'
    abdomen=empty('CTRL_Abdomen',(0,.78,2.45),g['CONTROLS'],body)
    # Continuous lathed shell: material bands, no longitudinal panel split.
    verts=[]; faces=[]; bands=[]
    rings=36; sides=64
    rotation=Matrix.Rotation(C.ABDOMEN_TILT,4,'X')
    for i in range(rings+1):
        t=math.pi*i/rings
        for j in range(sides):
            a=2*math.pi*j/sides
            local=Vector((C.ABDOMEN_SCALE[0]*math.sin(t)*math.cos(a),
                          -C.ABDOMEN_SCALE[1]*math.cos(t),
                          C.ABDOMEN_SCALE[2]*math.sin(t)*math.sin(a)))
            verts.append(tuple(rotation@local+Vector(C.ABDOMEN)))
    for i in range(rings):
        for j in range(sides):
            faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
            bands.append((i//5)%2)
    mesh=bpy.data.meshes.new('BB_Abdomen_ContinuousShell');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new('BB_Abdomen',mesh);g['ABDOMEN'].objects.link(o)
    mesh.materials.append(m['gold']);mesh.materials.append(m['dark'])
    for p,b in zip(mesh.polygons,bands):p.material_index=b;p.use_smooth=True
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.to_mesh(mesh);bm.free()
    o.parent=abdomen;o.matrix_parent_inverse=abdomen.matrix_world.inverted()
    rear=Vector(C.ABDOMEN)+rotation@Vector((0,1.34,0))
    end=rear+rotation@Vector((0,.58,0))
    stinger=empty('CTRL_Stinger',rear,g['CONTROLS'],abdomen)
    bar('BB_StingerSocket',rear,end.lerp(rear,.7),.23,g['STINGER'],m['gold'],stinger)
    bar('BB_Stinger',rear.lerp(end,.23),end,.19,g['STINGER'],m['joint'],stinger,tip=0)
    return body,head,abdomen,stinger
