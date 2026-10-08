"""Proportions. Front is -Y; left is +X; up is +Z. Ground is Z=0.

M02 silhouette values are measured from reference/BB_Ref_02_Render_Side.png
(about 140 px per unit, thorax centre as origin) and cross-checked against
BB_Ref_04_Illustration_Side.png.
"""
MILESTONE = 'M02'
MILESTONE_NAME = 'Silhouette'

HEAD = (0, -1.62, 2.58)
THORAX = (0, 0, 2.55)
ABDOMEN = (0, 2.12, 1.98)
HEAD_SCALE = (.80, .72, .74)
THORAX_SCALE = (.88, .92, .92)
ABDOMEN_SCALE = (1.02, 1.30, 1.02)   # half-width, half-length, half-height
ABDOMEN_TILT = -.32                # whole abdomen angle at the waist
ABDOMEN_DROOP = .45               # tail tip pulled down (curve, not tilt)
STINGER_CURL = .55                # stinger follows the tail curl (radians)
ABDOMEN_TAPER = .30                # rear end radius shrinks by this fraction
WAIST_RADIUS = .27
NECK_RADIUS = .26
EYE_SIZE = .44                     # lens radius (rim is ~20% bigger)
EYE_TURN = 22                      # degrees the eyes turn toward the front
EYE_OFFSET = (-.02, .12)            # (forward/back, up) from head centre
# Head teardrop: lower front pulled toward the mouth (see head_deform).
FACE_DIR = (0, -.74, -.67)         # forward and down
FACE_STRETCH = .52                 # how far the mouth area is pulled out
FACE_FALLOFF = 2.2                 # higher = only the mouth area moves
FACE_NARROW = .50                  # face width at the mouth vs. the skull

# Leg stance: hip, knee, ankle, toe for the left side (+X); right is mirrored.
LEGS = {
    'F': [(.60, -.52, 2.00), (1.00, -.88, 1.38), (1.12, -1.22, .46), (1.20, -1.55, .03)],
    'M': [(.68, .02, 1.92), (1.12, .08, 1.32), (1.26, -.06, .46), (1.36, .22, .03)],
    'R': [(.62, .52, 1.96), (1.10, 1.08, 1.95), (1.28, 1.62, .55), (1.40, 2.25, .03)],
}

# Wings: socket on top of the thorax; (length back, lateral spread, rise, width).
WING_SOCKET = (.40, .12, 3.20)
WINGS = {'Fore': (2.95, .95, 2.30, .78), 'Hind': (2.35, 1.05, 1.00, .58)}

RESOLUTION = 1000
