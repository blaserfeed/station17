"""Solid footprints for the station, shared by movement and temporal arrival."""
from math import cos, sin

from .content import BOUNDS, SPAWN, NPC, VALVE, SAFE, BEACON, DIAGNOSTICS, PORTAL, PORTAL_CONSOLE, PORTAL_FUSE

PLAYER_RADIUS = .43
DOOR_ANGLE = -1.25

DESKS = [(-28, -18), (27, -18), (28, 18), (-26, 21), (-30, 10)]
CHAIRS = [(x - (1 if z == -18 and x == -28 else 0), z + (-2.2 if z == 18 else 2.2))
          for x, z in DESKS]
TURBINES = [(-3, -12), (3, 1), (-3, 11)]
ARCHIVE_RACKS = [(x, z) for x in (-33, -26, -18) for z in (-20, -10)]
TANKS = [(x, -22) for x in (17, 23, 30)]
PLANTERS = [(-34, 23), (34, -24), (32, 9)]
DRESSING = dict(
    crates=[(9.2, 15.4, .35), (-9.1, -16.6, -.25), (8.7, -19.6, .2)],
    barrels=[(20, -21.15), (26.2, -21.15), (-16.4, 16.2)],
    reel_stands=[(-33.5, 15.4), (33.2, -6.2)],
    signs=[(6.5, 8.4, .45), (-6.3, -8.6, -.35)],
    extinguishers=[(-10.15, -23.4, .35), (10.15, 23.3, 2.7), (-10.2, 5.6, -.15), (10.15, -7.4, 2.9)],
    plants=[(33.1, 20.2), (-33.2, -23.4)],
    room_plants=[
        (-34.5, -25.0),
        (28.2, -25.2),
        (18.0, 24.6),
        (-34.0, 19.0),
        (-6.2, -23.5),
        (14.5, 22.5),
    ],
    paintings=[
        (-24, -26.2, 0.0, 'archive'),
        (24, -26.2, 0.0, 'turbine'),
        (22, 26.2, 3.14159265, 'dispatch'),
        (-22, 26.2, 3.14159265, 'workshop'),
        (8, -26.2, 0.0, 'hall'),
        (-11.55, -4, 1.5707963, 'hall_west'),
        (11.55, -4, -1.5707963, 'hall_east'),
    ],
)
LAYOUT = dict(desks=DESKS, chairs=CHAIRS, turbines=TURBINES, racks=ARCHIVE_RACKS,
              tanks=TANKS, planters=PLANTERS, dressing=DRESSING)


def rectangle(name, x, z, width, depth, top, *, bottom=0, yaw=0):
    return dict(name=name, x=x, z=z, width=width, depth=depth, top=top, bottom=bottom, yaw=yaw)


def circle(name, x, z, radius, top, *, bottom=0):
    return dict(name=name, x=x, z=z, radius=radius, top=top, bottom=bottom)


