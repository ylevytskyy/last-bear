"""Софія — процедурна low-poly модель, риг і анімації для Three.js (glTF 2.0).

Запуск (Blender 4.x / 5.x):
    blender --background --python tools/sofia/build_sofia_fable.py -- [out.glb ...]

Без аргументів пише public/models/sofia-fable.glb поруч із репозиторієм.
Світ: +Z вгору, Софія дивиться вздовж -Y, її ліва сторона = +X.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30
HEIGHT = 1.1
PREFIX = "DEF_"

# ------------------------------------------------------------------------------
# 0. Розміри силуету (метри). Права сторона — дзеркало лівої.
# ------------------------------------------------------------------------------
SEGS_BODY = 24

# Тулуб + шия: (z, rx, ry, зсув по y). Голова доточується еліпсоїдом нижче.
BODY_RINGS = [
    (0.205, 0.100, 0.090, 0.000),
    (0.240, 0.156, 0.141, -0.002),
    (0.280, 0.186, 0.169, -0.006),
    (0.325, 0.200, 0.183, -0.010),
    (0.370, 0.200, 0.183, -0.010),
    (0.415, 0.190, 0.172, -0.007),
    (0.460, 0.172, 0.155, -0.003),
    (0.500, 0.150, 0.135, 0.000),
    (0.535, 0.128, 0.115, 0.000),
    (0.558, 0.121, 0.108, 0.000),
]
BODY_BOTTOM = 0.185
HEAD_C = Vector((0.0, 0.0, 0.795))
HEAD_R = Vector((0.295, 0.255, 0.235))
HEAD_LATS = [-65, -55, -44, -33, -22, -11, 0, 11, 22, 33, 44, 55, 66, 78]

EAR_C = Vector((0.215, 0.0, 1.000))
EAR_R = Vector((0.100, 0.052, 0.100))          # верх вуха = рівно 1.100
EAR_IN_C = Vector((0.215, -0.030, 1.000))
EAR_IN_R = Vector((0.064, 0.030, 0.064))

MUZZLE_C = Vector((0.0, -0.215, 0.725))
MUZZLE_R = Vector((0.105, 0.075, 0.075))
NOSE_C = Vector((0.0, -0.284, 0.758))
NOSE_R = Vector((0.036, 0.020, 0.025))
BELLY_C = Vector((0.0, -0.125, 0.365))
BELLY_R = Vector((0.130, 0.082, 0.150))
TAIL_C = Vector((0.0, 0.175, 0.265))
TAIL_R = 0.052

EYE_X, EYE_Z = 0.128, 0.805

# Рука (A-поза, 45° униз): плече, лікоть, зап'ястя, кінчик лапи
ARM_S = Vector((0.150, 0.000, 0.490))
ARM_E = Vector((0.245, -0.004, 0.400))
ARM_W = Vector((0.315, -0.008, 0.332))
ARM_T = Vector((0.352, -0.010, 0.297))
ARM_FAT = 1.14

# Нога: стегно, коліно, щиколотка
LEG_H = Vector((0.105, 0.000, 0.270))
LEG_K = Vector((0.113, -0.012, 0.170))
LEG_A = Vector((0.116, 0.000, 0.075))
LEG_FAT = 1.06
FOOT_C = Vector((0.120, -0.040, 0.052))
FOOT_R = Vector((0.090, 0.125, 0.052))
FOOT_TIP = Vector((0.120, -0.145, 0.020))

# Ланцюжок шарфа (по центру, за спиною)
SCARF_Z = 0.572
SC = [
    Vector((0.0, 0.155, 0.560)),
    Vector((0.0, 0.220, 0.475)),
    Vector((0.0, 0.265, 0.385)),
    Vector((0.0, 0.295, 0.290)),
]

# Висоти суглобів хребта
Z_PELVIS, Z_SP1, Z_SP2, Z_NECK, Z_HEAD = 0.26, 0.34, 0.44, 0.545, 0.585


def mx(v):
    return Vector((-v.x, v.y, v.z))


# ------------------------------------------------------------------------------
# 1. Матеріали
# ------------------------------------------------------------------------------
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)


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


def make_mat(name, base, rough, metallic=0.0, emission=None, strength=0.0, sheen=0.0, sheen_tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    set_input(b, ["Base Color"], hex_rgba(base))
    set_input(b, ["Roughness"], rough)
    set_input(b, ["Metallic"], metallic)
    if emission:
        set_input(b, ["Emission Color", "Emission"], hex_rgba(emission))
        set_input(b, ["Emission Strength"], strength)
    if sheen:
        set_input(b, ["Sheen Weight", "Sheen"], sheen)
        set_input(b, ["Sheen Roughness"], 0.5)
        set_input(b, ["Sheen Tint"], hex_rgba(sheen_tint))
    m.diffuse_color = hex_rgba(base)
    return m


MAT_ORDER = ["fur", "muzzle", "nose", "eye", "pupil", "glint", "scarf"]


def create_materials():
    return {
        "fur": make_mat("MAT_Fur_Black", "#18181D", 0.82, sheen=0.3, sheen_tint="#7B3FE4"),
        "muzzle": make_mat("MAT_Muzzle_Grey", "#2E2E38", 0.80, sheen=0.2, sheen_tint="#7B3FE4"),
        "nose": make_mat("MAT_Nose_Black", "#0A0A0D", 0.18),
        "eye": make_mat("MAT_Eyes_Glow", "#FF1E1E", 0.15, emission="#FF2A2A", strength=3.0),
        "pupil": make_mat("MAT_Eyes_Pupil", "#7A0A12", 0.20, emission="#B01018", strength=1.0),
        "glint": make_mat("MAT_Eyes_Glint", "#FFFFFF", 0.10, emission="#FFFFFF", strength=1.5),
        "scarf": make_mat("MAT_Scarf_Red", "#D92626", 0.78),
        "gold": make_mat("MAT_Key_Gold", "#F2C230", 0.30, metallic=0.85),
        "petal": make_mat("MAT_Key_Petal", "#FF7EB6", 0.55, emission="#FF7EB6", strength=0.35),
    }


# ------------------------------------------------------------------------------
# 2. Геометрія: лофт із кілець
# ------------------------------------------------------------------------------
def add_loft(bm, rings, pole0, pole1):
    """Замкнена оболонка: кільця вершин + два полюси. Повертає (verts, faces)."""
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
    verts = [v for ring in vr for v in ring] + [v0, v1]
    return verts, faces


def add_ellipsoid(bm, center, radii, segs, rings, rot=None, shape=None):
    """UV-еліпсоїд із полюсами вздовж локальної Z; rot — матриця 3x3 орієнтації."""
    rot = rot or Matrix.Identity(3)

    def pt(lx, ly, lz):
        p = Vector((lx, ly, lz))
        if shape:
            p = shape(p)
        return center + rot @ p

    out = []
    for j in range(1, rings):
        phi = -math.pi / 2 + math.pi * j / rings
        c, s = math.cos(phi), math.sin(phi)
        out.append([
            pt(radii.x * c * math.sin(2 * math.pi * i / segs),
               -radii.y * c * math.cos(2 * math.pi * i / segs),
               radii.z * s)
            for i in range(segs)
        ])
    return add_loft(bm, out, pt(0, 0, -radii.z), pt(0, 0, radii.z))


def facing(normal, up=Vector((0, 0, 1))):
    """Матриця, що ставить локальну Z уздовж normal, локальну Y — «вгору»."""
    z = normal.normalized()
    x = up.cross(z).normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed()


def add_tube(bm, stations, segs, ref, pole0, pole1, rect=False):
    """Труба вздовж станцій [(точка, радіус | (півширина, півтовщина))]."""
    rings = []
    for j, (p, r) in enumerate(stations):
        a = stations[max(j - 1, 0)][0]
        b = stations[min(j + 1, len(stations) - 1)][0]
        t = (b - a).normalized()
        u = (ref - ref.dot(t) * t).normalized()
        v = t.cross(u)
        if rect:
            hw, ht = r
            prof = [(-hw, -ht), (0, -ht), (hw, -ht), (hw, ht), (0, ht), (-hw, ht)]
            rings.append([p + u * x + v * y for x, y in prof])
        else:
            rings.append([
                p + r * (math.cos(2 * math.pi * i / segs) * u + math.sin(2 * math.pi * i / segs) * v)
                for i in range(segs)
            ])
    return add_loft(bm, rings, pole0, pole1)


def along(a, b, d):
    return a + (b - a).normalized() * d


def head_surface(x, z):
    """Точка й нормаль на передній поверхні голови."""
    k = 1 - (x / HEAD_R.x) ** 2 - ((z - HEAD_C.z) / HEAD_R.z) ** 2
    y = HEAD_C.y - HEAD_R.y * math.sqrt(max(k, 0.0))
    p = Vector((x, y, z))
    n = Vector((x / HEAD_R.x ** 2, (y - HEAD_C.y) / HEAD_R.y ** 2, (z - HEAD_C.z) / HEAD_R.z ** 2)).normalized()
    return p, n


def eye_frame(side):
    s = 1 if side == "L" else -1
    p, n = head_surface(s * EYE_X, EYE_Z)
    return p - n * 0.004, n


# --- частини, що зливаються булевим об'єднанням в одну шкіру -------------------
def build_body(bm):
    rings = []
    for z, rx, ry, yc in BODY_RINGS:
        rings.append([
            Vector((rx * math.sin(2 * math.pi * i / SEGS_BODY), yc - ry * math.cos(2 * math.pi * i / SEGS_BODY), z))
            for i in range(SEGS_BODY)
        ])
    for lat in HEAD_LATS:
        c, s = math.cos(math.radians(lat)), math.sin(math.radians(lat))
        rings.append([
            Vector((HEAD_R.x * c * math.sin(2 * math.pi * i / SEGS_BODY),
                    HEAD_C.y - HEAD_R.y * c * math.cos(2 * math.pi * i / SEGS_BODY),
                    HEAD_C.z + HEAD_R.z * s))
            for i in range(SEGS_BODY)
        ])
    add_loft(bm, rings, Vector((0, 0, BODY_BOTTOM)), Vector((0, 0, HEAD_C.z + HEAD_R.z)))


def build_arm(side):
    def f(bm):
        m = (lambda v: v) if side == "L" else mx
        S, E, W, T = ARM_S, ARM_E, ARM_W, ARM_T
        st = [
            (along(S, E, -0.060), 0.058),
            (along(S, E, -0.020), 0.064),
            (S, 0.066),
            (along(S, E, 0.028), 0.066),
            (along(S, E, 0.062), 0.064),
            (along(S, E, 0.100), 0.062),
            (along(E, S, 0.024), 0.061),
            (E, 0.061),
            (along(E, W, 0.024), 0.060),
            (along(E, W, 0.060), 0.058),
            (along(W, E, 0.020), 0.058),
            (W, 0.059),
            (along(W, T, 0.020), 0.064),
            (along(W, T, 0.045), 0.066),
        ]
        d = (T - W).normalized()
        base, r = st[-1]
        for a in (30, 58, 78):
            st.append((base + d * r * math.sin(math.radians(a)), r * math.cos(math.radians(a))))
        tip = base + d * r * ARM_FAT
        st = [(m(p), rr * ARM_FAT) for p, rr in st]
        add_tube(bm, st, 12, Vector((0, -1, 0)), m(along(S, E, -0.075)), m(tip))
    return f


def build_leg(side):
    def f(bm):
        m = (lambda v: v) if side == "L" else mx
        H, K, A = LEG_H, LEG_K, LEG_A
        st = [
            (along(H, K, -0.040), 0.080),
            (H, 0.088),
            (along(H, K, 0.030), 0.089),
            (along(H, K, 0.060), 0.088),
            (along(K, H, 0.026), 0.086),
            (K, 0.085),
            (along(K, A, 0.026), 0.084),
            (along(K, A, 0.058), 0.081),
            (along(A, K, 0.022), 0.079),
            (A, 0.078),
            (along(A, K, -0.025), 0.074),
        ]
        st = [(m(p), r * LEG_FAT) for p, r in st]
        add_tube(bm, st, 14, Vector((0, -1, 0)), m(along(H, K, -0.060)), m(along(A, K, -0.045)))
    return f


def build_foot(side):
    def f(bm):
        c = FOOT_C if side == "L" else mx(FOOT_C)

        def flat_sole(p):
            if p.z < 0:
                t = -p.z / FOOT_R.z
                p.z = -FOOT_R.z * (1 - (1 - t) ** 2.6)
            return p
        add_ellipsoid(bm, c, FOOT_R, 14, 10, shape=flat_sole)
    return f


def build_ear(side, inner):
    def f(bm):
        c, r = (EAR_IN_C, EAR_IN_R) if inner else (EAR_C, EAR_R)
        if side == "R":
            c = mx(c)
        if inner:
            add_ellipsoid(bm, c, Vector((r.x, r.z, r.y)), 12, 6, rot=facing(Vector((0, -1, 0))))
        else:
            add_ellipsoid(bm, c, r, 14, 10)
    return f


def build_muzzle(bm):
    add_ellipsoid(bm, MUZZLE_C, Vector((MUZZLE_R.x, MUZZLE_R.z, MUZZLE_R.y)), 16, 10, rot=facing(Vector((0, -1, 0))))


def build_belly(bm):
    add_ellipsoid(bm, BELLY_C, Vector((BELLY_R.x, BELLY_R.z, BELLY_R.y)), 18, 10, rot=facing(Vector((0, -1, 0))))


def build_tail(bm):
    add_ellipsoid(bm, TAIL_C, Vector((TAIL_R, TAIL_R, TAIL_R)), 10, 8)


# --- окремі острівці (очі, ніс, усмішка, шарф) ---------------------------------
def build_eye(side, layer):
    def f(bm):
        s = 1 if side == "L" else -1
        c, n = eye_frame(side)
        rot = facing(n)
        up, out = rot.col[1], rot.col[0]
        if layer == "iris":
            return add_ellipsoid(bm, c, Vector((0.056, 0.060, 0.017)), 16, 6, rot=rot)
        if layer == "pupil":
            return add_ellipsoid(bm, c + n * 0.012, Vector((0.026, 0.029, 0.008)), 10, 4, rot=rot)
        g = c + n * 0.015 + up * 0.023 + out * 0.017
        return add_ellipsoid(bm, g, Vector((0.014, 0.014, 0.007)), 8, 4, rot=rot)
    return f


def build_nose(bm):
    return add_ellipsoid(bm, NOSE_C, Vector((NOSE_R.x, NOSE_R.z, NOSE_R.y)), 12, 6, rot=facing(Vector((0, -1, 0))))


def build_mouth(side):
    def f(bm):
        s = 1 if side == "L" else -1
        st = []
        for j in range(7):
            a = j / 6
            x = s * 0.050 * a
            z = MUZZLE_C.z + 0.008 - 0.021 * math.sin(math.pi * a) - 0.002 * a
            k = 1 - (x / MUZZLE_R.x) ** 2 - ((z - MUZZLE_C.z) / MUZZLE_R.z) ** 2
            y = MUZZLE_C.y - MUZZLE_R.y * math.sqrt(k) - 0.0015
            st.append((Vector((x, y, z)), 0.0055))
        d0 = (st[0][0] - st[1][0]).normalized() * 0.004
        d1 = (st[-1][0] - st[-2][0]).normalized() * 0.004
        return add_tube(bm, st, 5, Vector((0, -1, 0)), st[0][0] + d0, st[-1][0] + d1)
    return f


def build_scarf_ring(bm):
    segs, prof = 24, 8
    rings = []
    for j in range(prof):
        a = 2 * math.pi * j / prof
        # «в'язаний» профіль: м'який прямокутник
        cu, su = math.cos(a), math.sin(a)
        du = math.copysign(abs(cu) ** 0.6, cu) * 0.031
        dz = math.copysign(abs(su) ** 0.6, su) * 0.037
        ring = []
        for i in range(segs):
            th = 2 * math.pi * i / segs
            wob = 1 + 0.035 * math.sin(3 * th + 0.7)
            rx, ry = (0.150 + du) * wob, (0.136 + du) * wob
            z = SCARF_Z + dz - 0.012 * math.cos(th) + 0.004 * math.sin(2 * th)
            ring.append(Vector((rx * math.sin(th), -ry * math.cos(th), z)))
        rings.append(ring)
    n = segs
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    faces = []
    for j in range(prof):
        a, b = vr[j], vr[(j + 1) % prof]
        for i in range(n):
            k = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[k], b[k], b[i])))
    return [v for ring in vr for v in ring], faces


def build_scarf_knot(bm):
    return add_ellipsoid(bm, SC[0] + Vector((0, -0.004, 0.0)), Vector((0.046, 0.030, 0.040)), 10, 6)


def chain_point(t):
    """Точка на ланцюжку шарфа, t у [0, 3]."""
    i = min(int(t), 2)
    return SC[i].lerp(SC[i + 1], t - i)


def build_scarf_tail(side):
    def f(bm):
        s = 1 if side == "L" else -1
        length = 3.0 if side == "L" else 2.62
        st = []
        n = 12
        for j in range(n + 1):
            a = j / n
            p = chain_point(a * length)
            p = p + Vector((s * (0.026 + 0.040 * a), 0.012 * math.sin(a * math.pi) * s, 0))
            st.append((p, (0.031 + 0.010 * a, 0.012)))
        d0 = (st[0][0] - st[1][0]).normalized() * 0.004
        d1 = (st[-1][0] - st[-2][0]).normalized() * 0.004
        return add_tube(bm, st, 6, Vector((1, 0, 0)), st[0][0] + d0, st[-1][0] + d1, rect=True)
    return f


# ------------------------------------------------------------------------------
# 3. Ваги
# ------------------------------------------------------------------------------
def smoothstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def chain_w(t, bones, joints):
    """Плавний перехід уздовж ланцюжка: joints = [(позиція, півширина)]."""
    s = [smoothstep((t - (p - w)) / (2 * w)) for p, w in joints]
    out = {}
    for k, b in enumerate(bones):
        lo = s[k - 1] if k > 0 else 1.0
        hi = s[k] if k < len(s) else 0.0
        w = lo * (1 - hi)
        if w > 1e-4:
            out[b] = out.get(b, 0.0) + w
    return out


def poly_param(p, pts):
    """Довжина вздовж ламаної до найближчої точки (за межі кінців — екстраполяція)."""
    best, best_t, cum = 1e9, 0.0, 0.0
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        ln = ab.length
        u = (p - a).dot(ab) / (ln * ln)
        lo = -1.0 if i == 0 else 0.0
        hi = 2.0 if i == len(pts) - 2 else 1.0
        uc = min(max(u, lo), hi)
        d = (p - (a + ab * uc)).length
        if d < best:
            best, best_t = d, cum + uc * ln
        cum += ln
    return best_t


def w_spine(co):
    return chain_w(co.z, ["pelvis", "spine_01", "spine_02", "neck", "head"],
                   [(Z_SP1, 0.05), (Z_SP2, 0.05), (Z_NECK, 0.028), (Z_HEAD, 0.026)])


def w_arm(side):
    def f(co):
        p = co if side == "L" else mx(co)
        t = poly_param(p, [ARM_S, ARM_E, ARM_W, ARM_T])
        j1 = (ARM_E - ARM_S).length
        j2 = j1 + (ARM_W - ARM_E).length
        return chain_w(t, ["upperarm." + side, "lowerarm." + side, "hand." + side], [(j1, 0.032), (j2, 0.022)])
    return f


def w_leg(side):
    def f(co):
        p = co if side == "L" else mx(co)
        t = poly_param(p, [LEG_H, LEG_K, LEG_A])
        j1 = (LEG_K - LEG_H).length
        j2 = j1 + (LEG_A - LEG_K).length
        return chain_w(t, ["thigh." + side, "calf." + side, "foot." + side], [(j1, 0.034), (j2, 0.024)])
    return f


def w_scarf_tail(co):
    t = poly_param(Vector((0, co.y, co.z)), SC)
    l1 = (SC[1] - SC[0]).length
    l2 = l1 + (SC[2] - SC[1]).length
    return chain_w(t, ["neck", "scarf_tail_01", "scarf_tail_02", "scarf_tail_03"],
                   [(0.012, 0.014), (l1, 0.03), (l2, 0.03)])


def const_w(**kw):
    return lambda co: dict(kw)


def bone_w(name):
    return lambda co: {name: 1.0}


# (назва, будівник, матеріал, функція ваг)
UNION_PARTS = [
    ("body", build_body, "fur", w_spine),
    ("belly", build_belly, "muzzle", w_spine),
    ("muzzle", build_muzzle, "muzzle", bone_w("head")),
    ("ear.L", build_ear("L", False), "fur", bone_w("ear.L")),
    ("ear.R", build_ear("R", False), "fur", bone_w("ear.R")),
    ("ear_in.L", build_ear("L", True), "muzzle", bone_w("ear.L")),
    ("ear_in.R", build_ear("R", True), "muzzle", bone_w("ear.R")),
    ("arm.L", build_arm("L"), "fur", w_arm("L")),
    ("arm.R", build_arm("R"), "fur", w_arm("R")),
    ("leg.L", build_leg("L"), "fur", w_leg("L")),
    ("leg.R", build_leg("R"), "fur", w_leg("R")),
    ("foot.L", build_foot("L"), "fur", bone_w("foot.L")),
    ("foot.R", build_foot("R"), "fur", bone_w("foot.R")),
    ("tail", build_tail, "fur", bone_w("pelvis")),
]

ISLAND_PARTS = [
    ("nose", build_nose, "nose", bone_w("head")),
    ("mouth.L", build_mouth("L"), "nose", bone_w("head")),
    ("mouth.R", build_mouth("R"), "nose", bone_w("head")),
    ("iris.L", build_eye("L", "iris"), "eye", bone_w("eye.L")),
    ("iris.R", build_eye("R", "iris"), "eye", bone_w("eye.R")),
    ("pupil.L", build_eye("L", "pupil"), "pupil", bone_w("eye.L")),
    ("pupil.R", build_eye("R", "pupil"), "pupil", bone_w("eye.R")),
    ("glint.L", build_eye("L", "glint"), "glint", bone_w("eye.L")),
    ("glint.R", build_eye("R", "glint"), "glint", bone_w("eye.R")),
    ("scarf_ring", build_scarf_ring, "scarf", const_w(neck=0.7, spine_02=0.3)),
    ("scarf_knot", build_scarf_knot, "scarf", const_w(neck=0.8, spine_02=0.2)),
    ("scarf_tail.L", build_scarf_tail("L"), "scarf", w_scarf_tail),
    ("scarf_tail.R", build_scarf_tail("R"), "scarf", w_scarf_tail),
]


# ------------------------------------------------------------------------------
# 4. Збирання меша
# ------------------------------------------------------------------------------
def clear_scene():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for b in list(coll):
            coll.remove(b)


def union_skin(col):
    """Будує частини тіла окремими оболонками й зливає їх в одну шкіру."""
    tmp_mats = [bpy.data.materials.new("TMP_%02d" % i) for i in range(len(UNION_PARTS))]
    objs = []
    for pid, (name, builder, _mat, _w) in enumerate(UNION_PARTS):
        bm = bmesh.new()
        builder(bm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for f in bm.faces:
            f.material_index = pid
        me = bpy.data.meshes.new("TMP_" + name)
        bm.to_mesh(me)
        bm.free()
        for m in tmp_mats:
            me.materials.append(m)
        ob = bpy.data.objects.new("TMP_" + name, me)
        col.objects.link(ob)
        objs.append(ob)

    base = objs[0]
    for ob in objs[1:]:
        mod = base.modifiers.new("U_" + ob.name, "BOOLEAN")
        mod.operation = "UNION"
        mod.solver = "EXACT"
        mod.object = ob
        if hasattr(mod, "material_mode"):
            mod.material_mode = "INDEX"
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    merged = bpy.data.meshes.new_from_object(base.evaluated_get(dg))

    bm = bmesh.new()
    bm.from_mesh(merged)
    bpy.data.meshes.remove(merged)
    for ob in objs:
        me = ob.data
        bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.meshes.remove(me)
    for m in tmp_mats:
        bpy.data.materials.remove(m)
    return bm


def build_mesh(mats, col):
    bm = union_skin(col)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons)
    bm.verts.ensure_lookup_table()

    # ваги шкіри: середнє за частинами, яких торкається вершина, далі згладжування
    weights = {}
    for v in bm.verts:
        pids = {f.material_index for f in v.link_faces}
        acc = {}
        for pid in pids:
            for b, w in UNION_PARTS[pid][3](v.co).items():
                acc[b] = acc.get(b, 0.0) + w / len(pids)
        weights[v] = acc
    for _ in range(2):
        nxt = {}
        for v in bm.verts:
            acc = {b: w * 0.5 for b, w in weights[v].items()}
            nb = [e.other_vert(v) for e in v.link_edges]
            for o in nb:
                for b, w in weights[o].items():
                    acc[b] = acc.get(b, 0.0) + 0.5 * w / len(nb)
            nxt[v] = acc
        weights = nxt

    for f in bm.faces:
        f.material_index = MAT_ORDER.index(UNION_PARTS[f.material_index][2])
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > math.radians(48):
            e.smooth = False

    for name, builder, mat, wfn in ISLAND_PARTS:
        verts, faces = builder(bm)
        bmesh.ops.recalc_face_normals(bm, faces=faces)
        for f in faces:
            f.material_index = MAT_ORDER.index(mat)
            f.smooth = True
        for v in verts:
            weights[v] = wfn(v.co)

    bm.verts.index_update()
    zs = [v.co.z for v in bm.verts]
    assert abs(max(zs) - HEIGHT) < 1e-4 and abs(min(zs)) < 1e-4, (min(zs), max(zs))

    me = bpy.data.meshes.new("GEO_Sofia")
    index_w = {v.index: w for v, w in weights.items()}
    bm.to_mesh(me)
    bm.free()
    for key in MAT_ORDER:
        me.materials.append(mats[key])
    ob = bpy.data.objects.new("GEO_Sofia", me)
    col.objects.link(ob)
    assign_weights(ob, index_w)
    return ob


def assign_weights(ob, index_w):
    groups = {}
    for idx, ws in index_w.items():
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:4]
        total = sum(w for _, w in top)
        for b, w in top:
            if w / total < 0.004:
                continue
            g = groups.get(b) or groups.setdefault(b, ob.vertex_groups.new(name=PREFIX + b))
            g.add([idx], w / total, "REPLACE")


def build_key(mats, col):
    """Ключ зі світу квітів у правій лапі; у грі показується лише в Unlock_Cage."""
    W, T = mx(ARM_W), mx(ARM_T)
    a = (T - W).normalized()
    n = a.cross(Vector((0, 1, 0))).normalized()
    b = n.cross(a).normalized()
    rot = Matrix((a, b, n)).transposed()
    bm = bmesh.new()
    gold, petal = [], []
    fc = T + a * 0.050
    end = fc + a * 0.150
    st = [(along(W, T, 0.025), 0.007), (fc, 0.007), (fc + a * 0.075, 0.007), (end, 0.007)]
    gold += add_tube(bm, st, 6, n, st[0][0] - a * 0.004, end + a * 0.006)[1]
    for off in (0.118, 0.142):
        p = fc + a * off
        ts = [(p, (0.008, 0.004)), (p + b * 0.016, (0.008, 0.004)), (p + b * 0.030, (0.008, 0.004))]
        gold += add_tube(bm, ts, 6, a, p - b * 0.002, p + b * 0.032, rect=True)[1]
    gold += add_ellipsoid(bm, fc, Vector((0.017, 0.017, 0.013)), 10, 6, rot=rot)[1]
    for i in range(5):
        th = 2 * math.pi * i / 5 + math.pi
        c = fc + 0.031 * (math.cos(th) * a + math.sin(th) * b)
        petal += add_ellipsoid(bm, c, Vector((0.021, 0.021, 0.009)), 10, 4, rot=rot)[1]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = True
    for f in petal:
        f.material_index = 1
    me = bpy.data.meshes.new("PROP_Flower_Key")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mats["gold"])
    me.materials.append(mats["petal"])
    ob = bpy.data.objects.new("PROP_Flower_Key", me)
    col.objects.link(ob)
    g = ob.vertex_groups.new(name=PREFIX + "hand.R")
    g.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    return ob


# ------------------------------------------------------------------------------
# 5. Скелет
# ------------------------------------------------------------------------------
def bone_table():
    t = [
        ("root", Vector((0, 0, 0)), Vector((0, 0.15, 0)), None, False),
        ("pelvis", Vector((0, 0, Z_PELVIS)), Vector((0, 0, Z_SP1)), "root", False),
        ("spine_01", Vector((0, 0, Z_SP1)), Vector((0, 0, Z_SP2)), "pelvis", True),
        ("spine_02", Vector((0, 0, Z_SP2)), Vector((0, 0, Z_NECK)), "spine_01", True),
        ("neck", Vector((0, 0, Z_NECK)), Vector((0, 0, Z_HEAD)), "spine_02", True),
        ("head", Vector((0, 0, Z_HEAD)), Vector((0, 0, 0.87)), "neck", True),
        ("scarf_tail_01", SC[0], SC[1], "neck", False),
        ("scarf_tail_02", SC[1], SC[2], "scarf_tail_01", True),
        ("scarf_tail_03", SC[2], SC[3], "scarf_tail_02", True),
    ]
    for side in ("L", "R"):
        m = (lambda v: v.copy()) if side == "L" else mx
        ec, en = eye_frame(side)
        t += [
            ("ear." + side, m(Vector((0.190, 0, 0.945))), m(Vector((0.230, 0, 1.075))), "head", False),
            ("eye." + side, ec, ec + en * 0.05, "head", False),
            ("upperarm." + side, m(ARM_S), m(ARM_E), "spine_02", False),
            ("lowerarm." + side, m(ARM_E), m(ARM_W), "upperarm." + side, True),
            ("hand." + side, m(ARM_W), m(ARM_T), "lowerarm." + side, True),
            ("thigh." + side, m(LEG_H), m(LEG_K), "pelvis", False),
            ("calf." + side, m(LEG_K), m(LEG_A), "thigh." + side, True),
            ("foot." + side, m(LEG_A), m(FOOT_TIP), "calf." + side, True),
        ]
    return t


def build_rig(col):
    arm = bpy.data.armatures.new("RIG_Sofia")
    ob = bpy.data.objects.new("RIG_Sofia", arm)
    col.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent, connect in bone_table():
        eb = arm.edit_bones.new(PREFIX + name)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = arm.edit_bones[PREFIX + parent]
            eb.use_connect = connect
        eb.use_deform = True
        if name.startswith("eye."):
            eb.align_roll(Vector((0, 0, 1)))    # локальна Z ока = «вгору» для моргання
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
#    Кути задаються в осях арматури (X — тангаж, Y — крен, Z — рискання),
#    «перенесених» батьківською кісткою; скрипт сам переводить їх у локальні
#    кватерніони кісток. Для звислих кінцівок: -X = вперед, +X = назад.
#    Для хребта й голови: +X = нахил уперед. +Z = поворот ліворуч.
# ------------------------------------------------------------------------------
TAU = 2 * math.pi
L1 = (LEG_K - LEG_H).length
L2 = (LEG_A - LEG_K).length
L0 = (LEG_A - LEG_H).length


def ease(f, keys):
    """Скалярний канал за ключами [(кадр, значення)] з м'яким входом і виходом."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            return v0 + (v1 - v0) * smoothstep((f - f0) / (f1 - f0))
    return keys[-1][1]


