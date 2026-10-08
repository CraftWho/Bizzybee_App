"""WIP M02 build. Run from the bizzy_bee folder:
    blender --background --python wip_M02_scripts/build.py -- --render
(--preview = fast low-sample renders). Imports the M02 modules next to this file;
writes to bizzy_bee/output/ like the M01 build."""
import sys
from pathlib import Path
HERE=Path(__file__).resolve().parent      # wip_M02_scripts (M02 config/core/parts)
ROOT=HERE.parent                          # bizzy_bee (output/ lives here)
sys.path.insert(0,str(HERE))
import bpy
import json
import config as C
from mathutils import Vector
from parts.body import abdomen_frame
from core.scene import setup,materials,empty
from core.studio import setup as studio
from parts.body import build as body_build
from parts.appendages import build as appendages_build

scene,g=setup()
m=materials()
master=empty('CTRL_Master',(0,0,0),g['CONTROLS'])
body,head,abdomen,stinger=body_build(g,m,master)
appendages_build(g,m,body,head)
rot,centre,front,rear=abdomen_frame()
hx,hy,hz=C.HEAD
for name,loc,parent in [('HeadSensor',(0,hy+.05,hz+C.HEAD_SCALE[2]),head),('ThoraxEquipment',(0,.15,C.THORAX[2]+C.THORAX_SCALE[2]),body),
                        ('AbdomenCargo',tuple(centre+rot@Vector((0,-.2,C.ABDOMEN_SCALE[2]))),abdomen),('RearEquipment',tuple(rear+rot@Vector((0,.0,-.35))),stinger)]:
    o=empty('ATT_'+name,loc,g['OPTIONAL_ATTACHMENTS'],parent)
    o['interface']='BB_EQUIPMENT_V1'
scene['milestone']=f'{C.MILESTONE} {C.MILESTONE_NAME}: waist, helmet head, side eyes, tapered abdomen, drill stinger, standing stance. Eye cells, veins, leg segments, panels, armature and hover are pending.'
scene['reference']='reference/BB_Ref_02_Render_Side.png primary; BB_Ref_04 side silhouette; BB_Ref_03 head/mechanical details; BB_Ref_01 badge.'
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
report={'milestone':C.MILESTONE,'objects':len(scene.objects),'legs':6,'wings':4,'mandible_driver_test':'passed','mandible_open_angles':angles,'stinger_separate':True,'full_armature':False,'hover_animation':False}
(ROOT/'output'/f'validation_{C.MILESTONE}.json').write_text(json.dumps(report,indent=2))
for a in bpy.context.screen.areas:
    if a.type=='VIEW_3D':
        a.spaces.active.region_3d.view_distance=10
        a.spaces.active.region_3d.view_location=(0,.5,2.7)
        a.spaces.active.shading.type='MATERIAL'
blend=ROOT/'output'/'milestones'/f'BB_{C.MILESTONE}_{C.MILESTONE_NAME}.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend))
if '--preview' in sys.argv:
    scene.cycles.samples=8;scene.render.resolution_percentage=50
if '--render' in sys.argv or '--preview' in sys.argv:
    for name,cam in cameras.items():
        scene.camera=cam
        scene.render.filepath=str(ROOT/'output'/'renders'/f'BB_{C.MILESTONE}_{name}.png')
        bpy.ops.render.render(write_still=True)
print(f'BB_{C.MILESTONE}_COMPLETE',str(blend),flush=True)
