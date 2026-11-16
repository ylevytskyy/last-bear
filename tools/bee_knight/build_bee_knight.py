"""Бджола-лицар (варіант C) — процедурна low-poly модель, риг і 5 бойових кліпів.

Запуск (Blender 4.x / 5.x):
    blender --background --python tools/bee_knight/build_bee_knight.py

Результат: public/models/bee-knight.glb (glTF 2.0, Y-up, 30 FPS, 5 анімацій).
Погляд бджоли — уздовж -Y, довжина від забрала до кінчика жала — рівно 1.2 м,
центр тіла (кістка body_center) — на Z = 1.0 м, root — на Z = 0.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Quaternion

# ==============================================================================
# 0. НАЛАШТУВАННЯ
# ==============================================================================

FPS = 30
BODY_LENGTH = 1.2          # м, забрало шолома -> кінчик жала
HOVER_Z = 1.0              # м, висота центру тіла
OUT_NAME = "bee-knight.glb"

DASH_PITCH = -165.0        # ° навколо X: тіло перекинуте назад, жало дивиться вперед (-Y) і трохи вниз
STUCK_PITCH = -135.0       # ° навколо X: жало входить у землю під 45°
STUCK_TIP_Z = -0.12        # м, глибина кінчика жала під поверхнею (Z = 0) у стані «застрягла»
STUCK_WING_SPLAY = 60.0    # ° крила розкинуті в боки, щоб не тонули в землі, поки бджола лежить на спині
STUCK_WING_SWEEP = 35.0    # ° і підняті до голови

# name -> (кадрів, зациклений)
CLIPS = (
    ("State1_Idle_Hover", 30, True),
    ("State2_Red_Windup", 24, False),
    ("State3_Dash_Attack", 15, True),
    ("State4_Stuck_Vulnerable", 60, True),
    ("State5_Recover_Return", 24, False),
)

BONES = (
    "root", "body_center", "thorax", "head", "helmet_plume", "eyes_calm", "eyes_aggro",
    "abdomen_01", "abdomen_02", "stinger", "wing.L", "wing.R", "arm.L", "arm.R", "leg.L", "leg.R",
)
# Службові (не кісткові) групи вершин для вибору частин у Blender.
PART_GROUPS = ("GRP_helmet", "GRP_wings", "GRP_stinger", "GRP_abdomen_seg_01", "GRP_abdomen_seg_02")
GROUP_INDEX = {name: i for i, name in enumerate(BONES + PART_GROUPS)}

# (ключ, назва, HEX, metallic, roughness, alpha, emission HEX, emission strength)
MATERIALS = (
    ("yellow", "MAT_Bee_Yellow", "#F5B81D", 0.0, 0.75, 1.0, None, 0.0),
    ("black", "MAT_Bee_Black", "#1A1A1F", 0.0, 0.78, 1.0, None, 0.0),
    ("steel", "MAT_Armor_Steel", "#8D96A0", 0.85, 0.30, 1.0, None, 0.0),
    ("plume", "MAT_Plume_Red", "#D92626", 0.0, 0.70, 1.0, None, 0.0),
    ("wings", "MAT_Wings_Translucent", "#D9F2FF", 0.0, 0.15, 0.45, None, 0.0),
    ("eyes_aggro", "MAT_Eyes_Aggro", "#FF2222", 0.0, 0.40, 1.0, "#FF2222", 2.5),
    ("eyes_calm", "MAT_Eyes_Calm", "#FF9900", 0.0, 0.40, 1.0, "#FF9900", 1.2),
    ("collar", "MAT_Collar_Fluff", "#FFF3C4", 0.0, 0.90, 1.0, None, 0.0),
    ("shield", "MAT_Shield_Steel", "#737C85", 0.85, 0.35, 1.0, None, 0.0),
    ("stinger", "MAT_Stinger_Dark", "#383E45", 0.80, 0.35, 1.0, None, 0.0),
    ("stinger_tip", "MAT_Stinger_Tip", "#C4CDD5", 0.90, 0.20, 1.0, None, 0.0),
)
MAT_INDEX = {m[0]: i for i, m in enumerate(MATERIALS)}

# Калібрування «ескізні координати -> метри»; заповнюється після побудови меша.
CAL = {"scale": 1.0, "y_mid": 0.0}

# Ескізні координати (центр грудей = 0, перед = -Y)
HEAD_C = Vector((0.0, -0.30, 0.02))
HEAD_R = Vector((0.24, 0.22, 0.22))
WING_ROOT = (0.07, 0.04, 0.17)
WING_TILT_BACK = -0.75     # рад, нахил крила назад
WING_SPLAY = 0.50          # рад, розведення крил у боки
WING_HALF_LEN = 0.20
X_AXIS, Y_AXIS, Z_AXIS = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def to_world(p):
    """Ескізна точка -> метри в просторі арматури."""
    s = CAL["scale"]
    return Vector((p[0] * s, (p[1] - CAL["y_mid"]) * s, p[2] * s + HOVER_Z))


# ==============================================================================
# 1. СЦЕНА ТА МАТЕРІАЛИ (Principled BSDF -> glTF 2.0)
# ==============================================================================

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgba(hex_str, alpha=1.0):
    h = hex_str.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (alpha,)


def set_bsdf_socket(bsdf, names, value):
    for name in names:
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return


def clear_scene():
    if bpy.context.active_object and bpy.context.active_object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block_col in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for block in list(block_col):
            block_col.remove(block)


def create_materials():
    mats = []
    for _key, name, color, metallic, roughness, alpha, emission, strength in MATERIALS:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba(color))
        set_bsdf_socket(bsdf, ["Metallic"], metallic)
        set_bsdf_socket(bsdf, ["Roughness"], roughness)
        if emission:
            set_bsdf_socket(bsdf, ["Emission Color", "Emission"], hex_to_rgba(emission))
            set_bsdf_socket(bsdf, ["Emission Strength"], strength)
        if alpha < 1.0:
            set_bsdf_socket(bsdf, ["Alpha"], alpha)
            if hasattr(mat, "surface_render_method"):
                mat.surface_render_method = 'BLENDED'
            elif hasattr(mat, "blend_method"):
                mat.blend_method = 'BLEND'
        mats.append(mat)
    return mats


# ==============================================================================
# 2. ГЕОМЕТРІЯ (quad-dominant, симетрія по X, ваги пишуться одразу)
# ==============================================================================

def set_weights(bm, verts, weights):
    layer = bm.verts.layers.deform.active
    for v in verts:
        for name, w in weights.items():
            if w > 0.0:
                v[layer][GROUP_INDEX[name]] = w


def add_ellipsoid(bm, center, radii, segs, rings, mat, rot=(0.0, 0.0, 0.0)):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    verts = ret['verts']
    rot_mat = Euler(rot, 'XYZ').to_matrix()
    c = Vector(center)
    for v in verts:
        v.co = rot_mat @ Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + c
    for f in {f for v in verts for f in v.link_faces}:
        f.material_index = MAT_INDEX[mat]
        f.smooth = True
    return verts


def add_tube(bm, points, radii, segs, mat):
    """Трубка вздовж ламаної з заглушками (лапки, вусики)."""
    pts = [Vector(p) for p in points]
    axis = (pts[-1] - pts[0]).normalized()
    ref = Vector((0, 1, 0)) if abs(axis.dot(Vector((0, 1, 0)))) < 0.9 else Vector((1, 0, 0))
    side = axis.cross(ref).normalized()
    ortho = side.cross(axis).normalized()
    rings = []
    for p, r in zip(pts, radii):
        rings.append([
            bm.verts.new(p + (side * math.cos(2 * math.pi * s / segs) + ortho * math.sin(2 * math.pi * s / segs)) * r)
            for s in range(segs)
        ])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for s in range(segs):
            ns = (s + 1) % segs
            faces.append(bm.faces.new((a[s], a[ns], b[ns], b[s])))
    caps = []
    for ring, p in ((rings[0], pts[0]), (rings[-1], pts[-1])):
        vc = bm.verts.new(p)
        caps.append(vc)
        for s in range(segs):
            faces.append(bm.faces.new((ring[s], ring[(s + 1) % segs], vc)))
    for f in faces:
        f.material_index = MAT_INDEX[mat]
        f.smooth = True
    return [v for ring in rings for v in ring] + caps


def head_surface_y(x, z):
    """Y передньої поверхні голови в точці (x, z)."""
    k = 1.0 - (x / HEAD_R.x) ** 2 - ((z - HEAD_C.z) / HEAD_R.z) ** 2
    return HEAD_C.y - HEAD_R.y * math.sqrt(max(k, 0.0))


def add_eye(bm, side, offset, mat, bone):
    """Трикутне «сердите» око, що лежить на поверхні голови."""
    a = Vector((side * 0.175, 0.135))   # зовнішній верхній кут
    b = Vector((side * 0.040, 0.060))   # внутрішній кут (опущений -> злий погляд)
    c = Vector((side * 0.115, -0.030))  # нижній кут
    n = 4
    grid = {}
    for i in range(n + 1):
        for j in range(n + 1 - i):
            p = a + (b - a) * (i / n) + (c - a) * (j / n)
            grid[(i, j)] = bm.verts.new((p.x, head_surface_y(p.x, p.y) - offset, p.y))
    faces = []
    for i in range(n):
        for j in range(n - i):
            faces.append(bm.faces.new((grid[(i, j)], grid[(i + 1, j)], grid[(i, j + 1)])))
            if i + j < n - 1:
                faces.append(bm.faces.new((grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)])))
    for f in faces:
        f.material_index = MAT_INDEX[mat]
        f.smooth = True
    set_weights(bm, grid.values(), {bone: 1.0})


def abdomen_weights(y):
    """Плавний перехід ваг уздовж ланцюжка thorax -> abdomen_01 -> abdomen_02 -> stinger."""
    joints = ((0.08, "thorax", "abdomen_01"), (0.28, "abdomen_01", "abdomen_02"), (0.50, "abdomen_02", "stinger"))
    half = 0.06
    for joint_y, before, after in joints:
        if y < joint_y - half:
            return {before: 1.0}
        if y <= joint_y + half:
            t = (y - (joint_y - half)) / (2.0 * half)
            return {before: 1.0 - t, after: t}
    return {"stinger": 1.0}


def wing_rotation(side):
    return (WING_TILT_BACK, side * WING_SPLAY, 0.0)


def build_mesh(mats, collection):
    mesh = bpy.data.meshes.new("MSH_BeeKnight_Data")
    obj = bpy.data.objects.new("MSH_BeeKnight", mesh)
    collection.objects.link(obj)
    for mat in mats:
        mesh.materials.append(mat)
    for name in BONES + PART_GROUPS:
        obj.vertex_groups.new(name=name)

    bm = bmesh.new()
    bm.verts.layers.deform.verify()  # шар ваг — до створення вершин

    # --- Голова (жовта) ---
    set_weights(bm, add_ellipsoid(bm, HEAD_C, HEAD_R, 24, 14, "yellow"), {"head": 1.0})

    # --- Шолом: сталева оболонка з вирізом для обличчя ---
    helmet = add_ellipsoid(bm, HEAD_C + Vector((0.0, 0.01, 0.02)), (0.262, 0.245, 0.245), 24, 14, "steel")
    steel = MAT_INDEX["steel"]
    for plane_co, plane_no in ((HEAD_C + Vector((0.0, -0.07, 0.0)), Y_AXIS), (HEAD_C + Vector((0.0, 0.0, 0.10)), Z_AXIS)):
        shell = [f for f in bm.faces if f.material_index == steel]   # рівний край вирізу замість «сходинок»
        geom = shell + list({e for f in shell for e in f.edges}) + list({v for f in shell for v in f.verts})
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=plane_co, plane_no=plane_no)
    opening = []
    for f in bm.faces:
        d = f.calc_center_median() - HEAD_C
        if f.material_index == steel and d.y < -0.07 and d.z < 0.10:
            opening.append(f)
    bmesh.ops.delete(bm, geom=opening, context='FACES')
    helmet = list({v for f in bm.faces if f.material_index == steel for v in f.verts})
    # Забрало-надбрів'я, наносник
    helmet += add_ellipsoid(bm, HEAD_C + Vector((0.0, -0.215, 0.125)), (0.215, 0.050, 0.040), 16, 6, "steel", rot=(-0.25, 0.0, 0.0))
    helmet += add_ellipsoid(bm, HEAD_C + Vector((0.0, -0.228, 0.030)), (0.024, 0.020, 0.095), 8, 6, "steel")
    set_weights(bm, helmet, {"head": 1.0, "GRP_helmet": 1.0})

    # --- Плюмаж-гребінь (вищий спереду) ---
    plume = add_ellipsoid(bm, HEAD_C + Vector((0.0, 0.02, 0.285)), (0.036, 0.20, 0.085), 12, 8, "plume")
    plume_base = HEAD_C.z + 0.215
    for v in plume:
        front = max(0.0, -(v.co.y - HEAD_C.y - 0.02) / 0.20)
        v.co.z = plume_base + (v.co.z - plume_base) * (1.0 + 0.45 * front)
        w = min(1.0, max(0.0, (v.co.z - plume_base) / 0.07))
        set_weights(bm, [v], {"helmet_plume": w, "head": 1.0 - w, "GRP_helmet": 1.0})

    # --- Вусики ---
    for s in (-1.0, 1.0):
        antenna = add_tube(
            bm,
            [HEAD_C + Vector((s * 0.09, -0.05, 0.215)), HEAD_C + Vector((s * 0.14, -0.12, 0.345)), HEAD_C + Vector((s * 0.17, -0.21, 0.385))],
            [0.013, 0.011, 0.010], 6, "black")
        antenna += add_ellipsoid(bm, HEAD_C + Vector((s * 0.175, -0.225, 0.388)), (0.026, 0.026, 0.026), 8, 4, "black")
        set_weights(bm, antenna, {"head": 1.0})

    # --- Очі: спокійні (помаранчеві) поверх, агресивні (червоні) під ними ---
    for s in (-1.0, 1.0):
        add_eye(bm, s, 0.012, "eyes_calm", "eyes_calm")
        add_eye(bm, s, 0.006, "eyes_aggro", "eyes_aggro")

    # --- Пухнастий комірець ---
    collar_c = Vector((0.0, -0.11, -0.01))
    collar = add_ellipsoid(bm, collar_c, (0.265, 0.09, 0.25), 24, 10, "collar", rot=(math.pi / 2, 0.0, 0.0))
    for v in collar:
        d = v.co - collar_c
        fluff = 1.0 + 0.07 * math.cos(12.0 * math.atan2(d.z, d.x))
        v.co.x = collar_c.x + d.x * fluff
        v.co.z = collar_c.z + d.z * fluff
    set_weights(bm, collar, {"thorax": 1.0})

    # --- Груди ---
    set_weights(bm, add_ellipsoid(bm, (0.0, 0.0, 0.0), (0.215, 0.19, 0.205), 20, 12, "black"), {"thorax": 1.0})

    # --- Черевце: полюси сфери вздовж Y, смужки по кільцях ---
    abdomen = add_ellipsoid(bm, (0.0, 0.27, -0.01), (0.25, 0.24, 0.27), 24, 16, "yellow", rot=(math.pi / 2, 0.0, 0.0))
    for f in {f for v in abdomen for f in v.link_faces}:
        y = f.calc_center_median().y
        if 0.17 <= y < 0.27 or 0.37 <= y < 0.46:
            f.material_index = MAT_INDEX["black"]
    for v in abdomen:
        w = abdomen_weights(v.co.y)
        w["GRP_abdomen_seg_01" if v.co.y < 0.28 else "GRP_abdomen_seg_02"] = 1.0
        set_weights(bm, [v], w)

    # --- Жало: темний конус зі світлим вістрям ---
    profile = ((0.47, 0.090), (0.55, 0.074), (0.63, 0.052), (0.71, 0.030))
    segs = 12
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * s / segs), y, r * math.sin(2 * math.pi * s / segs))) for s in range(segs)]
             for y, r in profile]
    tip = bm.verts.new((0.0, 0.80, 0.0))
    for i, (a, b) in enumerate(zip(rings, rings[1:])):
        for s in range(segs):
            ns = (s + 1) % segs
            f = bm.faces.new((a[s], b[s], b[ns], a[ns]))
            f.material_index = MAT_INDEX["stinger" if i < 2 else "stinger_tip"]
            f.smooth = True
    for s in range(segs):
        f = bm.faces.new((rings[-1][s], tip, rings[-1][(s + 1) % segs]))
        f.material_index = MAT_INDEX["stinger_tip"]
        f.smooth = True
    set_weights(bm, [v for ring in rings for v in ring] + [tip], {"stinger": 1.0, "GRP_stinger": 1.0})

    # --- Крила ---
    for side, s in (("L", 1.0), ("R", -1.0)):
        rot = wing_rotation(s)
        center = Vector((s * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2])) + Euler(rot, 'XYZ').to_matrix() @ Vector((0.0, 0.0, WING_HALF_LEN * 0.95))
        wing = add_ellipsoid(bm, center, (0.010, 0.115, WING_HALF_LEN), 10, 8, "wings", rot=rot)
        set_weights(bm, wing, {f"wing.{side}": 1.0, "GRP_wings": 1.0})

    # --- Передні лапки зі щитом, задні лапки ---
    for side, s in (("L", 1.0), ("R", -1.0)):
        arm = add_tube(bm, [(s * 0.10, -0.08, -0.15), (s * 0.09, -0.18, -0.24), (s * 0.06, -0.27, -0.30)], [0.030, 0.025, 0.022], 8, "black")
        set_weights(bm, arm, {f"arm.{side}": 1.0})
        leg = add_tube(bm, [(s * 0.12, 0.10, -0.16), (s * 0.14, 0.12, -0.25), (s * 0.13, 0.10, -0.33)], [0.030, 0.024, 0.020], 8, "black")
        set_weights(bm, leg, {f"leg.{side}": 1.0})

    shield_rot = (math.radians(95.0), 0.0, 0.0)
    shield_c = Vector((0.0, -0.30, -0.30))
    shield_n = Euler(shield_rot, 'XYZ').to_matrix() @ Vector((0.0, 0.0, 1.0))
    shield = add_ellipsoid(bm, shield_c, (0.135, 0.135, 0.026), 16, 6, "shield", rot=shield_rot)
    shield += add_ellipsoid(bm, shield_c + shield_n * 0.020, (0.050, 0.050, 0.026), 10, 4, "steel", rot=shield_rot)
    set_weights(bm, shield, {"arm.L": 0.5, "arm.R": 0.5})

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    # --- Калібрування: довжина по Y рівно BODY_LENGTH, центр тіла на HOVER_Z ---
    y_min = min(v.co.y for v in bm.verts)
    y_max = max(v.co.y for v in bm.verts)
    CAL["scale"] = BODY_LENGTH / (y_max - y_min)
    CAL["y_mid"] = 0.5 * (y_min + y_max)
    for v in bm.verts:
        v.co = to_world(v.co)

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"[BeeKnight] Довжина: {BODY_LENGTH:.2f} м | масштаб ескізу: {CAL['scale']:.4f} | трикутників: {tris}")
    if not 3500 <= tris <= 5500:
        raise RuntimeError(f"Бюджет полігонів порушено: {tris} tris (потрібно 3500-5500)")
    return obj


# ==============================================================================
# 3. СКЕЛЕТ І СКІНІНГ
# ==============================================================================

def build_rig(collection):
    arm_data = bpy.data.armatures.new("ARM_BeeKnight_Data")
    arm_obj = bpy.data.objects.new("ARM_BeeKnight", arm_data)
    collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    y0 = CAL["y_mid"]  # ескізний Y центру тіла

    def bone(name, head, tail, parent=None, connected=False, world=False):
        b = eb.new(name)
        b.head = Vector(head) if world else to_world(head)
        b.tail = Vector(tail) if world else to_world(tail)
        b.use_deform = True
        if parent:
            b.parent = parent
            b.use_connect = connected
        return b

    root = bone("root", (0, 0, 0), (0, 0, 0.2), world=True)
    center = bone("body_center", (0, y0, 0), (0, y0, 0.14), root)
    thorax = bone("thorax", (0, 0.08, 0), (0, -0.12, 0), center)
    head = bone("head", (0, -0.12, 0), (0, -0.40, 0.03), thorax, True)
    bone("helmet_plume", (0, -0.28, 0.24), (0, -0.26, 0.42), head)
    bone("eyes_calm", (0, -0.50, 0.06), (0, -0.58, 0.06), head)
    bone("eyes_aggro", (0, -0.50, 0.06), (0, -0.58, 0.06), head)

    abd1 = bone("abdomen_01", (0, 0.08, 0), (0, 0.28, 0), thorax)
    abd2 = bone("abdomen_02", (0, 0.28, 0), (0, 0.50, 0), abd1, True)
    bone("stinger", (0, 0.50, 0), (0, 0.80, 0), abd2, True)

    for side, s in (("L", 1.0), ("R", -1.0)):
        wing_root = Vector((s * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2]))
        wing_dir = Euler(wing_rotation(s), 'XYZ').to_matrix() @ Vector((0.0, 0.0, 1.0))
        bone(f"wing.{side}", wing_root, wing_root + wing_dir * WING_HALF_LEN * 1.6, thorax)
        bone(f"arm.{side}", (s * 0.10, -0.08, -0.15), (s * 0.06, -0.27, -0.30), thorax)
        bone(f"leg.{side}", (s * 0.12, 0.10, -0.16), (s * 0.13, 0.10, -0.33), thorax)

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj


def apply_transforms_and_skin(mesh_obj, arm_obj):
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)  # Apply All Transforms

    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj


# ==============================================================================
# 4. АНІМАЦІЇ (пози задаються в осях арматури: X — тангаж, Y — крен, Z — рискання)
# ==============================================================================

IDENTITY = Quaternion()
BODY_C = Vector((0.0, 0.0, HOVER_Z))
TIP_REST = Vector((0.0, BODY_LENGTH / 2.0, HOVER_Z))


def rot(axis, degrees):
    return Quaternion(axis, math.radians(degrees))


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3.0 - 2.0 * x)


def noise(seed, frame):
    v = math.sin(seed * 12.9898 + frame * 78.233) * 43758.5453
    return (v - math.floor(v)) * 2.0 - 1.0


def wings(amp_l, amp_r, sweep=0.0):
    """Помах — навколо поздовжньої осі тіла; sweep < 0 притискає крила до черевця."""
    return {"wing.L": rot(Y_AXIS, amp_l) @ rot(X_AXIS, sweep), "wing.R": rot(Y_AXIS, -amp_r) @ rot(X_AXIS, sweep)}


def flap(frame, amp):
    return amp * math.sin(2.0 * math.pi * frame / 3.0)  # 10 Гц, кратно всім тривалостям кліпів


def pinned_center(q, tip_target):
    """Зсув body_center, за якого кінчик жала (при прямому черевці) лишається в tip_target."""
    return tip_target - q @ (TIP_REST - BODY_C) - BODY_C


def pose_idle(f):
    ph = 2.0 * math.pi * f / 30.0
    a = flap(f, 30.0)
    pose = {
        "loc": Vector((0.0, 0.0, 0.08 * math.sin(ph))),
        "body_center": rot(X_AXIS, 3.0 * math.sin(ph)),
        "head": rot(X_AXIS, -3.0 * math.sin(ph)),
        "helmet_plume": rot(X_AXIS, 6.0 * math.sin(ph - 1.0)),
        "abdomen_01": rot(X_AXIS, 5.0 * math.sin(ph - 0.8)),
        "abdomen_02": rot(X_AXIS, 4.0 * math.sin(ph - 1.4)),
        "aggro": 0.0,
    }
    for side in ("L", "R"):
        pose[f"arm.{side}"] = rot(X_AXIS, 6.0 * math.sin(ph - 0.5))
        pose[f"leg.{side}"] = rot(X_AXIS, 8.0 * math.sin(ph - 1.0))
    pose.update(wings(a, a))
    return pose


def pose_windup(f):
    e = 1.0 - (1.0 - min(1.0, f / 7.0)) ** 3          # різкий відхил назад за ~0.23 с
    shake = (1.0 if f % 2 == 0 else -1.0) * smoothstep((f - 5) / 8.0)  # тремтіння наростає
    a = flap(f, 30.0 + 12.0 * e)
    pose = {
        "loc": Vector((0.014 * shake, 0.14 * e, 0.06 * e)),
        "body_center": rot(Y_AXIS, 2.5 * shake) @ rot(X_AXIS, -35.0 * e),
        "head": rot(X_AXIS, 28.0 * e),                  # шолом нахилено вперед
        "helmet_plume": rot(X_AXIS, -15.0 * e + 5.0 * shake),
        "abdomen_01": rot(X_AXIS, -40.0 * e),           # черевце підгинається жалом уперед
        "abdomen_02": rot(X_AXIS, -45.0 * e),
        "stinger": rot(X_AXIS, -25.0 * e),
        "aggro": 0.0 if f < 3 else 1.15 + 0.12 * math.sin(2.0 * math.pi * f / 6.0),
    }
    for side in ("L", "R"):
        pose[f"arm.{side}"] = rot(X_AXIS, 40.0 * e)
        pose[f"leg.{side}"] = rot(X_AXIS, 35.0 * e)
    pose.update(wings(a, a))
    return pose


def pose_dash(f):
    buzz = math.sin(2.0 * math.pi * f / 5.0)
    a = flap(f, 8.0)
    pose = {
        "loc": Vector((0.0, 0.0, 0.02 * buzz)),
        "body_center": rot(X_AXIS, DASH_PITCH + 2.0 * buzz),  # тіло в струну, жало веде
        "head": rot(X_AXIS, 12.0),
        "helmet_plume": rot(X_AXIS, 30.0 + 5.0 * buzz),
        "aggro": 1.2,
    }
    for side in ("L", "R"):
        pose[f"arm.{side}"] = rot(X_AXIS, 100.0)       # лапки притиснуті до черевця
        pose[f"leg.{side}"] = rot(X_AXIS, 55.0)
    pose.update(wings(a, a, sweep=-40.0))
    return pose


def stuck_tip():
    return Vector((0.0, 0.0, STUCK_TIP_Z))


def pose_stuck(f):
    ph = 2.0 * math.pi * f / 60.0
    sway = 14.0 * math.sin(2.0 * ph) + 4.0 * math.sin(6.0 * ph)   # вправо-вліво
    twist = 8.0 * math.sin(4.0 * ph + 1.0)
    pull = max(0.0, math.sin(4.0 * ph)) ** 2                      # ривки «висмикнути»
    q = rot(Y_AXIS, sway) @ rot(X_AXIS, STUCK_PITCH) @ rot(Y_AXIS, twist)
    k = f % 60
    pose = {
        "loc": pinned_center(q, stuck_tip()) - (q @ Y_AXIS) * 0.035 * pull,
        "body_center": q,
        "head": rot(Z_AXIS, 10.0 * math.sin(4.0 * ph + 0.5)) @ rot(X_AXIS, -10.0 + 8.0 * math.sin(8.0 * ph)),
        "helmet_plume": rot(Y_AXIS, -1.2 * sway),
        "abdomen_01": rot(Z_AXIS, -0.5 * sway) @ rot(X_AXIS, 10.0 * pull),
        "abdomen_02": rot(Z_AXIS, -0.4 * sway) @ rot(X_AXIS, 8.0 * pull),
        "arm.L": rot(X_AXIS, 30.0 * math.sin(8.0 * ph)),
        "arm.R": rot(X_AXIS, -30.0 * math.sin(8.0 * ph)),
        "leg.L": rot(X_AXIS, 35.0 * math.sin(8.0 * ph + 1.5)),
        "leg.R": rot(X_AXIS, -35.0 * math.sin(8.0 * ph + 1.5)),
        "aggro": 0.0,
    }
    pose.update(wings(STUCK_WING_SPLAY + flap(f, 8.0) + 14.0 * noise(1.0, k),
                      STUCK_WING_SPLAY + flap(f, 8.0) + 14.0 * noise(2.0, k),
                      sweep=STUCK_WING_SWEEP + 6.0 * noise(3.0, k)))
    return pose


def pose_recover(f):
    strain_frames, flip_end = 6, 22
    s = min(1.0, f / strain_frames)
    shiver = (1.0 if f % 2 == 0 else -1.0) * 4.0 * s
    q_strain = rot(Y_AXIS, shiver if f <= strain_frames else 0.0) @ rot(X_AXIS, STUCK_PITCH)
    strain_loc = pinned_center(q_strain, stuck_tip()) - (q_strain @ Y_AXIS) * 0.08 * s * s
    pose = {"aggro": 0.0}
    if f <= strain_frames:                              # тягне жало із зусиллям
        pose["loc"] = strain_loc
        pose["body_center"] = q_strain
        pose["abdomen_01"] = rot(X_AXIS, -12.0 * s)
        a = flap(f, 20.0 + 18.0 * s)
        arc, u = 0.0, 0.0
    else:                                               # зворотне сальто у бойову стійку
        u = smoothstep((f - strain_frames) / (flip_end - strain_frames))
        arc = math.sin(math.pi * u)
        pose["loc"] = strain_loc.lerp(Vector(), u) + Vector((0.0, 0.25 * arc, 0.30 * arc))
        if f > flip_end:
            pose["loc"] += Vector((0.0, 0.0, 0.04 * math.sin(math.pi * (f - flip_end) / 2.0)))
        pose["body_center"] = rot(X_AXIS, STUCK_PITCH + (-360.0 - STUCK_PITCH) * u)
        pose["abdomen_01"] = rot(X_AXIS, -25.0 * arc)
        pose["abdomen_02"] = rot(X_AXIS, -20.0 * arc)
        pose["head"] = rot(X_AXIS, 15.0 * arc)
        a = flap(f, 38.0)
    for side in ("L", "R"):
        pose[f"arm.{side}"] = rot(X_AXIS, 60.0 * arc)
        pose[f"leg.{side}"] = rot(X_AXIS, 60.0 * arc)
    a += STUCK_WING_SPLAY * (1.0 - u)
    pose.update(wings(a, a, sweep=STUCK_WING_SWEEP * (1.0 - u)))
    return pose


POSE_FUNCS = {
    "State1_Idle_Hover": pose_idle,
    "State2_Red_Windup": pose_windup,
    "State3_Dash_Attack": pose_dash,
    "State4_Stuck_Vulnerable": pose_stuck,
    "State5_Recover_Return": pose_recover,
}
HIDDEN = 0.001  # масштаб «вимкненого» ока


def bake_clip(arm_obj, name, frames):
    """Ключ на кожному кадрі 0..frames -> тривалість у glTF рівно frames / FPS."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm_obj.animation_data.action = action
    rest = {b.name: b.matrix_local.to_3x3() for b in arm_obj.data.bones}
    animated = [n for n in BONES if n != "root"]
    previous = {}
    for f in range(frames + 1):
        pose = POSE_FUNCS[name](f)
        for bone_name in animated:
            pb = arm_obj.pose.bones[bone_name]
            m = rest[bone_name]
            mq = m.to_quaternion()
            q = mq.inverted() @ pose.get(bone_name, IDENTITY) @ mq   # осі арматури -> локальні осі кістки
            if bone_name in previous and previous[bone_name].dot(q) < 0.0:
                q.negate()                                           # найкоротший шлях між ключами
            previous[bone_name] = q.copy()
            pb.rotation_quaternion = q
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f)
            if bone_name == "body_center":
                pb.location = m.inverted() @ pose["loc"]
                pb.keyframe_insert(data_path="location", frame=f)
            if bone_name in ("eyes_calm", "eyes_aggro"):
                aggro = pose["aggro"]
                if bone_name == "eyes_aggro":
                    k = aggro if aggro > 0.0 else 1.0     # у спокої червоні очі сховані під помаранчевими
                else:
                    k = HIDDEN if aggro > 0.0 else 1.0
                pb.scale = (k, k, k)
                pb.keyframe_insert(data_path="scale", frame=f)

    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    track.mute = (name != CLIPS[0][0])
    arm_obj.animation_data.action = None


def build_animations(arm_obj):
    bpy.context.scene.render.fps = FPS
    arm_obj.animation_data_create()
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    for name, frames, _loop in CLIPS:
        bake_clip(arm_obj, name, frames)
    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = IDENTITY
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


# ==============================================================================
# 5. ЗБІРКА ТА ЕКСПОРТ GLB
# ==============================================================================

def main():
    clear_scene()
    col = bpy.data.collections.new("COL_BeeKnight")
    bpy.context.scene.collection.children.link(col)

    mesh_obj = build_mesh(create_materials(), col)
    arm_obj = build_rig(col)
    apply_transforms_and_skin(mesh_obj, arm_obj)
    build_animations(arm_obj)

    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = max(frames for _n, frames, _l in CLIPS)

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)
    filepath = os.path.join(out_dir, OUT_NAME)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_def_bones=True,
    )
    print(f"[BeeKnight] Експортовано GLB: {filepath}")


if __name__ == "__main__":
    main()
