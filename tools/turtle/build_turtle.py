"""Броньована Черепаха — процедурна low-poly модель, риг і 4 анімації станів (glTF 2.0).

Запуск (Blender 4.x / 5.x):
    blender --background --python tools/turtle/build_turtle.py -- [out.glb ...]

Без аргументів пише public/models/turtle.glb поруч із репозиторієм.
Світ: +Z вгору, Черепаха дивиться вздовж -Y, її ліва сторона = +X, земля Z = 0.
Габарити: від щита до кінчика хвоста 1.4 м, висота з корком колби 1.1 м.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
HEIGHT = 1.1
LENGTH = 1.4
TAU = 2 * math.pi

# ------------------------------------------------------------------------------
# 0. Розміри (метри)
# ------------------------------------------------------------------------------
SHELL_C = Vector((0.0, 0.08, 0.34))
SHELL_R = Vector((0.37, 0.47, 0.30))            # верх панцира z = 0.64
PLASTRON_C = Vector((0.0, 0.08, 0.30))
PLASTRON_R = Vector((0.335, 0.43, 0.11))

FLASK_C = Vector((0.0, 0.08, 0.79))             # куля колби: верх 0.99, корок до 1.10
FLASK_R = 0.20
FLASK_BASE_Z = 0.64

HEAD_C = Vector((0.0, -0.52, 0.50))
HEAD_R = Vector((0.135, 0.165, 0.125))
NECK_A = Vector((0.0, -0.28, 0.36))
NECK_B = Vector((0.0, -0.44, 0.46))
HELMET_R = Vector((0.152, 0.182, 0.142))
HELMET_LAT = 37.0

LIMB_X = 0.28
LIMB_Y = {"arm": -0.24, "leg": 0.36}
HIP_Z = 0.27
FOOT_Z = 0.02
LIMB_L = HIP_Z - FOOT_Z

TAIL_TIP = Vector((0.0, 0.70, 0.25))

# Щит: будується в «канонічних» осях (диск у площині XZ, лице до -Y),
# далі ставиться в позу спокою: збоку-спереду на лівій передній лапі.
SHIELD_R = 0.37
SHIELD_BULGE = 0.045
SHIELD_BACK = 0.02
SHIELD_POS0 = Vector((0.39, -0.36, 0.40))
SHIELD_YAW0 = 60.0
GRIP_LOCAL = Vector((0.10, 0.09, -0.05))        # скоба на звороті щита
BLOCK_POS = Vector((0.0, -0.655, 0.395))        # лице щита на y = -0.70


def shield_frame(pos, yaw=0.0, pitch=0.0, roll=0.0):
    """Матриця щита: yaw 0 = лицем уперед (-Y), +yaw = ліворуч, pitch -90 = лицем угору."""
    r = (Matrix.Rotation(math.radians(yaw), 4, "Z")
         @ Matrix.Rotation(math.radians(pitch), 4, "X")
         @ Matrix.Rotation(math.radians(roll), 4, "Y"))
    return Matrix.Translation(pos) @ r


SHIELD_F0 = shield_frame(SHIELD_POS0, SHIELD_YAW0)


# ------------------------------------------------------------------------------
# 1. Матеріали
# ------------------------------------------------------------------------------
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (a,)


def set_input(bsdf, names, value):
    for n in names:
        sock = bsdf.inputs.get(n)
        if sock is None:
            continue
        try:
            sock.default_value = value
            return True
        except (TypeError, ValueError):
            continue
    return False


def make_mat(name, base, rough, metallic=0.0, emission=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    set_input(b, ["Base Color"], hex_rgba(base))
    set_input(b, ["Roughness"], rough)
    set_input(b, ["Metallic"], metallic)
    if emission:
        set_input(b, ["Emission Color", "Emission"], hex_rgba(emission))
        set_input(b, ["Emission Strength"], strength)
    if alpha < 1.0:
        set_input(b, ["Alpha"], alpha)
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"      # Blender 4.2+
        elif hasattr(m, "blend_method"):
            m.blend_method = "BLEND"                 # Alpha Blend
    m.diffuse_color = hex_rgba(base, alpha)
    return m


def create_materials():
    return {
        # п'ять матеріалів із ТЗ
        "skin": make_mat("MAT_Turtle_Skin", "#7D8A54", 0.80),
        "shell": make_mat("MAT_Shell_Dark", "#384D36", 0.65),
        "iron": make_mat("MAT_Shield_Iron", "#6E7782", 0.32, metallic=0.85),
        "glass": make_mat("MAT_Potion_Glass", "#E6D9FF", 0.10, alpha=0.35),
        "liquid": make_mat("MAT_Potion_Liquid", "#9D3BFF", 0.35, emission="#9D3BFF", strength=2.8),
        # допоміжні деталі з опису
        "helmet": make_mat("MAT_Helmet_Iron", "#5A626B", 0.38, metallic=0.85),
        "cork": make_mat("MAT_Cork", "#7A5230", 0.90),
        "rim": make_mat("MAT_Shell_Rim", "#2A3A29", 0.70),
        "plastron": make_mat("MAT_Plastron", "#C9B46E", 0.80),
        "ivy": make_mat("MAT_Ivy_Purple", "#8A3FD1", 0.45, emission="#8A3FD1", strength=0.5),
        "claw": make_mat("MAT_Claw", "#E8DFC0", 0.55),
        "eye": make_mat("MAT_Eye_White", "#F4F1E4", 0.30),
        "dark": make_mat("MAT_Eye_Dark", "#14160F", 0.40),
    }


# ------------------------------------------------------------------------------
# 2. Геометричні примітиви (кожен повертає (verts, faces))
# ------------------------------------------------------------------------------
def add_loft(bm, rings, pole0, pole1):
    """Замкнена оболонка: кільця вершин + два полюси."""
    n = len(rings[0])
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    v0, v1 = bm.verts.new(pole0), bm.verts.new(pole1)
    faces = []
    for j in range(len(vr) - 1):
        a, b = vr[j], vr[j + 1]
        for i in range(n):
            k = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[k], b[k], b[i])))
    for i in range(n):
        k = (i + 1) % n
        faces.append(bm.faces.new((v0, vr[0][k], vr[0][i])))
        faces.append(bm.faces.new((v1, vr[-1][i], vr[-1][k])))
    return [v for ring in vr for v in ring] + [v0, v1], faces


def add_ellipsoid(bm, center, radii, segs, rings, rot=None, shape=None, lat0=-90.0, lat1=90.0):
    """UV-еліпсоїд (або його зріз між широтами lat0..lat1) з полюсами вздовж локальної Z."""
    rot = rot or Matrix.Identity(3)

    def pt(lx, ly, lz):
        p = Vector((lx, ly, lz))
        if shape:
            p = shape(p)
        return center + rot @ p

    out = []
    for j in range(rings + 1):
        phi = math.radians(lat0 + (lat1 - lat0) * j / rings)
        if abs(phi) > math.pi / 2 - 1e-6:
            continue
        c, s = math.cos(phi), math.sin(phi)
        out.append([
            pt(radii.x * c * math.sin(TAU * i / segs), -radii.y * c * math.cos(TAU * i / segs), radii.z * s)
            for i in range(segs)
        ])
    return add_loft(bm, out,
                    pt(0, 0, radii.z * math.sin(math.radians(lat0))),
                    pt(0, 0, radii.z * math.sin(math.radians(lat1))))


def add_torus(bm, center, ra, rb, tr, tz, segs, prof, rot=None):
    """Тор у локальній площині XY (вісь — локальна Z): півосі ra/rb, переріз tr x tz."""
    rot = rot or Matrix.Identity(3)
    vr = []
    for j in range(prof):
        u = TAU * j / prof
        vr.append([
            bm.verts.new(center + rot @ Vector(((ra + tr * math.cos(u)) * math.sin(TAU * i / segs),
                                                -(rb + tr * math.cos(u)) * math.cos(TAU * i / segs),
                                                tz * math.sin(u))))
            for i in range(segs)
        ])
    faces = []
    for j in range(prof):
        a, b = vr[j], vr[(j + 1) % prof]
        for i in range(segs):
            k = (i + 1) % segs
            faces.append(bm.faces.new((a[i], a[k], b[k], b[i])))
    return [v for ring in vr for v in ring], faces


def add_tube(bm, stations, segs, ref, pole0, pole1):
    """Труба вздовж станцій [(точка, радіус)]."""
    rings = []
    for j, (p, r) in enumerate(stations):
        a = stations[max(j - 1, 0)][0]
        b = stations[min(j + 1, len(stations) - 1)][0]
        t = (b - a).normalized()
        u = (ref - ref.dot(t) * t).normalized()
        v = t.cross(u)
        rings.append([p + r * (math.cos(TAU * i / segs) * u + math.sin(TAU * i / segs) * v) for i in range(segs)])
    return add_loft(bm, rings, pole0, pole1)


def add_prism(bm, outline, y_front, y_back, center):
    """Плаский витиснутий контур у площині XZ (для емблеми плюща)."""
    fr = [bm.verts.new((x, y_front, z)) for x, z in outline]
    bk = [bm.verts.new((x, y_back, z)) for x, z in outline]
    cf = bm.verts.new((center[0], y_front - 0.004, center[1]))
    cb = bm.verts.new((center[0], y_back, center[1]))
    faces = []
    n = len(outline)
    for i in range(n):
        k = (i + 1) % n
        faces.append(bm.faces.new((cf, fr[i], fr[k])))
        faces.append(bm.faces.new((cb, bk[k], bk[i])))
        faces.append(bm.faces.new((fr[i], bk[i], bk[k], fr[k])))
    return fr + bk + [cf, cb], faces


def facing(normal, up=Vector((0, 0, 1))):
    """Матриця 3x3: локальна Z уздовж normal, локальна Y — «вгору»."""
    z = normal.normalized()
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed()


FRONT = facing(Vector((0, -1, 0)))      # локальні (x, y, z) -> (X, Z, -Y)


def merge(*parts):
    verts, faces = [], []
    for v, f in parts:
        verts += v
        faces += f
    return verts, faces


def surface(c, r, x, z):
    """Точка й нормаль на передній (-Y) поверхні еліпсоїда."""
    k = 1 - ((x - c.x) / r.x) ** 2 - ((z - c.z) / r.z) ** 2
    y = c.y - r.y * math.sqrt(max(k, 0.0))
    p = Vector((x, y, z))
    n = Vector(((x - c.x) / r.x ** 2, (y - c.y) / r.y ** 2, (z - c.z) / r.z ** 2)).normalized()
    return p, n


# ------------------------------------------------------------------------------
# 3. Частини тіла
# ------------------------------------------------------------------------------
def build_shell(bm):
    def flat_bottom(p):
        if p.z < 0:
            p.z *= 0.3
        return p
    return add_ellipsoid(bm, SHELL_C, SHELL_R, 24, 12, shape=flat_bottom)


def build_plastron(bm):
    return add_ellipsoid(bm, PLASTRON_C, PLASTRON_R, 24, 8)


def build_shell_rim(bm):
    return add_torus(bm, SHELL_C - Vector((0, 0, 0.005)), SHELL_R.x, SHELL_R.y, 0.030, 0.028, 24, 5)


def build_scutes(bm):
    """Шестикутні щитки панцира: 6 довкола колби + 10 по краю."""
    out = []
    for lat, count, lon0, rad in ((52.0, 6, 30.0, 0.100), (20.0, 10, 18.0, 0.092)):
        for k in range(count):
            lon = math.radians(lon0 + 360.0 * k / count)
            c, s = math.cos(math.radians(lat)), math.sin(math.radians(lat))
            d = Vector((c * math.sin(lon), -c * math.cos(lon), s))
            p = SHELL_C + Vector((SHELL_R.x * d.x, SHELL_R.y * d.y, SHELL_R.z * d.z))
            n = Vector((d.x / SHELL_R.x, d.y / SHELL_R.y, d.z / SHELL_R.z)).normalized()
            out.append(add_ellipsoid(bm, p, Vector((rad, rad, 0.022)), 6, 3, rot=facing(n)))
    return merge(*out)


def build_flask_collar(bm):
    """Шкіряне кільце, що тримає колбу на панцирі (лишається після розбиття)."""
    return add_torus(bm, Vector((FLASK_C.x, FLASK_C.y, FLASK_BASE_Z + 0.012)), 0.152, 0.152, 0.030, 0.026, 18, 6)


def build_tail(bm):
    st = [(Vector((0, 0.48, 0.31)), 0.055), (Vector((0, 0.56, 0.295)), 0.048),
          (Vector((0, 0.63, 0.272)), 0.034), (Vector((0, 0.675, 0.257)), 0.018)]
    return add_tube(bm, st, 8, Vector((1, 0, 0)), Vector((0, 0.46, 0.31)), TAIL_TIP)


def build_neck(bm):
    st = [(Vector((0, -0.20, 0.325)), 0.098), (Vector((0, -0.29, 0.365)), 0.092),
          (Vector((0, -0.37, 0.415)), 0.086), (Vector((0, -0.44, 0.460)), 0.084),
          (Vector((0, -0.50, 0.490)), 0.080)]
    return add_tube(bm, st, 12, Vector((1, 0, 0)), Vector((0, -0.17, 0.31)), Vector((0, -0.53, 0.50)))


def build_head(bm):
    return add_ellipsoid(bm, HEAD_C, HEAD_R, 18, 10)


EYE_X, EYE_DZ = 0.075, 0.030


def eye_frame(s):
    return surface(HEAD_C, HEAD_R, s * EYE_X, HEAD_C.z + EYE_DZ)


def build_eyes(layer):
    def f(bm):
        out = []
        for s in (1, -1):
            p, n = eye_frame(s)
            rot = facing(n)
            if layer == "white":
                out.append(add_ellipsoid(bm, p - n * 0.003, Vector((0.034, 0.036, 0.013)), 12, 4, rot=rot))
            elif layer == "pupil":
                c = p + n * 0.006 - rot.col[0] * (s * 0.007) - rot.col[1] * 0.004
                out.append(add_ellipsoid(bm, c, Vector((0.016, 0.020, 0.008)), 8, 4, rot=rot))
            else:   # насуплена брова: внутрішній край нижче
                tilt = Matrix.Rotation(math.radians(s * 22.0), 3, "Z")
                c = p + rot.col[1] * 0.036 + n * 0.006
                out.append(add_ellipsoid(bm, c, Vector((0.052, 0.015, 0.018)), 10, 4, rot=rot @ tilt))
        return merge(*out)
    return f


def build_mouth(bm):
    st = []
    for j in range(9):
        x = -0.072 + 0.144 * j / 8
        z = HEAD_C.z - 0.052 - 0.020 * (x / 0.072) ** 2          # куточки вниз — сердита
        p, n = surface(HEAD_C, HEAD_R, x, z)
        st.append((p + n * 0.001, 0.0065))
    d0 = (st[0][0] - st[1][0]).normalized() * 0.005
    d1 = (st[-1][0] - st[-2][0]).normalized() * 0.005
    return add_tube(bm, st, 5, Vector((0, -1, 0)), st[0][0] + d0, st[-1][0] + d1)


def build_helmet(bm):
    zr = HELMET_R.z * math.sin(math.radians(HELMET_LAT))
    k = math.cos(math.radians(HELMET_LAT))
    return merge(
        add_ellipsoid(bm, HEAD_C, HELMET_R, 16, 5, lat0=HELMET_LAT, lat1=90.0),
        add_torus(bm, HEAD_C + Vector((0, 0, zr)), HELMET_R.x * k + 0.004, HELMET_R.y * k + 0.004,
                  0.013, 0.011, 16, 6),
        add_ellipsoid(bm, HEAD_C + Vector((0, 0, HELMET_R.z + 0.004)), Vector((0.022, 0.022, 0.020)), 8, 4),
    )


def limb_xy(name):
    kind, side = name.split(".")
    return (LIMB_X if side == "L" else -LIMB_X), LIMB_Y[kind]


def build_limb(name):
    def f(bm):
        x, y = limb_xy(name)
        st = [(Vector((x, y, z)), r) for z, r in
              ((0.310, 0.070), (0.220, 0.080), (0.120, 0.084), (0.045, 0.094), (0.012, 0.094))]
        return add_tube(bm, st, 10, Vector((0, -1, 0)), Vector((x, y, 0.33)), Vector((x, y, 0.0)))
    return f


def build_claws(name):
    def f(bm):
        x, y = limb_xy(name)
        out = []
        for a in (-32, 0, 32):
            c = Vector((x + 0.086 * math.sin(math.radians(a)), y - 0.086 * math.cos(math.radians(a)), 0.022))
            out.append(add_ellipsoid(bm, c, Vector((0.022, 0.030, 0.022)), 6, 3))
        return merge(*out)
    return f


# --- колба ---------------------------------------------------------------------
def build_flask_glass(bm):
    c = FLASK_C
    neck = [(Vector((c.x, c.y, z)), r) for z, r in ((0.965, 0.058), (1.000, 0.054), (1.045, 0.056))]
    return merge(
        add_ellipsoid(bm, c, Vector((FLASK_R, FLASK_R, FLASK_R)), 20, 10),
        add_tube(bm, neck, 12, Vector((0, -1, 0)), Vector((c.x, c.y, 0.955)), Vector((c.x, c.y, 1.047))),
        add_torus(bm, Vector((c.x, c.y, 1.045)), 0.058, 0.058, 0.012, 0.010, 12, 5),
    )


def build_flask_liquid(bm):
    c = FLASK_C
    r = FLASK_R * 0.90
    out = [add_ellipsoid(bm, c, Vector((r, r, r)), 16, 7, lat0=-90.0, lat1=24.0)]
    for dx, dy, dz, br in ((0.06, -0.03, 0.105, 0.026), (-0.05, 0.04, 0.125, 0.020),
                           (0.00, 0.07, 0.100, 0.016), (-0.02, -0.06, 0.140, 0.014)):
        out.append(add_ellipsoid(bm, c + Vector((dx, dy, dz)), Vector((br, br, br)), 6, 4))
    return merge(*out)


def build_cork(bm):
    c = FLASK_C
    st = [(Vector((c.x, c.y, z)), r) for z, r in ((1.020, 0.047), (1.060, 0.054), (1.092, 0.060), (HEIGHT, 0.056))]
    return add_tube(bm, st, 12, Vector((0, -1, 0)), Vector((c.x, c.y, 1.015)), Vector((c.x, c.y, HEIGHT)))


# --- щит (канонічні осі: лице до -Y) ----------------------------------------------
def cap_y(r):
    return -SHIELD_BULGE * (1 - (r / SHIELD_R) ** 2)


def build_shield_plate(bm):
    segs = 28
    spec = [(0.5 * SHIELD_R, SHIELD_BACK), (SHIELD_R, SHIELD_BACK), (SHIELD_R, 0.0)]
    spec += [(k * SHIELD_R, cap_y(k * SHIELD_R)) for k in (0.86, 0.62, 0.34)]
    rings = [[Vector((r * math.sin(TAU * i / segs), y, r * math.cos(TAU * i / segs))) for i in range(segs)]
             for r, y in spec]
    return add_loft(bm, rings, Vector((0, SHIELD_BACK, 0)), Vector((0, -SHIELD_BULGE, 0)))


def build_shield_rim(bm):
    return add_torus(bm, Vector((0, 0.006, 0)), SHIELD_R, SHIELD_R, 0.020, 0.022, 28, 5, rot=FRONT)


def build_shield_rivets(bm):
    out = []
    rr = 0.305
    for k in range(10):
        a = TAU * (k + 0.5) / 10
        c = Vector((rr * math.sin(a), cap_y(rr) - 0.002, rr * math.cos(a)))
        out.append(add_ellipsoid(bm, c, Vector((0.021, 0.021, 0.013)), 6, 4, rot=FRONT))
    return merge(*out)


def build_shield_bracket(bm):
    """Скоба на звороті: за неї щит тримає ліва передня лапа."""
    g = GRIP_LOCAL
    out = []
    for dz in (-0.07, 0.07):
        st = [(Vector((g.x, SHIELD_BACK - 0.005, g.z + dz)), 0.016), (Vector((g.x, g.y, g.z + dz)), 0.016)]
        out.append(add_tube(bm, st, 6, Vector((0, 0, 1)), st[0][0] - Vector((0, 0.004, 0)),
                            st[1][0] + Vector((0, 0.008, 0))))
    st = [(Vector((g.x, g.y, g.z - 0.085)), 0.017), (Vector((g.x, g.y, g.z + 0.085)), 0.017)]
    out.append(add_tube(bm, st, 6, Vector((1, 0, 0)), st[0][0] - Vector((0, 0, 0.008)),
                        st[1][0] + Vector((0, 0, 0.008))))
    return merge(*out)


IVY_OUTLINE = [(0.000, 0.165), (0.034, 0.085), (0.060, 0.050), (0.135, 0.045), (0.105, -0.010),
               (0.100, -0.065), (0.045, -0.090), (0.000, -0.062),
               (-0.045, -0.090), (-0.100, -0.065), (-0.105, -0.010), (-0.135, 0.045), (-0.060, 0.050),
               (-0.034, 0.085)]


def build_shield_ivy(bm):
    stem = [(Vector((0.000, -0.046, -0.060)), 0.010), (Vector((0.008, -0.043, -0.120)), 0.009),
            (Vector((0.030, -0.036, -0.170)), 0.007)]
    return merge(
        add_prism(bm, IVY_OUTLINE, -0.053, -0.030, (0.0, 0.012)),
        add_tube(bm, stem, 5, Vector((1, 0, 0)), stem[0][0] + Vector((0, 0, 0.006)),
                 stem[-1][0] + Vector((0.004, 0, -0.008))),
    )


# ------------------------------------------------------------------------------
# 4. Ваги та збирання мешів
# ------------------------------------------------------------------------------
def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def bone_w(name):
    return lambda co: {name: 1.0}


def w_neck(co):
    """Шия: плавний перехід панцир -> шия -> голова вздовж осі шиї."""
    pts = [NECK_A, NECK_B, HEAD_C]
    best, best_t, cum = 1e9, 0.0, 0.0
    for i in range(2):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        u = (co - a).dot(ab) / ab.length_squared
        uc = min(max(u, -1.0 if i == 0 else 0.0), 1.0)
        d = (co - (a + ab * uc)).length
        if d < best:
            best, best_t = d, cum + uc * ab.length
        cum += ab.length
    l1 = (NECK_B - NECK_A).length
    s1 = smoothstep((best_t + 0.02) / 0.08)
    s2 = smoothstep((best_t - (l1 - 0.04)) / 0.08)
    return {"shell_main": 1 - s1, "neck": s1 * (1 - s2), "head": s2}


BODY_PARTS = [
    ("shell", build_shell, "shell", bone_w("shell_main")),
    ("scutes", build_scutes, "shell", bone_w("shell_main")),
    ("shell_rim", build_shell_rim, "rim", bone_w("shell_main")),
    ("plastron", build_plastron, "plastron", bone_w("shell_main")),
    ("flask_collar", build_flask_collar, "cork", bone_w("shell_main")),
    ("tail", build_tail, "skin", bone_w("shell_main")),
    ("neck", build_neck, "skin", w_neck),
    ("head", build_head, "skin", bone_w("head")),
    ("brows", build_eyes("brow"), "skin", bone_w("head")),
    ("eye_whites", build_eyes("white"), "eye", bone_w("head")),
    ("pupils", build_eyes("pupil"), "dark", bone_w("head")),
    ("mouth", build_mouth, "dark", bone_w("head")),
    ("helmet", build_helmet, "helmet", bone_w("head")),
]
for _limb in ("arm.L", "arm.R", "leg.L", "leg.R"):
    BODY_PARTS.append((_limb, build_limb(_limb), "skin", bone_w(_limb)))
    BODY_PARTS.append(("claws_" + _limb, build_claws(_limb), "claw", bone_w(_limb)))

SHIELD_PARTS = [
    ("plate", build_shield_plate, "iron", bone_w("shield_socket")),
    ("rim", build_shield_rim, "helmet", bone_w("shield_socket")),
    ("rivets", build_shield_rivets, "helmet", bone_w("shield_socket")),
    ("bracket", build_shield_bracket, "helmet", bone_w("shield_socket")),
    ("ivy", build_shield_ivy, "ivy", bone_w("shield_socket")),
]

FLASK_PARTS = [
    ("liquid", build_flask_liquid, "liquid", bone_w("potion_flask")),
    ("cork", build_cork, "cork", bone_w("potion_flask")),
    ("glass", build_flask_glass, "glass", bone_w("potion_flask")),
]


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for b in list(coll):
            coll.remove(b)


def build_object(name, parts, mats, col, xform=None):
    bm = bmesh.new()
    weights, keys = {}, []
    for _pname, builder, mat, wfn in parts:
        verts, faces = builder(bm)
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        if mat not in keys:
            keys.append(mat)
        for f in faces:
            f.material_index = keys.index(mat)
            f.smooth = True
        for v in verts:
            weights[v] = wfn(v.co)
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(40):
            e.smooth = False
    if xform is not None:
        bmesh.ops.transform(bm, matrix=xform, verts=bm.verts[:])
    bm.verts.index_update()
    index_w = {v.index: w for v, w in weights.items()}
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for k in keys:
        me.materials.append(mats[k])
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    groups = {}
    for idx, ws in index_w.items():
        total = sum(ws.values())
        for b, w in ws.items():
            if w / total < 0.004:
                continue
            g = groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=b))
            g.add([idx], w / total, "REPLACE")
    return ob


# ------------------------------------------------------------------------------
# 5. Скелет
#    root -> pelvis -> shell_main -> neck -> head
#                   |             -> potion_flask
#                   -> arm.L -> shield_socket,  arm.R,  leg.L,  leg.R
#    Лапи висять на pelvis, а не на shell_main: панцир із колбою гойдається,
#    а стопи лишаються на землі.
# ------------------------------------------------------------------------------
def bone_table():
    grip = SHIELD_F0 @ Vector((0.0, SHIELD_BACK, 0.0))
    normal = SHIELD_F0.to_3x3() @ Vector((0, -1, 0))
    t = [
        ("root", Vector((0, 0, 0)), Vector((0, 0.2, 0)), None, False),
        ("pelvis", Vector((0, 0.08, 0.22)), Vector((0, 0.08, 0.30)), "root", False),
        ("shell_main", Vector((0, 0.08, 0.30)), Vector((0, 0.08, 0.60)), "pelvis", True),
        ("neck", NECK_A, NECK_B, "shell_main", False),
        ("head", NECK_B, Vector((0, -0.64, 0.52)), "neck", True),
        ("potion_flask", Vector((0, 0.08, FLASK_BASE_Z)), Vector((0, 0.08, 0.95)), "shell_main", False),
    ]
    for name in ("arm.L", "arm.R", "leg.L", "leg.R"):
        x, y = limb_xy(name)
        t.append((name, Vector((x, y, HIP_Z)), Vector((x, y, FOOT_Z)), "pelvis", False))
    t.append(("shield_socket", grip, grip + normal * 0.15, "arm.L", False))
    return t


def build_rig(col):
    arm = bpy.data.armatures.new("RIG_Turtle")
    ob = bpy.data.objects.new("RIG_Turtle", arm)
    col.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connect in bone_table():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = connect
        eb.use_deform = True
        if name == "shield_socket":
            eb.align_roll(Vector((0, 0, 1)))
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def bind(mesh_ob, rig_ob):
    bpy.ops.object.select_all(action="DESELECT")
    for o in (mesh_ob, rig_ob):
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_ob
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)   # Apply All Transforms
    mesh_ob.parent = rig_ob
    mod = mesh_ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig_ob


# ------------------------------------------------------------------------------
# 6. Анімації
#    Кути — в осях арматури: X тангаж (+ = ніс униз, для лап + = стопа назад),
#    Y крен (+ = лівий бік униз), Z рискання (+ = поворот ліворуч).
#    Щит задається світовою позою (позиція + yaw/pitch/roll); скрипт сам рахує
#    локальну трансформацію shield_socket і наводить arm.L на скобу щита.
# ------------------------------------------------------------------------------
def ease(f, keys):
    """Скалярний канал за ключами [(кадр, значення)] з м'яким входом і виходом."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            return v0 + (v1 - v0) * smoothstep((f - f0) / (f1 - f0))
    return keys[-1][1]