def _acos(x):
    return math.acos(min(max(x, -1.0), 1.0))


def leg_ik(drop):
    """Кути стегна, гомілки й стопи, щоб ступня лишилась на місці, коли таз опущено."""
    def solve(d):
        return (_acos((d * d + L1 * L1 - L2 * L2) / (2 * d * L1)),
                _acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)))
    d = min(max(L0 - drop, 0.06), L1 + L2 - 1e-5)
    a, k = solve(d)
    a0, k0 = solve(L0)
    thigh = -math.degrees(a - a0)
    calf = math.degrees(k0 - k)
    return thigh, calf, -(thigh + calf)


class Pose:
    def __init__(self):
        self.rot, self.loc, self.scale, self.twist = {}, {}, {}, {}

    def r(self, bone, x=0.0, y=0.0, z=0.0):
        o = self.rot.get(bone, (0.0, 0.0, 0.0))
        self.rot[bone] = (o[0] + x, o[1] + y, o[2] + z)

    def arm(self, side, swing=0.0, lower=22.0, inward=0.0, flex=12.0):
        s = 1 if side == "L" else -1
        self.r("upperarm." + side, swing, s * lower, -s * inward)
        self.r("lowerarm." + side, -flex)

    def leg(self, side, thigh, calf, foot):
        self.r("thigh." + side, thigh)
        self.r("calf." + side, calf)
        self.r("foot." + side, foot)

    def ears(self, pitch_l, pitch_r=None, roll=0.0):
        self.r("ear.L", pitch_l, roll)
        self.r("ear.R", pitch_l if pitch_r is None else pitch_r, -roll)

    def scarf(self, lift, sway=(0, 0, 0)):
        for i in range(3):
            self.r("scarf_tail_0%d" % (i + 1), lift[i], 0.0, sway[i])

    def blink(self, k):
        self.scale["eye.L"] = self.scale["eye.R"] = (1.0, 1.0, k)


