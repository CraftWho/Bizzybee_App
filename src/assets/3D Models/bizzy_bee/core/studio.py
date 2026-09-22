import bpy
from mathutils import Vector
from core.scene import place,material

def aim(o,point):
    o.rotation_euler=(Vector(point)-o.location).to_track_quat('-Z','Y').to_euler()

def setup(scene,g):
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=1000;scene.render.resolution_y=1000
    scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('BB_StudioWorld');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.24,.29,.36,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    for name,loc,power,size in [('Key',(4,-5,9),1600,5),('Fill',(-5,-3,5),1100,4),('Rim',(2,6,8),1800,4)]:
        d=bpy.data.lights.new('BB_'+name,'AREA');d.energy=power;d.shape='DISK';d.size=size
        o=bpy.data.objects.new('BB_'+name,d);g['STUDIO'].objects.link(o);o.location=loc;aim(o,(0,0,2.5))
    bpy.ops.mesh.primitive_plane_add(size=200)
    place(bpy.context.object,'BB_StudioFloor',g['STUDIO'],material('MAT_BB_Studio',(.19,.22,.27),0,.8))
    cameras={}
    for name,loc in [('Side',(12,-.1,4.3)),('Front',(0,-12,4.1)),('ThreeQuarter',(9,-11,7))]:
        d=bpy.data.cameras.new('BB_Camera_'+name);d.type='ORTHO';d.ortho_scale=7.8
        o=bpy.data.objects.new('BB_Camera_'+name,d);g['STUDIO'].objects.link(o);o.location=loc;aim(o,(0,.45,2.75));cameras[name]=o
    scene.camera=cameras['ThreeQuarter']
    return cameras