class Pose:
    def __init__(self):
        self.rot, self.loc, self.scale, self.aim = {}, {}, {}, {}
        self.shield = (SHIELD_POS0.copy(), SHIELD_YAW0, 0.0, 0.0)

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        o = self.rot.get(bone, (0.0, 0.0, 0.0))
        self.rot[bone] = (o[0] + x, o[1] + y, o[2] + z)

    def limb(self, name, drop=0.0, lift=0.0, swing=0.0, dy=0.0, uniform=False):
        """Лапа: стопа лишається на землі, коли таз опущено на drop і зсунуто на -dy."""
        h = LIMB_L - drop - lift
        a = math.radians(swing) + math.atan2(dy, h)
        s = h / (LIMB_L * math.cos(a))
        self.r(name, math.degrees(a))
        self.scale[name] = (s, s, s) if uniform else (1.0, s, 1.0)

    def hold_shield(self, pos, yaw=0.0, pitch=0.0, roll=0.0):
        self.shield = (Vector(pos), yaw, pitch, roll)

    def grip(self):
        return shield_frame(*self.shield) @ GRIP_LOCAL


FOOT_L = Vector((LIMB_X, LIMB_Y["arm"], FOOT_Z))
ARM_REACH = LIMB_L + 0.09                        # лапа + скоба щита
WALK_LIMBS = (("arm.L", 0.0, 9.0, 0.012), ("leg.R", 0.0, 17.0, 0.036),
              ("arm.R", math.pi, 17.0, 0.036), ("leg.L", math.pi, 17.0, 0.036))


