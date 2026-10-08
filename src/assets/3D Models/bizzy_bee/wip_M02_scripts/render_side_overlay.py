import bpy
from mathutils import Vector
from pathlib import Path
# Run: blender --background --python wip_M02_scripts/<this file>  (after build.py)
ROOT=str(Path(__file__).resolve().parent.parent)  # the bizzy_bee folder
bpy.ops.wm.open_mainfile(filepath=ROOT+'/output/milestones/BB_M02_Silhouette.blend')
sc=bpy.context.scene
sc.render.resolution_x=sc.render.resolution_y=1024; sc.render.resolution_percentage=100; sc.cycles.samples=12
d=bpy.data.cameras.new('OV');d.type='ORTHO';d.ortho_scale=1024/157
o=bpy.data.objects.new('OV',d);sc.collection.objects.link(o)
o.location=(15,.14,2.87);o.rotation_euler=(Vector((0,.14,2.87))-o.location).to_track_quat('-Z','Y').to_euler()
sc.camera=o;sc.render.filepath=ROOT+'/output/renders/BB_M02_SideFlat.png';bpy.ops.render.render(write_still=True)