def idle(f):
    ph = TAU * f / 60
    b = math.sin(ph)
    p = Pose()
    p.r("spine_01", 0.8 * b)
    p.r("spine_02", 1.2 * b)
    k = 1 + 0.022 * (0.5 + 0.5 * b)
    p.scale["spine_02"] = (k, k, k)
    p.r("neck", -0.6 * b)
    p.r("head", -1.2 * b, 1.6 * math.sin(ph + 1.0), 2.5 * math.sin(ph))
    for side, s in (("L", 1), ("R", -1)):
        p.arm(side, swing=3 * math.sin(ph - 0.6), lower=22 + 2.2 * b, flex=12 + 2 * b)
        p.leg(side, 0, 0, 0)
    twitch = ease(f, [(43, 0), (45, 1), (47, -0.35), (50, 0)])
    p.ears(2.5 * math.sin(ph + 0.5), 2.5 * math.sin(ph + 0.5) - 13 * twitch, roll=2.5 * math.sin(ph + 1.2))
    p.r("ear.R", 0, 9 * twitch)
    p.scarf((2 * math.sin(2 * ph), 3 * math.sin(2 * ph - 0.8), 4.5 * math.sin(2 * ph - 1.6)),
            (3 * math.sin(ph - 0.4), 5.5 * math.sin(ph - 1.0), 8.5 * math.sin(ph - 1.6)))
    p.blink(ease(f, [(29, 1), (31, 0.07), (32, 0.07), (35, 1)]))
    return p


