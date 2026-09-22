import math
import bpy
from core.scene import sphere,bar,empty,curve

def build(g,m,body,head):
    mounts=[]
    for side,s in [('L',1),('R',-1)]:
        for tag,y in [('F',-.57),('M',.06),('R',.64)]:
            name=tag+side
            hip=(s*.68,y,2.07)
            knee=(s*1.03,y+(.30 if tag=='R' else -.28),1.40)
            ankle=(s*1.10,y-.02,.63)
            toe=(s*1.16,y-.30,.38)
            mount=empty('ATT_Leg_'+name,hip,g['OPTIONAL_ATTACHMENTS'],body)
            mount['interface']='BB_LEG_V1';mount['outward_axis']='+X' if s==1 else '-X'
            mounts.append(mount)
            upper=empty('CTRL_Leg_'+name+'_Upper',hip,g['CONTROLS'],mount)
            lower=empty('CTRL_Leg_'+name+'_Lower',knee,g['CONTROLS'],upper)
            foot=empty('ATT_Foot_'+name,ankle,g['OPTIONAL_ATTACHMENTS'],lower)
            foot['interface']='BB_TOOL_V1'
            for suffix,p,pa in [('Hip',hip,upper),('Knee',knee,lower),('Ankle',ankle,foot)]:
                sphere('BB_Leg_'+name+'_'+suffix,p,(.14,.14,.14),g['LEGS'],m['gold'],pa)
            bar('BB_Leg_'+name+'_Upper',hip,knee,.105,g['LEGS'],m['dark'],upper)
            bar('BB_Leg_'+name+'_Lower',knee,ankle,.075,g['LEGS'],m['dark'],lower)
            bar('BB_Leg_'+name+'_Foot',ankle,toe,.072,g['LEGS'],m['joint'],foot,tip=.012)
        a=(s*.34,-1.30,3.04); b=(s*.49,-1.57,3.66); c=(s*.58,-2.10,3.89)
        ctrl=empty('CTRL_Antenna_'+side,a,g['CONTROLS'],head)
        bar('BB_Antenna_'+side+'_Base',a,b,.048,g['ANTENNAE'],m['dark'],ctrl)
        bar('BB_Antenna_'+side+'_Tip',b,c,.043,g['ANTENNAE'],m['dark'],ctrl,tip=.025)
        sphere('BB_Antenna_'+side+'_Joint',b,(.06,.06,.06),g['ANTENNAE'],m['gold'],ctrl)
        origin=(s*.62,.12,3.16)
        mount=empty('ATT_Wing_'+side,origin,g['OPTIONAL_ATTACHMENTS'],body)
        mount['interface']='BB_WING_V1'
        for label,length,spread,rise in [('Fore',2.85,1.45,2.05),('Hind',2.16,1.62,.92)]:
            ctrl=empty('CTRL_Wing_'+label+'_'+side,origin,g['CONTROLS'],mount)
            points=[]
            # Closed tapered planform with an actual membrane mesh.
            for i in range(48):
                t=2*math.pi*i/48
                u=(1-math.cos(t))/2
                width=.36*math.sin(t)*(math.sin(math.pi*u)**.45)
                points.append((s*(spread*u+width),length*u,rise*u-width*.3))
            mesh=bpy.data.meshes.new('BB_WingMembrane_'+label+'_'+side)
            mesh.from_pydata(points,[],[tuple(range(len(points)))]);mesh.update()
            o=bpy.data.objects.new('BB_Wing_'+label+'_'+side,mesh)
            g['WINGS'].objects.link(o);o.parent=ctrl;mesh.materials.append(m['wing'])
            sol=o.modifiers.new('Membrane thickness','SOLIDIFY');sol.thickness=.012
            curve('BB_WingBorder_'+label+'_'+side,points,.025,g['WINGS'],m['gold'],ctrl,True)
            curve('BB_WingSpar_'+label+'_'+side,[(0,0,0),(s*spread*.5,length*.5,rise*.5),(s*spread,length,rise)],.012,g['WINGS'],m['gold'],ctrl)
        sphere('BB_WingSocket_'+side,origin,(.18,.18,.18),g['WINGS'],m['gold'],mount)
    return mounts