def patrol_walk(f):
    """State1: повільна важка хода; панцир і колба гойдаються з запізненням."""
    ph = TAU * f / 40
    s1 = math.sin(ph)
    p = Pose()
    bob = 0.010 * math.cos(2 * ph) - 0.012
    p.loc["pelvis"] = (0.006 * s1, 0.0, bob)
    p.r("pelvis", 0, 0, 1.5 * s1)
    p.r("shell_main", 2.0 * math.sin(2 * ph + 0.4), 4.5 * s1, 2.0 * math.sin(ph - 0.5))
    p.r("potion_flask", 5.0 * math.sin(2 * ph - 0.6), 8.0 * math.sin(ph - 0.9))
    p.r("neck", 2.0 * math.sin(2 * ph - 0.3), 0, 6.0 * math.sin(ph - 0.3))
    p.r("head", 3.0 * math.sin(2 * ph - 0.8), 2.5 * s1, 9.0 * math.sin(ph - 0.6))
    for name, off, amp, lift in WALK_LIMBS:
        q = ph + off
        p.limb(name, drop=-bob, lift=lift * max(0.0, math.cos(q)) ** 1.5, swing=-amp * math.sin(q),
               uniform=(name == "arm.L"))
    p.hold_shield(SHIELD_POS0 + Vector((0.004 * s1, 0.022 * s1, 0.5 * bob + 0.012 + 0.005 * math.sin(2 * ph - 0.5))),
                  SHIELD_YAW0 + 2.5 * math.sin(ph - 0.4), 1.5 * math.sin(2 * ph), 2.5 * math.sin(ph - 0.7))
    return p