def walk(f):
    ph = TAU * f / 30
    s1, c2 = math.sin(ph), math.cos(2 * ph)
    p = Pose()
    p.loc["pelvis"] = (0.007 * s1, 0, 0.017 * c2 - 0.008)
    p.r("pelvis", 2, 2.5 * s1, -6 * s1)
    p.r("spine_01", 3, -1.5 * s1, 3 * s1)
    p.r("spine_02", 1, -1.5 * s1, 6 * s1)
    p.r("neck", -2, 0, -1.5 * s1)
    p.r("head", -3 + 2 * math.cos(2 * ph - 0.6), 3.5 * s1, -1.5 * s1)
    for side, q in (("L", ph), ("R", ph + math.pi)):
        sn, cs = math.sin(q), math.cos(q)
        thigh = -27 * sn - 5
        calf = 6 + 42 * (0.5 + 0.5 * cs) ** 2
        foot = -0.55 * (thigh + calf) - 14 * max(0.0, sn)
        p.leg(side, thigh, calf, foot)
        p.arm(side, swing=25 * sn, lower=24, flex=16 + 12 * (0.5 - 0.5 * sn))
    p.ears(5 * math.sin(2 * ph - 1.0), roll=2 * math.sin(2 * ph - 1.4))
    p.scarf((13 + 5 * math.sin(2 * ph - 0.8), 6 + 6 * math.sin(2 * ph - 1.5), 4 + 8 * math.sin(2 * ph - 2.2)),
            (5 * math.sin(ph - 0.5), 7 * math.sin(ph - 1.1), 9 * math.sin(ph - 1.7)))
    return p


