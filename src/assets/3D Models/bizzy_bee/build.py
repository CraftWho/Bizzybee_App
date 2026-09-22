"""Run: blender --background --python build.py -- --render"""
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
import bpy
import json
from core.scene import setup,materials,empty
from core.studio import setup as studio
from parts.body import build as body_build
from parts.appendages import build as appendages_build

scene,g=setup()
m=materials()
master=empty('CTRL_Master',(0,0,0),g['CONTROLS'])
body,head,abdomen,stinger=body_build(g,m,master)
appendages_build(g,m,body,head)
for name,loc,parent in [('HeadSensor',(0,-1.1,3.2),head),('ThoraxEquipment',(0,.15,3.42),body),('AbdomenCargo',(0,1.6,2.98),abdomen),('RearEquipment',(0,2.8,1.5),stinger)]:
    o=empty('ATT_'+name,loc,g['OPTIONAL_ATTACHMENTS'],parent)
    o['interface']='BB_EQUIPMENT_V1'
scene['milestone']='M01 proportion blockout; final eye cells, veins, panels, armature and hover are pending.'
scene['reference']='1788544424148.png primary; 1788543222964.png profile; 1788542751660.png mechanical details.'
cameras=studio(scene,g)
bpy.context.view_layer.update()

# Validate structural contracts and driven articulation in the evaluated scene.
assert len([o for o in g['LEGS'].objects if o.name.endswith('_Upper')])==6
assert len([o for o in g['WINGS'].objects if o.name.startswith('BB_Wing_')])==4
assert bpy.data.objects['BB_Stinger'].parent==stinger
assert all(bpy.data.objects['BB_Mandible_'+s].parent.name=='CTRL_Mandible_'+s for s in ['L','R'])
head['mandible_open']=1.0;head.update_tag()
for side in ['L','R']:
    obj=bpy.data.objects['CTRL_Mandible_'+side]
    for fc in obj.animation_data.drivers:
        fc.driver.expression=fc.driver.expression+' '
    obj.update_tag(refresh={'OBJECT'})
scene.frame_set(2);bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
angles=[bpy.data.objects['CTRL_Mandible_'+s].evaluated_get(deps).delta_rotation_euler.z for s in ['L','R']]
assert angles[0]>.5 and angles[1]<-.5,angles
head['mandible_open']=0.0;head.update_tag();scene.frame_set(1);bpy.context.view_layer.update()
report={'milestone':'M01','objects':len(scene.objects),'legs':6,'wings':4,'mandible_driver_test':'passed','mandible_open_angles':angles,'stinger_separate':True,'full_armature':False,'hover_animation':False}
(ROOT/'output'/'validation.json').write_text(json.dumps(report,indent=2))
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_distance=10
        a.spaces.active.region_3d.view_location=(0,.5,2.7)
        a.spaces.active.shading.type='MATERIAL'
blend=ROOT/'output'/'milestones'/'BB_M01_Blockout.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
if '--render' in sys.argv:
    for name,cam in cameras.items():
        scene.camera=cam
        scene.render.filepath=str(ROOT/'output'/'renders'/f'BB_M01_{name}.png')
        bpy.ops.render.render(write_still=True)
print('BB_M01_COMPLETE',str(blend),flush=True)