def guard(p, drop, pitch, dy=0.0, retract=0.4):
    """Спільна основа захисної стійки: присід, голова втягнута за щит."""
    p.loc["pelvis"] = (0.0, -dy, -drop)
    p.r("shell_main", pitch)
    p.loc["neck"] = (0.0, 0.30 * retract, -0.10 * retract)
    for name in ("arm.R", "leg.L", "leg.R"):
        p.limb(name, drop=drop, dy=dy)


def shield_block(f):
    """State2: присіла, щит строго перед собою, закриває корпус; колба лишається зверху."""
    ph = TAU * f / 30
    br = math.sin(ph)
    p = Pose()
    guard(p, 0.070 + 0.005 * br, 3.0 + 0.8 * br)
    p.r("neck", 6)
    p.r("head", -8 + 1.5 * br, 0, 4.0 * math.sin(ph))
    p.r("potion_flask", 2.5 * math.sin(ph - 0.8), 2.0 * math.sin(2 * ph))
    p.hold_shield(BLOCK_POS + Vector((0.004 * math.sin(2 * ph), 0.0, -0.002 * br)), 0.0, 1.2 * br,
                  1.0 * math.sin(2 * ph))
    p.aim["arm.L"] = (p.grip(), ARM_REACH)
    return p


def shield_bash(f):
    """State3: короткий замах (0-8), поштовх щитом (8-12), повернення в стійку (до 25)."""
    wind = ease(f, [(0, 0), (7, 1), (9, 1), (12, 0)])
    hit = ease(f, [(8, 0), (12, 1), (15, 1), (25, 0)])
    p = Pose()
    guard(p, 0.070 + 0.025 * wind - 0.015 * hit, 3.0 - 6.0 * wind + 9.0 * hit, dy=-0.04 * wind + 0.11 * hit)
    p.r("neck", 6 - 4 * wind + 8 * hit)
    p.r("head", -8 + 6 * wind - 10 * hit)
    p.r("potion_flask", ease(f, [(0, 0), (7, 9), (12, -16), (17, 8), (21, -3), (25, 0)]))
    p.hold_shield(BLOCK_POS + Vector((0.0, 0.11 * wind - 0.20 * hit, 0.02 * wind + 0.015 * hit)),
                  0.0, -7.0 * wind + 6.0 * hit, 0.0)
    p.aim["arm.L"] = (p.grip(), ARM_REACH)
    return p


