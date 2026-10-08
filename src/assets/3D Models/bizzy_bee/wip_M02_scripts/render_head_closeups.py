import bpy
from mathutils import Vector
from pathlib import Path
# Run: blender --background --python wip_M02_scripts/<this file>  (after build.py)
ROOT=str(Path(__file__).resolve().parent.parent)  # the bizzy_bee folder
bpy.ops.wm.open_mainfile(filepath=ROOT+'/output/milestones/BB_M02_Silhouette.blend')
sc=bpy.context.scene
d=bpy.data.cameras.new('CU');d.type='ORTHO';d.ortho_scale=3.3
o=bpy.data.objects.new('CU',d);sc.collection.objects.link(o)
for name,loc,aim in [('HeadFront',(0,-9,2.75),(0,-1.9,2.75)),('HeadSide',(7,-1.95,2.6),(0,-1.95,2.6)),('HeadThreeQuarter',(5,-6.8,3.9),(0,-1.95,2.5))]:
    o.location=loc;o.rotation_euler=(Vector(aim)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    sc.camera=o;sc.render.filepath=ROOT+f'/output/renders/BB_M02_{name}.png';bpy.ops.render.render(write_still=True)