def run(f):
    ph = TAU * f / 20
    s1 = math.sin(ph)
    p = Pose()
    p.loc["pelvis"] = (0.008 * s1, 0, 0.030 * math.cos(2 * ph + 0.6) - 0.012)
    p.r("pelvis", 10, 3 * s1, -9 * s1)
    p.r("spine_01", 10, -2 * s1, 4 * s1)
    p.r("spine_02", 8, -2 * s1, 9 * s1)
    p.r("neck", -7, 0, -2 * s1)
    p.r("head", -13 + 2.5 * math.cos(2 * ph - 0.4), 2 * s1, -3 * s1)
    for side, q in (("L", ph), ("R", ph + math.pi)):
        sn = math.sin(q)
        thigh = -44 * sn - 14
        calf = 14 + 78 * (0.5 + 0.5 * math.cos(q - 0.45)) ** 1.5
        foot = -0.4 * (thigh + calf) + 22 * max(0.0, -sn)
        p.leg(side, thigh, calf, foot)
        p.arm(side, swing=52 * sn, lower=30, flex=68 - 12 * sn)
    p.ears(-15 + 6 * math.sin(2 * ph - 1.0), roll=3 * math.sin(2 * ph - 1.4))
    p.scarf((30 + 5 * math.sin(2 * ph - 0.8), 8 + 7 * math.sin(2 * ph - 1.6), 5 + 10 * math.sin(2 * ph - 2.4)),
            (4 * math.sin(ph - 0.6), 6 * math.sin(ph - 1.3), 8 * math.sin(ph - 2.0)))
    return p