def flask_shatter_stun(f):
    """State4: удар зверху — колба провалюється в панцир, щит падає вбік, голова ховається."""
    p = Pose()
    drop = ease(f, [(0, 0.070), (3, 0.125), (9, 0.030), (15, 0.090), (22, 0.075), (45, 0.080)])
    wob = ease(f, [(3, 0), (5, 1), (34, 0)])
    retract = ease(f, [(0, 0.4), (5, 0.0), (11, -0.15), (17, -0.15), (27, 1.0), (45, 1.0)])
    guard(p, drop, ease(f, [(0, 3), (3, 6), (10, -2), (20, 0)]), retract=retract)
    p.r("shell_main", 0, 7.0 * wob * math.sin(TAU * (f - 4) / 12), 2.0 * wob * math.sin(TAU * (f - 4) / 9))
    k = 1.0 - 0.22 * max(retract, 0.0)
    p.scale["neck"] = (k, k, k)

    # голова: спершу розгублено крутиться, потім зникає в панцирі й тремтить
    dizzy = ease(f, [(5, 0), (8, 1), (17, 1), (24, 0)])
    shake = ease(f, [(28, 0), (32, 1), (40, 1), (45, 0)])
    p.r("neck", 6 * (1 - dizzy))
    p.r("head", -8 + 14 * dizzy, 10 * dizzy * math.sin(TAU * (f - 5) / 7 + 1.0),
        16 * dizzy * math.sin(TAU * (f - 5) / 7) + 2.5 * shake * math.sin(TAU * f / 5))

    # колба: тріщить, стискається й провалюється всередину панцира
    crack = ease(f, [(0, 0), (1, 1), (6, 1), (10, 0)])
    p.r("potion_flask", 9 * crack * math.sin(f * 2.4), 11 * crack * math.sin(f * 3.1 + 0.7))
    p.loc["potion_flask"] = (0.0, 0.0, ease(f, [(0, 0), (2, -0.03), (6, -0.05), (16, -0.40), (45, -0.40)]))
    fs = ease(f, [(0, 1.0), (2, 1.10), (6, 0.94), (16, 0.05), (45, 0.05)])
    p.scale["potion_flask"] = (fs, fs, fs)

    # щит: вилітає з лапи ліворуч і падає лицем угору, з одним відскоком
    p.hold_shield(
        (ease(f, [(0, 0.0), (3, 0.02), (15, 0.76), (45, 0.80)]),
         ease(f, [(0, BLOCK_POS.y), (15, -0.40), (45, -0.37)]),
         ease(f, [(0, BLOCK_POS.z), (5, 0.44), (14, 0.035), (17, 0.075), (20, 0.030), (45, 0.030)])),
        ease(f, [(0, 0), (12, 60)]),
        ease(f, [(3, 0), (14, -90), (17, -80), (20, -90), (45, -90)]),
        ease(f, [(3, 0), (9, 14), (14, 0), (17, -5), (20, 0)]))

    # ліва лапа відпускає скобу й стає на землю
    let_go = ease(f, [(2, 0), (12, 1)])
    target = p.grip().lerp(FOOT_L, let_go)
    p.aim["arm.L"] = (target, LIMB_L + (ARM_REACH - LIMB_L) * (1 - let_go))
    return p


