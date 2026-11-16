"""Сюжетні об'єкти світу «Останній ведмідь»: казан-Джерело, золотий ключ-серце, портальний тюльпан.

Запуск (Blender 4.x / 5.x):
    blender --background --python tools/props/build_story_props.py
    blender --background --python tools/props/build_story_props.py -- --blend /tmp/story_props.blend

Результат (glTF 2.0, Y-up, 30 FPS, по одному файлу на префаб):
    public/models/cauldron-source.glb   Rig_Cauldron   Cauldron_Bubble_Idle / Cauldron_Hit_Shake / Cauldron_Shatter
    public/models/heart-key.glb         Rig_Key        Key_Float_Spin
    public/models/tulip-portal.glb      Rig_Tulip      Tulip_Closed_Idle / Tulip_Bloom_Open

ПІВОТИ ТА ХІТБОКСИ (метри; Blender Z-up -> у glTF/Three.js вісь Z стає Y)

  Purple_Cauldron_Source   півот: центр опори на землі (0, 0, 0)
      габарит        1.2 x 1.2 x 1.0
      колайдер       циліндр r = 0.60, h = 1.0, центр на висоті 0.5
      зона удару     сфера r = 0.95 з центром на висоті 0.5
      ключ вилітає   з висоти 0.5 до 1.45 над півотом (кістка Key)
      тріщини        меші Crack_Stage_1..3 — гра вмикає їх через .visible (усі сховати на старті)

  Golden_Heart_Key         півот: геометричний центр ключа (0, 0, 0), ключ вертикальний, серце вгорі
      габарит        0.33 x 0.07 x 0.60
      підбирання     сфера r = 0.45 навколо півота
      ставити        на висоті ~1.45 над точкою, де стояв казан (кінець Cauldron_Shatter)

  Tulip_Portal_Flower      півот: основа стебла на землі (0, 0, 0)
      габарит        закритий 0.85 x 0.85 x 2.2; відкритий ~1.7 x 1.7 x 2.0
      колайдер       циліндр стебла r = 0.12, h = 1.2
      тригер порталу сфера r = 0.6 з центром на висоті 1.52 (портальне ядро, кістка Core)

Ті самі числа записані в extras кореневого вузла кожного GLB (userData в Three.js).
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Quaternion

# ==============================================================================
# 0. НАЛАШТУВАННЯ
# ==============================================================================

FPS = 30
TRI_BUDGET = (1500, 3000)
X_AXIS, Y_AXIS, Z_AXIS = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
IDENTITY = Quaternion()
HIDDEN = 0.001  # масштаб «вимкненої» частини (нуль ламає матриці скіна)

# ключ -> (назва, HEX, metallic, roughness, emission HEX, сила, двобічний, колір з вершин)
MATERIALS = {
    "iron": ("MAT_Cauldron_Iron", "#26282E", 0.60, 0.55, None, 0.0, True, False),
    "iron_patch": ("MAT_Cauldron_Patch", "#4A4E5A", 0.60, 0.50, None, 0.0, True, False),
    "potion": ("MAT_Potion_Purple", "#A63DFF", 0.0, 0.35, "#A63DFF", 3.0, False, False),
    "foam": ("MAT_Potion_Bubble", "#C98AFF", 0.0, 0.30, "#C98AFF", 3.0, False, False),
    "crack": ("MAT_Crack_Glow", "#D9A6FF", 0.0, 0.40, "#C070FF", 4.0, True, False),
    "gold": ("MAT_Key_Gold", "#FFD026", 0.95, 0.25, "#FFAA00", 0.6, False, False),
    "stem": ("MAT_Tulip_Stem", "#2E7D32", 0.0, 0.70, None, 0.0, False, False),
    "leaf": ("MAT_Tulip_Leaf", "#2E7D32", 0.0, 0.70, None, 0.0, True, False),
    "petal": ("MAT_Tulip_Petal", "#FFFFFF", 0.0, 0.60, None, 0.0, True, True),
    "core": ("MAT_Portal_Core", "#66F0FF", 0.0, 0.30, "#66F0FF", 3.5, False, False),
}
PETAL_BASE_HEX, PETAL_TIP_HEX = "#FF5E8E", "#FFC857"
MATS = {}


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
    for key, (name, color, metallic, roughness, emission, strength, double_sided, vertex_color) in MATERIALS.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.use_backface_culling = not double_sided      # -> doubleSided у glTF
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba(color))
        set_bsdf_socket(bsdf, ["Metallic"], metallic)
        set_bsdf_socket(bsdf, ["Roughness"], roughness)
        if emission:
            set_bsdf_socket(bsdf, ["Emission Color", "Emission"], hex_to_rgba(emission))
            set_bsdf_socket(bsdf, ["Emission Strength"], strength)
        if vertex_color:                                  # градієнт пелюсток -> COLOR_0
            node = mat.node_tree.nodes.new("ShaderNodeVertexColor")
            node.layer_name = "Col"
            mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
        MATS[key] = mat


# ==============================================================================
# 2. КОНСТРУКТОР МЕША (ваги пишуться одразу під час побудови)
# ==============================================================================

def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3.0 - 2.0 * x)


def noise(seed):
    v = math.sin(seed * 12.9898 + 4.1414) * 43758.5453
    return v - math.floor(v)          # 0..1


def curve(table, x):
    """Гладка (Catmull-Rom) інтерполяція таблиці ((x0, y0), (x1, y1), ...)."""
    xs = [p[0] for p in table]
    ys = [p[1] for p in table]
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    k = max(i for i in range(len(xs) - 1) if xs[i] <= x)
    t = (x - xs[k]) / (xs[k + 1] - xs[k])
    y0 = ys[k - 1] if k > 0 else 2 * ys[k] - ys[k + 1]
    y3 = ys[k + 2] if k + 2 < len(ys) else 2 * ys[k + 1] - ys[k]
    y1, y2 = ys[k], ys[k + 1]
    return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t * t + (-y0 + 3 * y1 - 3 * y2 + y3) * t ** 3)


class Part:
    def __init__(self, name, bones):
        self.name = name
        self.bones = list(bones)
        self.group = {b: i for i, b in enumerate(self.bones)}
        self.bm = bmesh.new()
        self.layer = self.bm.verts.layers.deform.verify()   # шар ваг — до створення вершин
        self.mat_keys = []
        self.normals = {}    # BMVert -> власна нормаль (щоб шви між уламками не було видно)
        self.colors = {}     # BMVert -> лінійний RGBA

    def mat(self, key):
        if key not in self.mat_keys:
            self.mat_keys.append(key)
        return self.mat_keys.index(key)

    def weight(self, verts, weights):
        for v in verts:
            for name, w in weights.items():
                if w > 0.0:
                    v[self.layer][self.group[name]] = w

    def paint(self, faces, key, smooth=True):
        index = self.mat(key)
        for f in faces:
            f.material_index = index
            f.smooth = smooth

    def fix(self, faces):
        """Нормалі назовні — лише для замкнених тіл."""
        bmesh.ops.recalc_face_normals(self.bm, faces=list(faces))

    def faces_of(self, verts):
        return list({f for v in verts for f in v.link_faces})

    # ---------------------------------------------------------------- примітиви
    def lathe(self, profile, segs, key, origin=(0.0, 0.0, 0.0), closed=True):
        """Тіло обертання навколо Z. profile: (z, r) знизу вгору; r = 0 -> полюс."""
        o = Vector(origin)
        rings = []
        for z, r in profile:
            if r <= 1e-9:
                rings.append([self.bm.verts.new(o + Vector((0.0, 0.0, z)))])
            else:
                rings.append([self.bm.verts.new(o + Vector((r * math.cos(2 * math.pi * s / segs), r * math.sin(2 * math.pi * s / segs), z)))
                              for s in range(segs)])
        faces = []
        for a, b in zip(rings, rings[1:]):
            for s in range(segs):
                ns = (s + 1) % segs
                if len(a) == 1 and len(b) == 1:
                    continue
                if len(a) == 1:
                    faces.append(self.bm.faces.new((a[0], b[ns], b[s])))
                elif len(b) == 1:
                    faces.append(self.bm.faces.new((a[s], a[ns], b[0])))
                else:
                    faces.append(self.bm.faces.new((a[s], a[ns], b[ns], b[s])))
        self.paint(faces, key)
        if closed:
            self.fix(faces)
        return rings, faces

    def tube(self, points, radii, segs, key):
        """Трубка вздовж ламаної з заглушками."""
        pts = [Vector(p) for p in points]
        axis = (pts[-1] - pts[0]).normalized()
        ref = Y_AXIS if abs(axis.dot(Y_AXIS)) < 0.9 else X_AXIS
        side = axis.cross(ref).normalized()
        ortho = side.cross(axis).normalized()
        rings = [[self.bm.verts.new(p + (side * math.cos(2 * math.pi * s / segs) + ortho * math.sin(2 * math.pi * s / segs)) * r)
                  for s in range(segs)] for p, r in zip(pts, radii)]
        faces = []
        for a, b in zip(rings, rings[1:]):
            for s in range(segs):
                ns = (s + 1) % segs
                faces.append(self.bm.faces.new((a[s], a[ns], b[ns], b[s])))
        caps = []
        for ring, p in ((rings[0], pts[0]), (rings[-1], pts[-1])):
            vc = self.bm.verts.new(p)
            caps.append(vc)
            for s in range(segs):
                faces.append(self.bm.faces.new((ring[s], ring[(s + 1) % segs], vc)))
        self.paint(faces, key)
        self.fix(faces)
        return [v for ring in rings for v in ring] + caps

    def sweep(self, points, frames, r1, r2, sides, key):
        """Замкнене кільце: переріз-еліпс (r1 уздовж n, r2 уздовж b) тягнеться по замкненій кривій."""
        rings = []
        for p, (n, b) in zip(points, frames):
            rings.append([self.bm.verts.new(Vector(p) + n * (math.cos(2 * math.pi * s / sides) * r1) + b * (math.sin(2 * math.pi * s / sides) * r2))
                          for s in range(sides)])
        faces = []
        for k, a in enumerate(rings):
            b = rings[(k + 1) % len(rings)]
            for s in range(sides):
                ns = (s + 1) % sides
                faces.append(self.bm.faces.new((a[s], a[ns], b[ns], b[s])))
        self.paint(faces, key)
        self.fix(faces)
        return [v for ring in rings for v in ring]

    def torus(self, center, u, v, major, minor, segs, sides, key):
        """Тор у площині (u, v)."""
        c = Vector(center)
        w = u.cross(v).normalized()
        pts, frames = [], []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            radial = u * math.cos(a) + v * math.sin(a)
            pts.append(c + radial * major)
            frames.append((radial, w))
        return self.sweep(pts, frames, minor, minor, sides, key)

    def sphere(self, center, radii, segs, rings, key):
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=1.0)
        verts = ret['verts']
        c = Vector(center)
        for v in verts:
            v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + c
        self.paint(self.faces_of(verts), key)
        return verts

    def ribbon(self, points, normals, widths, offset, key):
        """Стрічка, що лежить на поверхні (світні тріщини)."""
        rows = []
        for k, (p, n, w) in enumerate(zip(points, normals, widths)):
            t = (points[min(k + 1, len(points) - 1)] - points[max(k - 1, 0)]).normalized()
            side = n.cross(t).normalized()
            rows.append((self.bm.verts.new(p + n * offset - side * (w / 2)), self.bm.verts.new(p + n * offset + side * (w / 2))))
        faces = [self.bm.faces.new((a[0], a[1], b[1], b[0])) for a, b in zip(rows, rows[1:])]
        self.paint(faces, key)
        return [v for row in rows for v in row]

    # ---------------------------------------------------------------- результат
    def finish(self, collection):
        mesh = bpy.data.meshes.new(self.name + "_Data")
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        for key in self.mat_keys:
            mesh.materials.append(MATS[key])
        for name in self.bones:
            obj.vertex_groups.new(name=name)
        self.bm.verts.index_update()
        normals = {v.index: n for v, n in self.normals.items()}
        colors = {v.index: c for v, c in self.colors.items()}
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        if colors:
            attr = mesh.color_attributes.new("Col", 'FLOAT_COLOR', 'POINT')
            for i in range(len(mesh.vertices)):
                attr.data[i].color = colors.get(i, (1.0, 1.0, 1.0, 1.0))
            mesh.color_attributes.active_color = attr
            mesh.color_attributes.render_color_index = 0
        if normals:
            mesh.normals_split_custom_set_from_vertices(
                [tuple(normals[i]) if i in normals else tuple(mesh.vertices[i].normal) for i in range(len(mesh.vertices))])
        obj["tris"] = sum(len(p.vertices) - 2 for p in mesh.polygons)
        return obj


# ==============================================================================
# 3. СКЕЛЕТ, СКІНІНГ, ЗАПІКАННЯ КЛІПІВ
# ==============================================================================

def build_rig(name, collection, bones):
    """bones: (назва, head, tail, батько | None, connected)."""
    arm_data = bpy.data.armatures.new(name + "_Data")
    arm_obj = bpy.data.objects.new(name, arm_data)
    collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    for bone_name, head, tail, parent, connected in bones:
        b = eb.new(bone_name)
        b.head, b.tail = Vector(head), Vector(tail)
        b.use_deform = True
        if parent:
            b.parent = eb[parent]
            b.use_connect = connected
    bpy.ops.object.mode_set(mode='OBJECT')
    arm_obj.animation_data_create()
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return arm_obj


def up_bone(name, head, parent, length=0.15):
    h = Vector(head)
    return (name, h, h + Z_AXIS * length, parent, False)


def skin(mesh_obj, arm_obj):
    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj


def rot(axis, degrees):
    return Quaternion(axis, math.radians(degrees))


def P(loc=(0.0, 0.0, 0.0), rot=IDENTITY, scale=1.0):
    """Поза кістки в осях арматури. scale: число або (радіальний, осьовий) для вертикальних кісток."""
    return (Vector(loc), rot, scale)


def bake_clip(arm_obj, name, frames, pose_fn, first):
    """Ключ на кожному кадрі 0..frames для всіх кісток -> тривалість у glTF рівно frames / FPS."""
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm_obj.animation_data.action = action
    rest = {b.name: b.matrix_local.to_3x3() for b in arm_obj.data.bones}
    previous = {}
    default = P()
    for f in range(frames + 1):
        pose = pose_fn(f)
        unknown = set(pose) - set(rest)
        if unknown:
            raise RuntimeError(f"{name}: немає кісток {sorted(unknown)}")
        for pb in arm_obj.pose.bones:
            if pb.name == "Root":
                continue
            loc, q_arm, scale = pose.get(pb.name, default)
            m = rest[pb.name]
            mq = m.to_quaternion()
            q = mq.inverted() @ q_arm @ mq                      # осі арматури -> локальні осі кістки
            if pb.name in previous and previous[pb.name].dot(q) < 0.0:
                q.negate()                                      # найкоротший шлях між ключами
            previous[pb.name] = q.copy()
            pb.rotation_quaternion = q
            pb.location = m.inverted() @ loc
            pb.scale = (scale[0], scale[1], scale[0]) if isinstance(scale, tuple) else (scale, scale, scale)
            for path in ("location", "rotation_quaternion", "scale"):
                pb.keyframe_insert(data_path=path, frame=f)

    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    track.mute = not first
    arm_obj.animation_data.action = None


def bake_all(arm_obj, clips):
    for i, (name, frames, pose_fn) in enumerate(clips):
        bake_clip(arm_obj, name, frames, pose_fn, i == 0)
    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = IDENTITY
        pb.location = (0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)


# ==============================================================================
# 4. ЗОЛОТИЙ КЛЮЧ-СЕРЦЕ (геометрія спільна для префаба і для ключа всередині казана)
# ==============================================================================

KEY_LENGTH = 0.6
KEY_RES_HIGH = (56, 10, 16)   # точок по контуру серця, сторін перерізу, сегментів стрижня
KEY_RES_LOW = (24, 5, 8)
KEY_BIT = ((0.015, -0.165), (0.130, -0.165), (0.130, -0.200), (0.095, -0.200), (0.095, -0.222), (0.130, -0.222),
           (0.130, -0.285), (0.085, -0.285), (0.085, -0.262), (0.050, -0.262), (0.050, -0.285), (0.015, -0.285))
KEY_SHAFT = ((-0.300, 0.0), (-0.297, 0.016), (-0.288, 0.024), (-0.277, 0.020), (-0.020, 0.020), (-0.010, 0.031),
             (0.005, 0.036), (0.020, 0.031), (0.030, 0.022), (0.040, 0.030), (0.052, 0.034), (0.064, 0.026), (0.075, 0.0))


def add_key(part, origin, bone, res):
    """Вертикальний ключ: серце вгорі (+Z), борідка внизу, площина ключа — XZ. origin — центр ключа."""
    n_ring, n_side, n_shaft = res
    o = Vector(origin)
    verts = []
    r1, r2, bow_h = 0.030, 0.034, 0.235

    # --- Ручка-серце: товсте кільце по контуру серця + тонка вставка всередині ---
    raw = []
    for k in range(n_ring):
        t = 2 * math.pi * k / n_ring
        raw.append((16 * math.sin(t) ** 3, 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)))
    z_min, z_max = min(p[1] for p in raw), max(p[1] for p in raw)
    s = bow_h / (z_max - z_min)
    z_shift = (KEY_LENGTH / 2 - r1) - z_max * s           # верх кільця рівно на +0.30
    pts = [o + Vector((x * s, 0.0, z * s + z_shift)) for x, z in raw]
    frames = []
    for k in range(n_ring):
        t = (pts[(k + 1) % n_ring] - pts[k - 1]).normalized()
        frames.append((Vector((t.z, 0.0, -t.x)), Y_AXIS))
    verts += part.sweep(pts, frames, r1, r2, n_side, "gold")

    web = []
    for y in (-0.012, 0.012):
        centre = part.bm.verts.new(o + Vector((0.0, y, z_shift)))
        rim = [part.bm.verts.new(p + Vector((0.0, y, 0.0))) for p in pts]
        web += [part.bm.faces.new((centre, rim[k], rim[(k + 1) % n_ring])) for k in range(n_ring)]
        verts += [centre] + rim
    part.paint(web, "gold")
    part.fix(web)

    # --- Стрижень з комірцями ---
    rings, _faces = part.lathe(KEY_SHAFT, n_shaft, "gold", origin=o)
    verts += [v for ring in rings for v in ring]

    # --- Фігурна борідка ---
    front = [part.bm.verts.new(o + Vector((x, -0.014, z))) for x, z in KEY_BIT]
    back = [part.bm.verts.new(o + Vector((x, 0.014, z))) for x, z in KEY_BIT]
    caps = [part.bm.faces.new(front), part.bm.faces.new(list(reversed(back)))]
    n = len(KEY_BIT)
    sides = [part.bm.faces.new((front[k], front[(k + 1) % n], back[(k + 1) % n], back[k])) for k in range(n)]
    tri = bmesh.ops.triangulate(part.bm, faces=caps)['faces']
    part.paint(tri + sides, "gold", smooth=False)
    part.fix(tri + sides)
    verts += front + back

    part.weight(verts, {bone: 1.0})


def key_float_pose(f):
    ph = 2.0 * math.pi * f / 60.0
    return {"Float": P(loc=(0.0, 0.0, 0.05 * math.sin(ph)),
                       rot=rot(Z_AXIS, 360.0 * f / 60.0) @ rot(X_AXIS, 4.0 * math.sin(ph + 1.0)))}


def build_key(collection):
    part = Part("Golden_Heart_Key", ["Root", "Float"])
    add_key(part, (0.0, 0.0, 0.0), "Float", KEY_RES_HIGH)
    mesh_obj = part.finish(collection)
    arm = build_rig("Rig_Key", collection, [up_bone("Root", (0, 0, 0), None), up_bone("Float", (0, 0, 0), "Root", 0.1)])
    skin(mesh_obj, arm)
    bake_all(arm, [("Key_Float_Spin", 60, key_float_pose)])
    arm["pivot"] = "key center, heart up"
    arm["size_xyz"] = [0.33, 0.60, 0.07]
    arm["pickup_sphere_radius"] = 0.45
    return arm, [mesh_obj]


# ==============================================================================
# 5. ФІОЛЕТОВИЙ КАЗАН-ДЖЕРЕЛО
# ==============================================================================

C_SEG = 24
# (z, r) зовнішнього профілю знизу вгору: черевце -> шийка -> обідок -> внутрішня губа
C_PROFILE = ((0.115, 0.22), (0.17, 0.40), (0.27, 0.52), (0.40, 0.585), (0.52, 0.60), (0.64, 0.575), (0.75, 0.52),
             (0.83, 0.47), (0.87, 0.475), (0.90, 0.53), (0.95, 0.555), (1.00, 0.53), (1.00, 0.46), (0.93, 0.43))
C_ROWS = len(C_PROFILE) - 1
# Зсув кожного ряду вершин уздовж кола (у частках стовпчика): вертикальні шви стають ламаними,
# як тріщини, а топологія сітки і форма казана не змінюються.
C_SKEW = (0.0, 0.30, -0.28, 0.34, -0.30, 0.32, -0.34, 0.26, -0.15, 0.0, 0.0, 0.0, 0.0, 0.0)
C_BASE_TOP = (3, 2, 3, 2)                # зубчастий край чаші, що лишається стояти (крок — 2 стовпчики)
C_SHARDS = [f"Shard_{i:02d}" for i in range(1, 13)]
C_BUBBLES = ((0.00, 0.0, 0.085), (0.25, 40.0, 0.060), (0.30, 160.0, 0.070), (0.22, 260.0, 0.050), (0.35, 320.0, 0.065), (0.34, 100.0, 0.045))
C_POTION_Z = 0.86
C_KEY_REST = Vector((0.0, 0.0, 0.50))
C_KEY_RISE = 0.95
C_STATE = {}   # центри уламків для ригу й анімацій


def c_point(i, j):
    z, r = C_PROFILE[i]
    a = 2 * math.pi * (j + C_SKEW[i]) / C_SEG
    return Vector((r * math.cos(a), r * math.sin(a), z))


def c_normal(i, j):
    z0, r0 = C_PROFILE[max(i - 1, 0)]
    z1, r1 = C_PROFILE[min(i + 1, C_ROWS)]
    n = Vector((z1 - z0, -(r1 - r0))).normalized()   # (радіальна, вертикальна) складові
    a = 2 * math.pi * (j + C_SKEW[i]) / C_SEG
    return Vector((n.x * math.cos(a), n.x * math.sin(a), n.y))


def c_radius(z):
    return curve([(pz, pr) for pz, pr in C_PROFILE[:9]], z)


def c_band_row(j):
    return 6 if (j % 8) < 4 else 7       # межа між нижнім і верхнім поясом уламків


def c_shard_of(i, j):
    """Якій кістці належить клітинка сітки (ряд i, стовпчик j): 3 сегменти по 4 уламки + чаша."""
    j %= C_SEG
    if i < C_BASE_TOP[(j // 2) % 4]:
        return "Base"
    sector, c = divmod(j, 8)
    if i < c_band_row(j):
        piece = 0 if c < 4 else 1
    else:
        piece = 2 if c < 3 else 3
    return C_SHARDS[sector * 4 + piece]


def c_surface(angle_deg, z, lift):
    a = math.radians(angle_deg)
    radial = Vector((math.cos(a), math.sin(a), 0.0))
    return radial * (c_radius(z) + lift) + Z_AXIS * z, radial


def build_cauldron(collection):
    bones = ["Root", "Body", "Base"] + C_SHARDS + ["Cracks", "Potion"] + [f"Bubble_{i + 1}" for i in range(len(C_BUBBLES))] + ["Key"]
    part = Part("Purple_Cauldron_Source", bones)
    bm = part.bm

    # --- Корпус: кожен уламок має власні вершини, нормалі — аналітичні, тож шви не видно до удару ---
    cache = {}
    members = {name: [] for name in ["Base"] + C_SHARDS}

    def vert(owner, i, j):
        k = (owner, i, j % C_SEG)
        if k not in cache:
            v = bm.verts.new(c_point(i, j))
            part.normals[v] = c_normal(i, j)
            part.weight([v], {owner: 1.0})
            members[owner].append(v)
            cache[k] = v
        return cache[k]

    body = []
    for i in range(C_ROWS):
        for j in range(C_SEG):
            owner = c_shard_of(i, j)
            body.append(bm.faces.new((vert(owner, i, j), vert(owner, i, j + 1), vert(owner, i + 1, j + 1), vert(owner, i + 1, j))))
    pole = bm.verts.new((0.0, 0.0, 0.10))
    part.normals[pole] = -Z_AXIS
    part.weight([pole], {"Base": 1.0})
    for j in range(C_SEG):
        body.append(bm.faces.new((pole, vert("Base", 0, j + 1), vert("Base", 0, j))))
    part.paint(body, "iron")
    for name in C_SHARDS:
        if not members[name]:
            raise RuntimeError(f"Порожній уламок {name}")
    C_STATE["centers"] = {name: sum((v.co for v in vs), Vector()) / len(vs) for name, vs in members.items() if name != "Base"}

    # --- Три ніжки ---
    for angle in (90.0, 210.0, 330.0):
        a = math.radians(angle)
        radial = Vector((math.cos(a), math.sin(a), 0.0))
        leg = part.tube([radial * 0.36 + Z_AXIS * 0.24, radial * 0.43 + Z_AXIS * 0.10, radial * 0.47], [0.078, 0.058, 0.046], 6, "iron")
        for v in leg:
            v.co.z = max(v.co.z, 0.0)                    # підошва рівно на землі
        part.weight(leg, {"Base": 1.0})

    # --- Кільця-ручки ---
    for angle in (30.0, 210.0):
        centre, radial = c_surface(angle, 0.775, 0.035)
        tangent = Vector((-radial.y, radial.x, 0.0))
        ring = part.torus(centre - Z_AXIS * 0.05, tangent, Z_AXIS, 0.075, 0.019, 10, 5, "iron")
        lug = part.sphere(centre + Z_AXIS * 0.03 - radial * 0.02, (0.035, 0.035, 0.03), 6, 4, "iron")
        part.weight(ring + lug, {c_shard_of(7, round(angle / 360.0 * C_SEG)): 1.0})

    # --- Латки із заклепками ---
    for angle, half_w, z0, z1 in ((75.0, 12.0, 0.36, 0.60), (192.0, 11.0, 0.40, 0.62)):
        grid = [[bm.verts.new(c_surface(angle + half_w * u, z0 + (z1 - z0) * v / 3.0, 0.012 - 0.008 * abs(u) ** 3)[0]) for u in (-1.0, -0.33, 0.33, 1.0)]
                for v in range(4)]
        faces = [bm.faces.new((grid[v][u], grid[v][u + 1], grid[v + 1][u + 1], grid[v + 1][u])) for v in range(3) for u in range(3)]
        part.paint(faces, "iron_patch")
        verts = [v for row in grid for v in row]
        for u in (-0.78, 0.78):
            for z in (z0 + 0.035, z1 - 0.035):
                p, radial = c_surface(angle + half_w * u, z, 0.016)
                verts += part.sphere(p, (0.016, 0.016, 0.016), 5, 3, "iron")
        part.weight(verts, {c_shard_of(4, round(angle / 360.0 * C_SEG)): 1.0})

    # --- Зілля: замкнене тіло, що заповнює казан (його видно крізь розхідні тріщини) ---
    potion_profile = [(0.13, 0.0)] + [(z, min(c_radius(z) - 0.03, 0.44)) for z in (0.17, 0.27, 0.40, 0.52, 0.64, 0.75, C_POTION_Z)]
    potion_profile += [(C_POTION_Z, 0.24), (C_POTION_Z + 0.012, 0.0)]
    rings, _faces = part.lathe(potion_profile, 18, "potion")
    for v in rings[-2] + rings[-3]:
        v.co.z += 0.014 * math.cos(3.0 * math.atan2(v.co.y, v.co.x)) * (Vector((v.co.x, v.co.y)).length / 0.44)   # 3 хвилі
    part.weight([v for ring in rings for v in ring], {"Potion": 1.0})

    # --- Бульбашки ---
    for k, (r, angle, size) in enumerate(C_BUBBLES):
        a = math.radians(angle)
        bubble = part.sphere((r * math.cos(a), r * math.sin(a), C_POTION_Z + 0.005), (size, size, size), 8, 5, "foam")
        part.weight(bubble, {f"Bubble_{k + 1}": 1.0})

    # --- Золотий ключ, схований у зіллі (вилітає в Cauldron_Shatter) ---
    add_key(part, C_KEY_REST, "Key", KEY_RES_LOW)

    meshes = [part.finish(collection)]

    # --- Три стадії тріщин: окремі меші, гра вмикає їх після 1-го, 2-го і на початку 3-го удару ---
    for k in range(3):
        crack = Part(f"Crack_Stage_{k + 1}", bones)
        seam = 8 * k
        branches = [
            [(i, seam) for i in range(2, 12)],                   # ламаний шов між сегментами, від чаші до обідка
            [(6, seam + q) for q in range(5)],                   # гілка вздовж зламу праворуч
            [(7, seam - q) for q in range(4)],                   # і ліворуч
            [(4, seam), (4, seam + 1), (3, seam + 2)],           # коротка нижня гілка
        ]
        for b, cells in enumerate(branches):
            n = len(cells)
            # шов звужується до обох кінців, гілка — від шва до кінчика
            widths = [(0.036 * (0.25 + 0.75 * math.sin(math.pi * q / (n - 1)))) if b == 0 else (0.026 * (1.0 - 0.8 * q / (n - 1)))
                      for q in range(n)]
            verts = crack.ribbon([c_point(i, j) for i, j in cells], [c_normal(i, j) for i, j in cells], widths, 0.007, "crack")
            crack.weight(verts, {"Cracks": 1.0})
        meshes.append(crack.finish(collection))

    # --- Риг ---
    spec = [up_bone("Root", (0, 0, 0), None, 0.2), up_bone("Body", (0, 0, 0), "Root", 0.5), up_bone("Base", (0, 0, 0.10), "Body")]
    spec += [up_bone(name, C_STATE["centers"][name], "Body", 0.1) for name in C_SHARDS]
    spec += [up_bone("Cracks", (0, 0, 0.55), "Body"), up_bone("Potion", (0, 0, 0.13), "Body", 0.3)]
    for k, (r, angle, _size) in enumerate(C_BUBBLES):
        a = math.radians(angle)
        spec.append(up_bone(f"Bubble_{k + 1}", (r * math.cos(a), r * math.sin(a), C_POTION_Z), "Body", 0.08))
    spec.append(up_bone("Key", C_KEY_REST, "Root", 0.2))
    arm = build_rig("Rig_Cauldron", collection, spec)
    for obj in meshes:
        skin(obj, arm)
    bake_all(arm, [("Cauldron_Bubble_Idle", 40, cauldron_idle_pose), ("Cauldron_Hit_Shake", 15, cauldron_hit_pose),
                   ("Cauldron_Shatter", 30, cauldron_shatter_pose)])
    arm["pivot"] = "ground center"
    arm["size_xyz"] = [1.2, 1.0, 1.2]
    arm["collider_cylinder_radius_height"] = [0.60, 1.0]
    arm["hit_sphere_radius_center_y"] = [0.95, 0.5]
    arm["key_eject_from_to_y"] = [C_KEY_REST.z, C_KEY_REST.z + C_KEY_RISE]
    return arm, meshes


def shard_dir(name):
    c = C_STATE["centers"][name]
    return Vector((c.x, c.y, 0.0)).normalized()


def cauldron_idle_pose(f):
    ph = 2.0 * math.pi * f / 40.0
    pulse = 0.006 * math.sin(2.0 * ph)
    pose = {
        "Body": P(rot=rot(X_AXIS, 0.5 * math.sin(3.0 * ph)) @ rot(Y_AXIS, 0.5 * math.sin(2.0 * ph + 1.0)), scale=(1.0 + pulse, 1.0 - pulse)),
        # хвилі зілля мають 3-променеву симетрію: поворот на 120° за цикл зациклюється без стрибка
        "Potion": P(rot=rot(Z_AXIS, 120.0 * f / 40.0), scale=(1.0, 1.0 + 0.012 * math.sin(2.0 * ph))),
    }
    for k in range(len(C_BUBBLES)):
        t = (f / 40.0 + k / len(C_BUBBLES)) % 1.0
        if t < 0.78:
            s = 0.15 + 0.85 * smoothstep(t / 0.78)
        elif t < 0.86:
            s = 1.0 + 0.3 * (t - 0.78) / 0.08                 # роздувається перед тим, як луснути
        else:
            s = HIDDEN
        pose[f"Bubble_{k + 1}"] = P(loc=(0.0, 0.0, 0.03 * t), scale=s)
    return pose


def cauldron_hit_pose(f):
    d = (1.0 - f / 15.0) ** 2
    squash = math.sin(math.pi * min(1.0, f / 5.0))
    spread = math.sin(math.pi * min(1.0, f / 13.0)) ** 0.8 * (1.0 - smoothstep((f - 10) / 5.0))
    pose = {
        "Body": P(loc=(0.022 * d * math.sin(2.0 * math.pi * f / 3.0), 0.016 * d * math.sin(2.0 * math.pi * f / 4.0), 0.0),
                  rot=rot(X_AXIS, 9.0 * d * math.sin(2.0 * math.pi * f / 4.5)) @ rot(Y_AXIS, 6.0 * d * math.sin(2.0 * math.pi * f / 3.7)),
                  scale=(1.0 + 0.05 * squash, 1.0 - 0.07 * squash)),
        "Potion": P(rot=rot(X_AXIS, 6.0 * d * math.sin(2.0 * math.pi * f / 5.0)), scale=(1.0, 1.0 + 0.06 * d * abs(math.sin(math.pi * f / 5.0)))),
        "Cracks": P(scale=1.0 + 0.05 * spread),
    }
    for i, name in enumerate(C_SHARDS):                        # тріщини розходяться і сходяться
        amount = 0.040 * spread * (0.5 + 0.5 * noise(i + 1.0))
        pose[name] = P(loc=shard_dir(name) * amount + Z_AXIS * amount * 0.3)
    for k in range(len(C_BUBBLES)):                            # бризки
        up = math.sin(math.pi * f / 15.0)
        pose[f"Bubble_{k + 1}"] = P(loc=(0.0, 0.0, (0.12 + 0.06 * noise(k + 20.0)) * up), scale=max(HIDDEN, 1.1 * d))
    return pose


def cauldron_shatter_pose(f):
    start = 3
    pre = min(1.0, f / start)
    squash = math.sin(math.pi * pre) if f < start else 0.0
    burst = smoothstep((f - start) / 7.0)
    pose = {
        "Body": P(scale=(1.0 + 0.06 * squash, 1.0 - 0.08 * squash)),
        "Base": P(scale=(1.0, 1.0 - 0.08 * math.sin(math.pi * min(1.0, max(0.0, (f - start) / 6.0))))),
        "Cracks": P(scale=1.0 + 0.05 * pre if f <= start else HIDDEN),
        "Potion": P(scale=(max(HIDDEN, (1.0 + 0.3 * burst) * (1.0 - burst)), max(HIDDEN, 1.0 - burst))),
    }
    for k in range(len(C_BUBBLES)):
        pose[f"Bubble_{k + 1}"] = P(loc=(0.0, 0.0, 0.5 * burst), scale=max(HIDDEN, 1.0 - burst))

    for i, name in enumerate(C_SHARDS):
        centre = C_STATE["centers"][name]
        d = shard_dir(name)
        tangent = Vector((-d.y, d.x, 0.0))
        upper = (i % 4) >= 2
        land = (20.0 if upper else 14.0) + 6.0 * noise(i + 3.0)           # кадр приземлення
        reach = (1.15 if upper else 0.85) + 0.30 * noise(i + 7.0)         # відстань від центру
        arc = (0.55 if upper else 0.25) + 0.15 * noise(i + 11.0)
        tumble = (450.0 if upper else 90.0) + 50.0 * (noise(i + 13.0) - 0.4)
        yaw = 80.0 * (noise(i + 17.0) - 0.5)
        if f <= start:
            pose[name] = P(loc=d * 0.02 * pre)
            continue
        u = min(1.0, (f - start) / (land - start))
        side = tangent * 0.25 * (noise(i + 19.0) - 0.5)
        horizontal = (d * reach + side - Vector((centre.x, centre.y, 0.0))) * u + d * 0.02 * (1.0 - u)
        height = (0.07 - centre.z) * u + arc * 4.0 * u * (1.0 - u)
        pose[name] = P(loc=horizontal + Z_AXIS * height, rot=rot(Z_AXIS, yaw * u) @ rot(tangent, tumble * u))

    if f > start:                                                          # золотий ключ злітає вгору
        u = (f - start) / (30.0 - start)
        rise = C_KEY_RISE * (1.0 - (1.0 - u) ** 3) + 0.22 * math.sin(math.pi * min(1.0, u * 1.3)) * (1.0 - u)
        pose["Key"] = P(loc=(0.0, 0.0, rise), rot=rot(Z_AXIS, 720.0 * (1.0 - (1.0 - u) ** 2)))
    return pose


# ==============================================================================
# 6. ПОРТАЛЬНИЙ ТЮЛЬПАН
# ==============================================================================

T_HEIGHT = 2.2
T_BUD_Z = 1.22
T_PETAL_NU, T_PETAL_NV = 8, 10
T_RADIUS = ((0.0, 0.11), (0.15, 0.27), (0.40, 0.40), (0.70, 0.33), (0.90, 0.17), (1.0, 0.05))
T_WIDTH = ((0.0, 0.55), (0.20, 0.90), (0.45, 1.0), (0.75, 0.80), (0.92, 0.42), (1.0, 0.0))
T_HALF_ANGLE = 66.0
T_CORE_Z = T_BUD_Z + 0.30
T_PETALS = [(i, 60.0 * i, i % 2 == 0) for i in range(6)]      # (номер, кут, зовнішня)
T_OPEN = {True: (48.0, 26.0), False: (36.0, 18.0)}             # ° розкриття основи / кінчика
T_LEAVES = (("Leaf_L", 150.0), ("Leaf_R", -30.0))


def petal_bones(i):
    return f"Petal_{i + 1:02d}_Base", f"Petal_{i + 1:02d}_Tip"


def petal_point(angle_deg, outer, u, v):
    r = curve(T_RADIUS, v) * (1.0 if outer else 0.93) + (0.012 if outer else 0.0)
    a = math.radians(angle_deg + u * T_HALF_ANGLE * curve(T_WIDTH, v))
    length = (T_HEIGHT - T_BUD_Z) * (1.0 if outer else 0.97)
    return Vector((r * math.cos(a), r * math.sin(a), T_BUD_Z + length * v))


def leaf_point(angle_deg, s, u):
    a = math.radians(angle_deg)
    radial = Vector((math.cos(a), math.sin(a), 0.0))
    tangent = Vector((-radial.y, radial.x, 0.0))
    width = 0.012 + 0.15 * math.sin(math.pi * s ** 0.7)
    centre = radial * (0.07 + 0.45 * s * s) + Z_AXIS * (0.04 + 0.98 * s - 0.15 * s * s)
    return centre + tangent * (u * width) + radial * (0.05 * abs(u) * math.sin(math.pi * s))   # V-подібний згин


def build_tulip(collection):
    bones = ["Root", "Stem_1", "Stem_2", "Bud", "Core", "Core_Ring"]
    for i, _a, _o in T_PETALS:
        bones += list(petal_bones(i))
    bones += [name for name, _a in T_LEAVES]
    part = Part("Tulip_Portal_Flower", bones)
    bm = part.bm
    base_rgba, tip_rgba = hex_to_rgba(PETAL_BASE_HEX), hex_to_rgba(PETAL_TIP_HEX)

    # --- Світне портальне ядро з кільцем (першим: icosphere перебудовує bmesh і скидає посилання на вершини) ---
    ret = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.165)
    for v in ret['verts']:
        v.co.z += T_CORE_Z
    part.paint(part.faces_of(ret['verts']), "core")
    part.weight(ret['verts'], {"Core": 1.0})
    tilt = rot(X_AXIS, 14.0)
    ring = part.torus((0.0, 0.0, T_CORE_Z), tilt @ X_AXIS, tilt @ Y_AXIS, 0.235, 0.017, 16, 4, "core")
    part.weight(ring, {"Core_Ring": 1.0})

    # --- Товсте стебло ---
    zs = [0.0, 0.03, 0.25, 0.50, 0.75, 1.00, 1.20]
    stem = part.tube([(0.0, 0.0, z) for z in zs], [0.115, 0.092, 0.086, 0.082, 0.078, 0.076, 0.085], 10, "stem")
    for v in stem:
        w = smoothstep((v.co.z - 0.35) / 0.5)
        part.weight([v], {"Stem_1": 1.0 - w, "Stem_2": w})

    # --- Чашечка під бутоном ---
    rings, _faces = part.lathe([(1.13, 0.0), (1.15, 0.09), (1.19, 0.135), (1.24, 0.155), (1.285, 0.13), (1.30, 0.0)], 10, "stem")
    part.weight([v for ring in rings for v in ring], {"Bud": 1.0})

    # --- Листя ---
    for name, angle in T_LEAVES:
        rows = [[bm.verts.new(leaf_point(angle, s / 7.0, u)) for u in (-1.0, -0.5, 0.0, 0.5, 1.0)] for s in range(8)]
        faces = [bm.faces.new((rows[s][u], rows[s][u + 1], rows[s + 1][u + 1], rows[s + 1][u])) for s in range(7) for u in range(4)]
        part.paint(faces, "leaf")
        part.weight([v for row in rows for v in row], {name: 1.0})

    # --- 6 пелюсток: 3 зовнішні + 3 внутрішні, градієнт у кольорі вершин ---
    for i, angle, outer in T_PETALS:
        base_bone, tip_bone = petal_bones(i)
        rows = []
        for r in range(T_PETAL_NV):
            v = r / T_PETAL_NV
            rows.append([(bm.verts.new(petal_point(angle, outer, -1.0 + 2.0 * c / T_PETAL_NU, v)), v) for c in range(T_PETAL_NU + 1)])
        tip = (bm.verts.new(petal_point(angle, outer, 0.0, 1.0)), 1.0)
        faces = []
        for a, b in zip(rows, rows[1:]):
            for c in range(T_PETAL_NU):
                faces.append(bm.faces.new((a[c][0], a[c + 1][0], b[c + 1][0], b[c][0])))
        for c in range(T_PETAL_NU):
            faces.append(bm.faces.new((rows[-1][c][0], rows[-1][c + 1][0], tip[0])))
        part.paint(faces, "petal")
        for vert, v in [item for row in rows for item in row] + [tip]:
            t = v ** 1.2
            part.colors[vert] = tuple(base_rgba[k] + (tip_rgba[k] - base_rgba[k]) * t for k in range(4))
            hold = max(0.0, 1.0 - v / 0.10)                       # низ пелюстки тримається за бутон
            bend = smoothstep((v - 0.30) / 0.35)
            part.weight([vert], {"Bud": hold, base_bone: (1.0 - hold) * (1.0 - bend), tip_bone: (1.0 - hold) * bend})

    mesh_obj = part.finish(collection)

    # --- Риг ---
    spec = [up_bone("Root", (0, 0, 0), None, 0.2),
            ("Stem_1", Vector((0, 0, 0)), Vector((0, 0, 0.6)), "Root", False),
            ("Stem_2", Vector((0, 0, 0.6)), Vector((0, 0, 1.2)), "Stem_1", True),
            up_bone("Bud", (0, 0, 1.2), "Stem_2", 0.25),
            up_bone("Core", (0, 0, T_CORE_Z), "Bud", 0.15),
            up_bone("Core_Ring", (0, 0, T_CORE_Z), "Core", 0.1)]
    for i, angle, outer in T_PETALS:
        base_bone, tip_bone = petal_bones(i)
        mid = petal_point(angle, outer, 0.0, 0.45)
        spec.append((base_bone, petal_point(angle, outer, 0.0, 0.0), mid, "Bud", False))
        spec.append((tip_bone, mid, petal_point(angle, outer, 0.0, 1.0), base_bone, True))
    for name, angle in T_LEAVES:
        spec.append((name, leaf_point(angle, 0.0, 0.0), leaf_point(angle, 1.0, 0.0), "Root", False))
    arm = build_rig("Rig_Tulip", collection, spec)
    skin(mesh_obj, arm)
    bake_all(arm, [("Tulip_Closed_Idle", 60, tulip_idle_pose), ("Tulip_Bloom_Open", 35, tulip_bloom_pose)])
    arm["pivot"] = "ground center (stem base)"
    arm["size_closed_xyz"] = [0.85, T_HEIGHT, 0.85]
    arm["collider_stem_cylinder_radius_height"] = [0.12, 1.2]
    arm["portal_trigger_sphere_radius_center_y"] = [0.6, T_CORE_Z]
    return arm, [mesh_obj]


def tangent_axis(angle_deg):
    """Вісь, поворот навколо якої відхиляє пелюстку/листок назовні від стебла."""
    a = math.radians(angle_deg)
    return Vector((-math.sin(a), math.cos(a), 0.0))


def tulip_idle_pose(f):
    ph = 2.0 * math.pi * f / 60.0
    pose = {
        "Stem_1": P(rot=rot(X_AXIS, 0.8 * math.sin(ph))),
        "Stem_2": P(rot=rot(X_AXIS, 1.0 * math.sin(ph - 0.6)) @ rot(Y_AXIS, 0.6 * math.sin(ph))),
        "Bud": P(scale=1.0 + 0.012 * math.sin(ph)),
        "Core": P(scale=1.0 + 0.06 * math.sin(2.0 * ph)),
        "Core_Ring": P(rot=rot(Z_AXIS, 360.0 * f / 60.0)),
    }
    for i, angle, _outer in T_PETALS:                             # дихання пелюсток
        base_bone, tip_bone = petal_bones(i)
        axis = tangent_axis(angle)
        pose[base_bone] = P(rot=rot(axis, 1.0 + 2.2 * math.sin(ph + 0.5 * i)))
        pose[tip_bone] = P(rot=rot(axis, 1.5 * math.sin(ph + 0.5 * i - 0.8)))
    for k, (name, angle) in enumerate(T_LEAVES):
        pose[name] = P(rot=rot(tangent_axis(angle), 2.0 * math.sin(ph + 1.5 * k)))
    return pose


def ease_out_back(u):
    c1 = 1.0
    c3 = c1 + 1.0
    return 1.0 + c3 * (u - 1.0) ** 3 + c1 * (u - 1.0) ** 2


def tulip_bloom_pose(f):
    brace = math.sin(math.pi * min(1.0, f / 6.0))                 # бутон стискається перед розкриттям
    glow = smoothstep((f - 6) / 22.0)
    pose = {
        "Stem_1": P(scale=(1.0 + 0.03 * brace, 1.0 - 0.03 * brace)),
        "Bud": P(scale=1.0 + 0.04 * math.sin(math.pi * min(1.0, f / 30.0))),
        "Core": P(loc=(0.0, 0.0, 0.10 * glow), scale=0.95 + 0.40 * glow + 0.05 * math.sin(2.0 * math.pi * f / 10.0) * glow),
        "Core_Ring": P(rot=rot(Z_AXIS, 540.0 * smoothstep(f / 35.0)), scale=1.0 + 0.55 * glow),
    }
    for i, angle, outer in T_PETALS:
        base_bone, tip_bone = petal_bones(i)
        axis = tangent_axis(angle)
        delay = (0.0 if outer else 4.0) + 0.5 * i
        u = min(1.0, max(0.0, (f - delay) / 25.0))
        open_base, open_tip = T_OPEN[outer]
        pose[base_bone] = P(rot=rot(axis, open_base * ease_out_back(u) - 3.0 * brace * (1.0 - u)))
        pose[tip_bone] = P(rot=rot(axis, open_tip * smoothstep((u - 0.15) / 0.85)))
    for name, angle in T_LEAVES:
        pose[name] = P(rot=rot(tangent_axis(angle), 10.0 * smoothstep(f / 30.0)))
    return pose


# ==============================================================================
# 7. ЗБІРКА ТА ПАКЕТНИЙ ЕКСПОРТ У 3 GLB
# ==============================================================================

PREFABS = (
    ("COL_Purple_Cauldron_Source", build_cauldron, "cauldron-source.glb", -2.5),
    ("COL_Golden_Heart_Key", build_key, "heart-key.glb", 0.0),
    ("COL_Tulip_Portal_Flower", build_tulip, "tulip-portal.glb", 2.5),
)


def export_glb(arm, meshes, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [arm] + meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    options = dict(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_optimize_animation_size=False,
        export_def_bones=True,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **options)   # градієнт пелюсток -> COLOR_0
    except TypeError:
        bpy.ops.export_scene.gltf(**options)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    blend_path = argv[argv.index("--blend") + 1] if "--blend" in argv else None

    clear_scene()
    create_materials()
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, 60

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)
    built = []
    for col_name, build, _file_name, _offset in PREFABS:
        col = bpy.data.collections.new(col_name)
        scene.collection.children.link(col)
        arm, meshes = build(col)
        tris = sum(obj["tris"] for obj in meshes)
        print(f"[Props] {meshes[0].name}: {tris} трикутників, {len(arm.data.bones)} кісток")
        if not TRI_BUDGET[0] <= tris <= TRI_BUDGET[1]:
            raise RuntimeError(f"{meshes[0].name}: бюджет полігонів порушено — {tris} tris (потрібно {TRI_BUDGET[0]}-{TRI_BUDGET[1]})")
        built.append((arm, meshes))

    # Експорт: кожен префаб стоїть у нулі світу, у файл іде лише його арматура з мешами.
    for (arm, meshes), (_col, _build, file_name, _offset) in zip(built, PREFABS):
        filepath = os.path.join(out_dir, file_name)
        export_glb(arm, meshes, filepath)
        print(f"[Props] Експортовано GLB: {filepath}")

    # Після експорту розставляємо префаби в ряд, щоб у сцені Blender їх було видно поруч.
    for (arm, _meshes), (_col, _build, _file, offset) in zip(built, PREFABS):
        arm.location.x = offset
    built[1][0].location.z = 1.0
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend_path))
        print(f"[Props] Збережено сцену: {blend_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)       # інакше Blender у фоновому режимі завершується з кодом 0