AIR_THIGH, AIR_CALF, AIR_FOOT = -58.0, 88.0, 16.0


def jump_start(f):
    p = Pose()
    drop = ease(f, [(0, 0), (7, 0.078), (9, 0.078), (13, 0.0)])
    rise = ease(f, [(10, 0), (15, 0.034)])
    p.loc["pelvis"] = (0, 0, rise - drop)
    th, ca, fo = leg_ik(drop)
    toes = ease(f, [(10, 0), (15, 36)])
    lean = ease(f, [(0, 0), (7, 15), (9, 15), (15, -5)])
    p.r("spine_01", lean)
    p.r("spine_02", lean * 0.6)
    p.r("head", ease(f, [(0, 0), (7, 9), (15, -11)]))
    for side in ("L", "R"):
        p.leg(side, th, ca, fo + toes)
        p.arm(side,
              swing=ease(f, [(0, 0), (7, 38), (9, 38), (15, -125)]),
              lower=ease(f, [(0, 22), (9, 26), (15, 4)]),
              flex=ease(f, [(0, 12), (8, 32), (15, 8)]))
    p.ears(ease(f, [(0, 0), (7, 7), (15, -13)]))
    p.scarf((ease(f, [(0, 0), (7, -9), (11, -4), (15, -17)]),
             ease(f, [(0, 0), (8, -7), (15, -12)]),
             ease(f, [(0, 0), (9, -6), (15, -10)])))
    return p