CLIPS = [
    ("State1_Patrol_Walk", 40, patrol_walk),
    ("State2_Shield_Block", 30, shield_block),
    ("State3_Shield_Bash", 25, shield_bash),
    ("State4_Flask_Shatter_Stun", 45, flask_shatter_stun),
]

AX_X, AX_Y, AX_Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def solve_pose(pose, order, rest, parent):
    """Пряма кінематика в Python: повертає {кістка: (loc, quat, scale)} у локальних осях кісток."""
    world, out = {}, {}
    for name in order:
        par = parent[name]
        base = (world[par] @ rest[par].inverted() @ rest[name]) if par else rest[name]
        qr = rest[name].to_quaternion()
        if name == "shield_socket":
            want = shield_frame(*pose.shield) @ SHIELD_F0.inverted() @ rest[name]
            loc, q, sc = (base.inverted() @ want).decompose()
        elif name in pose.aim:
            target, reach = pose.aim[name]
            d = target - base.translation
            bq = base.to_quaternion()
            rd = (bq @ AX_Y).rotation_difference(d)
            q = bq.conjugated() @ rd @ bq
            k = min(max(d.length / reach, 0.68), 1.5)
            loc, sc = Vector((0, 0, 0)), Vector((k, k, k))
        else:
            rx, ry, rz = (math.radians(a) for a in pose.rot.get(name, (0.0, 0.0, 0.0)))
            qd = Quaternion(AX_Z, rz) @ Quaternion(AX_X, rx) @ Quaternion(AX_Y, ry)
            q = qr.conjugated() @ qd @ qr
            loc = qr.conjugated() @ Vector(pose.loc.get(name, (0.0, 0.0, 0.0)))
            sc = Vector(pose.scale.get(name, (1.0, 1.0, 1.0)))
        world[name] = base @ Matrix.LocRotScale(loc, q, sc)
        out[name] = (loc, q, sc)
    return out, world


