import math
import bpy
import config as C
from core.scene import sphere,bar,empty,curve

def build(g,m,body,head):
    mounts=[]
    for side,s in [('L',1),('R',-1)]:
        for tag in ['F','M','R']:
            name=tag+side
            hip,knee,ankle,toe=[(s*x,y,z) for x,y,z in C.LEGS[tag]]
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
        hy,hz=C.HEAD[1],C.HEAD[2]
        # Elbowed: shaft rises, then the tip bends forward.
        a=(s*.32,hy-.28,hz+.60); b=(s*.48,hy-.42,hz+1.28); c=(s*.92,hy-.92,hz+1.42)
        ctrl=empty('CTRL_Antenna_'+side,a,g['CONTROLS'],head)
        bar('BB_Antenna_'+side+'_Base',a,b,.048,g['ANTENNAE'],m['dark'],ctrl)
        bar('BB_Antenna_'+side+'_Tip',b,c,.043,g['ANTENNAE'],m['dark'],ctrl,tip=.025)
        sphere('BB_Antenna_'+side+'_Joint',b,(.06,.06,.06),g['ANTENNAE'],m['gold'],ctrl)
        origin=(s*C.WING_SOCKET[0],C.WING_SOCKET[1],C.WING_SOCKET[2])
        mount=empty('ATT_Wing_'+side,origin,g['OPTIONAL_ATTACHMENTS'],body)
        mount['interface']='BB_WING_V1'
        for label,(length,spread,rise,wide) in C.WINGS.items():
            ctrl=empty('CTRL_Wing_'+label+'_'+side,origin,g['CONTROLS'],mount)
            # Paddle planform: narrow root, widest ~65% out, round tip.
            # Membrane faces sideways (YZ plane) like the references.
            from mathutils import Vector as V
            axis=V((s*spread,length,rise))
            across=V((0,-rise,length)).normalized()       # toward the leading edge
            across=(across+V((s*.18,0,0))).normalized()
            def shape(u): return (u**.9)*((1-u)**.5)/.40
            n=40
            lead=[axis*u+across*(wide*.55*shape(u)) for u in [i/n for i in range(n+1)]]
            trail=[axis*u-across*(wide*shape(u)) for u in [i/n for i in range(n,0,-1)]]
            points=[tuple(p) for p in lead+trail[1:]]
            mesh=bpy.data.meshes.new('BB_WingMembrane_'+label+'_'+side)
            mesh.from_pydata(points,[],[tuple(range(len(points)))]);mesh.update()
            o=bpy.data.objects.new('BB_Wing_'+label+'_'+side,mesh)
            g['WINGS'].objects.link(o);o.parent=ctrl;mesh.materials.append(m['wing'])
            sol=o.modifiers.new('Membrane thickness','SOLIDIFY');sol.thickness=.012
            curve('BB_WingBorder_'+label+'_'+side,points,.025,g['WINGS'],m['gold'],ctrl,True)
            curve('BB_WingSpar_'+label+'_'+side,[(0,0,0),tuple(axis*.5+across*wide*.2),tuple(axis*.92+across*wide*.1)],.012,g['WINGS'],m['gold'],ctrl)
        sphere('BB_WingSocket_'+side,origin,(.18,.18,.18),g['WINGS'],m['gold'],mount)
    return mounts