def jump_air(f):
    ph = TAU * f / 15
    s = math.sin(ph)
    p = Pose()
    p.r("pelvis", -5)
    p.r("spine_01", 5 + s)
    p.r("spine_02", 2)
    p.r("head", -7 + 1.5 * s)
    for side, sg in (("L", 1), ("R", -1)):
        p.leg(side, AIR_THIGH + 3 * s * sg, AIR_CALF - 4 * s * sg, AIR_FOOT)
        p.arm(side, swing=-36 + 4 * s, lower=-24 + 3 * math.sin(ph - 0.7), flex=26)
    p.ears(-11 + 4 * math.sin(ph - 0.5), roll=3 * s)
    p.scarf((40 + 6 * s, 18 + 8 * math.sin(ph - 0.8), 12 + 10 * math.sin(ph - 1.6)),
            (4 * math.sin(ph + 0.4), 6 * math.sin(ph - 0.4), 8 * math.sin(ph - 1.2)))
    return p


def land(f):
    p = Pose()
    air = ease(f, [(0, 1), (4, 0)])
    drop = ease(f, [(0, 0.05), (4, 0.096), (10, 0.024), (14, 0.0), (18, 0.0)])
    p.loc["pelvis"] = (0, 0, -drop * (1 - air))
    th, ca, fo = leg_ik(drop)
    p.r("pelvis", -5 * air)
    p.r("spine_01", ease(f, [(0, 5), (4, 17), (10, 5), (18, 0)]))
    p.r("spine_02", ease(f, [(0, 2), (4, 9), (10, 2), (18, 0)]))
    p.r("head", ease(f, [(0, -7), (4, 13), (9, -4), (14, 1), (18, 0)]))
    for side in ("L", "R"):
        p.leg(side,
              AIR_THIGH * air + th * (1 - air),
              AIR_CALF * air + ca * (1 - air),
              AIR_FOOT * air + fo * (1 - air))
        p.arm(side,
              swing=ease(f, [(0, -36), (4, 16), (10, -6), (18, 0)]),
              lower=ease(f, [(0, -24), (4, 36), (10, 24), (18, 22)]),
              flex=ease(f, [(0, 26), (4, 36), (12, 16), (18, 12)]))
    p.ears(ease(f, [(0, -11), (4, 15), (8, -7), (12, 3), (18, 0)]))
    p.scarf((ease(f, [(0, 40), (4, 20), (7, -13), (11, 6), (15, -2), (18, 0)]),
             ease(f, [(0, 18), (5, 10), (8, -11), (12, 6), (16, -2), (18, 0)]),
             ease(f, [(0, 12), (6, 8), (9, -13), (13, 7), (17, -1), (18, 0)])))
    return p