def build_animations(rig):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    order = [b.name for b in rig.data.bones]
    rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
    parent = {b.name: (b.parent.name if b.parent else None) for b in rig.data.bones}
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"

    report = {}
    for clip_name, length, fn in CLIPS:
        action = bpy.data.actions.new(clip_name)
        action.use_fake_user = True
        rig.animation_data.action = action
        last = {}
        for f in range(length + 1):
            pose = fn(f)
            local, world = solve_pose(pose, order, rest, parent)
            report[(clip_name, f)] = (pose, world)
            for name in order:
                loc, q, sc = local[name]
                if name in last and last[name].dot(q) < 0:
                    q.negate()
                last[name] = q.copy()
                pb = rig.pose.bones[name]
                pb.location, pb.rotation_quaternion, pb.scale = loc, q, sc
                pb.keyframe_insert("location", frame=f)
                pb.keyframe_insert("rotation_quaternion", frame=f)
                pb.keyframe_insert("scale", frame=f)
        track = rig.animation_data.nla_tracks.new()
        track.name = clip_name
        strip = track.strips.new(clip_name, 0, action)
        strip.name = clip_name
        rig.animation_data.action = None

    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    scene.frame_start, scene.frame_end = 0, 45
    scene.frame_set(0)
    return report


# ------------------------------------------------------------------------------
# 7. Експорт і самоперевірка
# ------------------------------------------------------------------------------
def export_glb(path):
    wanted = dict(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_range=False,
        export_anim_single_armature=True,
        export_optimize_animation_size=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        use_selection=False,
    )
    known = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    bpy.ops.export_scene.gltf(**{k: v for k, v in wanted.items() if k in known})