def station_solids(walls, stage, safe_open, sergey=True):
    # The layout also carries a few legacy map footprints used to place models.
    # Round machines and freestanding furniture use the sizes of their models here.
    props = {*DESKS, *TURBINES, *ARCHIVE_RACKS, (-28, -5)}
    solids = []
    for x, z, width, depth in walls:
        if (x, z) in props:
            continue
        if (x, z, width, depth) == (-25, 0, 6, 8):
            solids.append(rectangle('flood', x, z, width, depth, 1.19))
        elif width == 1 and depth >= 7:
            solids.append(rectangle('rack', x, z, 1.06, depth + .07, 2.48))
        else:
            solids.append(rectangle('wall', x, z, width, depth, 3.81))
    for x, z in TURBINES:
        solids.append(circle('turbine-base', x, z, 2.54 if stage == 2 else 2.48, .67))
        solids.append(circle('turbine-housing', x, z, 2.23 if stage == 2 else 2.07, 4.63 if stage == 2 else 3.83))
        solids.append(rectangle('turbine-display', x, z + (2.15 if stage == 2 else 1.94),
                                1.9 if stage == 2 else 1.48, .23, 2.26, bottom=.83))
        if stage != 2:
            solids.append(circle('turbine-shaft', x, z, .72, 7.16, bottom=3.74))
    for x, z in [*DESKS, (-28, -5)]:
        solids.append(rectangle('bench', x, z, 3, 1.42, .99))
        if stage != 0:
            solids.append(rectangle('monitor', x + .86, z - .27, .86, .24, 1.58, bottom=.98))
    for x, z in CHAIRS:
        solids.append(rectangle('chair', x, z, .57, .65, 1.04))
    for x, z in ARCHIVE_RACKS:
        depth = 3.44 if z == -10 and x < -25 else 4.2
        solids.append(rectangle('archive-rack', x, z, .85, depth, 2.44))
    for x, z in TANKS:
        solids.append(circle('tank', x, z, .88, 3.07))
        solids.append(circle('tank-pipe', x, z + 3.3, .26, 3.61))
    for x, z, yaw in DRESSING['crates']:
        solids.append(rectangle('storage-crates', x, z, .72, .56, .81, yaw=yaw))
    for x, z in DRESSING['barrels']:
        solids.append(circle('barrel', x, z, .345, .68))
    for x, z in DRESSING['reel_stands']:
        solids.append(rectangle('reel-stand', x, z, .75, .65, .52))
    for x, z, yaw in DRESSING['signs']:
        solids.append(rectangle('floor-sign', x, z, .46, .20, .69, yaw=yaw))
    for x, z, _ in DRESSING['extinguishers']:
        solids.append(circle('extinguisher', x, z, .15, .98))
    if stage != 2:
        for x, z in DRESSING['plants']:
            solids.append(circle('planter', x, z, .48, .62))
    for x, z in DRESSING['room_plants']:
        solids.append(circle('planter', x, z, .48, .62))
    for x, z, yaw, _slot in DRESSING['paintings']:
        solids.append(rectangle('painting', x, z, 1.35, .1, 2.05, bottom=1.05, yaw=yaw))
    for x in (-10.8, 10.8):
        for z in range(-24, 25, 12):
            solids.append(rectangle('column', x, z, .7, .7, 8.45))
        for z in (-14, 10):
            side = -12 if x < 0 else 12
            solids.append(rectangle('lintel', side, z, .7, 8, 3.975, bottom=3.325))
    for x in (-24, 24):
        solids.append(rectangle('ceiling', x, 0, 24, 54, 4.24, bottom=4))
    solids.append(rectangle('west-lintel', -25, 0, 6, .7, 3.925, bottom=3.275))
    if sergey:
        solids.append(circle('sergey', *NPC, .47, 1.83))
    for side in (-1,1):
        solids.append(rectangle('portal-column', PORTAL[0]+side*1.55, PORTAL[1], .46, .75, 3.8))
    solids.append(rectangle('portal-console', *PORTAL_CONSOLE, .7, .56, 1.25))
    if stage == 1:
        solids.append(rectangle('fuse-case', *PORTAL_FUSE, .65, .45, .59))
        solids.append(rectangle('pass-stand', 3, 25, .78, .71, .98))

    solids.append(rectangle('valve', VALVE[0], VALVE[1] - .09, 2.72, 1.01, 2.53))
    solids.append(rectangle('emergency-console', BEACON[0], BEACON[1] - .055, 1.57, .86, 1.90))
    if stage == 1:
        solids.append(rectangle('safe', *SAFE, 1.65, .93, 2))
        angle = DOOR_ANGLE if safe_open else 0
        solids.append(rectangle('safe-door', SAFE[0] - .75 + cos(angle) * .75,
                                SAFE[1] + .57 - sin(angle) * .75,
                                1.55, .26, 1.96, yaw=angle))
    if stage == 2:
        solids.append(rectangle('diagnostics', *DIAGNOSTICS, .66, .23, 1.39))
        for x, z in PLANTERS:
            solids.append(circle('planter', x, z, .48, .62))
    return solids


def can_stand(x, z, solids):
    if not (BOUNDS[0] + .5 <= x <= BOUNDS[1] - .5 and BOUNDS[2] + .5 <= z <= BOUNDS[3] - .5):
        return False
    for solid in solids:
        if solid['bottom'] >= 1.83:
            continue
        dx, dz = x - solid['x'], z - solid['z']
        if 'radius' in solid:
            if dx * dx + dz * dz < (PLAYER_RADIUS + solid['radius']) ** 2:
                return False
        else:
            c, s = cos(solid['yaw']), sin(solid['yaw'])
            u, v = dx * c - dz * s, dx * s + dz * c
            a = max(0, abs(u) - solid['width'] / 2)
            b = max(0, abs(v) - solid['depth'] / 2)
            if a * a + b * b < PLAYER_RADIUS ** 2:
                return False
    return True


NEARBY = sorted(((x * .25, z * .25) for x in range(-32, 33) for z in range(-32, 33)
                 if x or z), key=lambda offset: offset[0] ** 2 + offset[1] ** 2)


def clear_position(point, solids):
    if can_stand(*point, solids):
        return point[:]
    x, z = point
    for dx, dz in NEARBY:
        candidate = [x + dx, z + dz]
        if can_stand(*candidate, solids):
            return candidate
    return SPAWN[:]