def unlock_cage(f):
    p = Pose()
    reach = ease(f, [(0, 0), (12, 1), (33, 1), (45, 0)])
    push = ease(f, [(12, 0), (19, 1), (31, 1), (38, 0)])
    click = ease(f, [(26, 0), (28, 1), (31, -0.3), (34, 0)])
    p.loc["pelvis"] = (0, 0, 0.012 * click)
    p.r("spine_01", 5 * reach + 5 * push)
    p.r("spine_02", 3 * reach + 2 * push, 0, 9 * reach + 4 * push)
    p.r("neck", 0, 0, -4 * reach)
    p.r("head", 5 * reach - 6 * click, 7 * click, -7 * reach - 3 * push)
    # права лапа з ключем тягнеться вперед до замка, поворот ключа — крученням кисті
    p.arm("R", swing=-(84 * reach + 8 * push), lower=22, inward=22 * reach, flex=12 + 18 * reach * (1 - push))
    p.twist["hand.R"] = ease(f, [(18, 0), (26, 95), (31, 95), (37, 0)])
    p.arm("L", swing=16 * reach, lower=22 + 6 * reach, flex=12 + 10 * reach)
    for side in ("L", "R"):
        p.leg(side, 0, 0, 0)
    p.ears(-9 * click + 3 * reach, roll=-4 * click)
    p.scarf((ease(f, [(0, 0), (8, -9), (15, 4), (21, -1), (26, 0), (29, 7), (33, -3), (38, 0), (45, 0)]),
             ease(f, [(0, 0), (10, -8), (17, 5), (23, 0), (27, 0), (30, 8), (35, -3), (41, 0), (45, 0)]),
             ease(f, [(0, 0), (12, -8), (19, 6), (25, 0), (28, 0), (31, 9), (37, -4), (43, 0), (45, 0)])))
    p.blink(ease(f, [(36, 1), (38, 0.07), (39, 0.07), (42, 1)]))
    return p


CLIPS = [
    ("Idle", 60, idle),
    ("Walk", 30, walk),
    ("Run", 20, run),
    ("Jump_Start", 15, jump_start),
    ("Jump_Air", 15, jump_air),
    ("Land", 18, land),
    ("Unlock_Cage", 45, unlock_cage),
]

AX_X, AX_Y, AX_Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def build_animations(rig):
    scene = bpy.context.scene
    scene.render.fps = FPS
    rig.animation_data_create()
    rest = {pb.name: pb.bone.matrix_local.to_quaternion() for pb in rig.pose.bones}
    names = [pb.name[len(PREFIX):] for pb in rig.pose.bones]
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"

    for clip_name, length, fn in CLIPS:
        action = bpy.data.actions.new(clip_name)
        action.use_fake_user = True
        rig.animation_data.action = action
        last = {}
        for f in range(length + 1):
            pose = fn(f)
            for short in names:
                pb = rig.pose.bones[PREFIX + short]
                qr = rest[pb.name]
                rx, ry, rz = (math.radians(a) for a in pose.rot.get(short, (0.0, 0.0, 0.0)))
                qd = Quaternion(AX_Z, rz) @ Quaternion(AX_X, rx) @ Quaternion(AX_Y, ry)
                q = qr.conjugated() @ qd @ qr
                q = q @ Quaternion(AX_Y, math.radians(pose.twist.get(short, 0.0)))
                if short in last and last[short].dot(q) < 0:
                    q.negate()
                last[short] = q.copy()
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if short == "pelvis":
                    pb.location = qr.conjugated() @ Vector(pose.loc.get(short, (0.0, 0.0, 0.0)))
                    pb.keyframe_insert("location", frame=f)
                if short in ("eye.L", "eye.R", "spine_02"):
                    pb.scale = pose.scale.get(short, (1.0, 1.0, 1.0))
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
    scene.frame_start, scene.frame_end = 0, 60
    scene.frame_set(0)


# ------------------------------------------------------------------------------
# 7. Експорт
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


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if argv:
        outs = [os.path.abspath(a) for a in argv]
    else:
        here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else bpy.path.abspath("//")
        outs = [os.path.abspath(os.path.join(here, "..", "..", "public", "models", "sofia-fable.glb"))]

    clear_scene()
    col = bpy.data.collections.new("COL_Sofia")
    bpy.context.scene.collection.children.link(col)
    mats = create_materials()
    mesh_ob = build_mesh(mats, col)
    key_ob = build_key(mats, col)
    rig = build_rig(col)
    bind(mesh_ob, rig)
    bind(key_ob, rig)
    build_animations(rig)

    quads = sum(1 for p in mesh_ob.data.polygons if len(p.vertices) == 4)
    print("[sofia] tris=%d (quads %d / faces %d), key tris=%d, verts=%d, bones=%d" % (
        tri_count(mesh_ob), quads, len(mesh_ob.data.polygons), tri_count(key_ob),
        len(mesh_ob.data.vertices), len(rig.data.bones)))
    for path in outs:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        export_glb(path)
        print("[sofia] exported", path)


if __name__ == "__main__":
    main()