def tri_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def check(obs, report):
    """Габарити, бюджет і ключові вимоги станів — падає, якщо щось не так."""
    co = [v.co for ob in obs for v in ob.data.vertices]
    lo = Vector((min(c.x for c in co), min(c.y for c in co), min(c.z for c in co)))
    hi = Vector((max(c.x for c in co), max(c.y for c in co), max(c.z for c in co)))
    tris = sum(tri_count(ob) for ob in obs)
    print("[turtle] bounds x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f" % (lo.x, hi.x, lo.y, hi.y, lo.z, hi.z))
    print("[turtle] tris=%d (%s)" % (tris, ", ".join("%s %d" % (ob.name, tri_count(ob)) for ob in obs)))
    assert abs(hi.z - HEIGHT) < 1e-4 and abs(lo.z) < 1e-4, (lo.z, hi.z)
    assert abs(hi.y - LENGTH / 2) < 1e-4 and -LENGTH / 2 - 1e-3 <= lo.y, (lo.y, hi.y)
    assert 4500 <= tris <= 6500, tris

    pose, _ = report[("State2_Shield_Block", 0)]
    pos, yaw, pitch, _roll = pose.shield
    front = pos.y - SHIELD_BULGE
    assert abs(yaw) < 1e-6 and abs(pos.x) < 0.01 and abs(front + LENGTH / 2) < 1e-3, (pos, yaw)
    print("[turtle] block: shield front y=%.3f, covers x ±%.3f, z %.3f..%.3f" % (
        front, SHIELD_R + 0.02, pos.z - SHIELD_R - 0.02, pos.z + SHIELD_R + 0.02))
    for clip, n in (("State1_Patrol_Walk", 40), ("State2_Shield_Block", 30)):
        a, b = report[(clip, 0)][1], report[(clip, n)][1]
        err = max((a[k].translation - b[k].translation).length for k in a)
        assert err < 1e-6, (clip, err)
    a, b = report[("State3_Shield_Bash", 0)][1], report[("State3_Shield_Bash", 25)][1]
    assert max((a[k].translation - b[k].translation).length for k in a) < 1e-6
    end = report[("State4_Flask_Shatter_Stun", 45)][1]
    print("[turtle] stun end: flask z=%.3f scale=%.2f, shield z=%.3f, head y=%.3f" % (
        end["potion_flask"].translation.z, end["potion_flask"].to_scale().x,
        end["shield_socket"].translation.z, end["head"].translation.y))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if argv:
        outs = [os.path.abspath(a) for a in argv]
    else:
        here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else bpy.path.abspath("//")
        outs = [os.path.abspath(os.path.join(here, "..", "..", "public", "models", "turtle.glb"))]

    clear_scene()
    col = bpy.data.collections.new("COL_Turtle")
    bpy.context.scene.collection.children.link(col)
    mats = create_materials()
    body = build_object("GEO_Turtle", BODY_PARTS, mats, col)
    shield = build_object("GEO_Shield", SHIELD_PARTS, mats, col, xform=SHIELD_F0)
    flask = build_object("GEO_Potion_Flask", FLASK_PARTS, mats, col)
    rig = build_rig(col)
    for ob in (body, shield, flask):
        bind(ob, rig)
    report = build_animations(rig)
    check((body, shield, flask), report)
    print("[turtle] bones=%d: %s" % (len(rig.data.bones), ", ".join(b.name for b in rig.data.bones)))
    for path in outs:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        export_glb(path)
        print("[turtle] exported", path)


if __name__ == "__main__":
    main()
