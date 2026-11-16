"""Вцілілий (старий ведмідь-провідник, варіант A «мандрівник») -> public/models/survivor.glb

Запуск:  blender --background --python tools/survivor/build_survivor.py

Усі координати нижче — у «дизайн-просторі» (приблизно метри); наприкінці все
рівномірно масштабується множником K так, щоб маківка вух була рівно на Z = 1.55.
Погляд уздовж -Y, ліва сторона персонажа: +X, права: -X.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler, Matrix, Quaternion

HEIGHT = 1.55
FPS = 30
X_AXIS, Y_AXIS, Z_AXIS = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ==============================================================================
# 0. ДОПОМІЖНЕ
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

def clamp01(x):
    return max(0.0, min(1.0, x))

def smooth(x):
    x = clamp01(x)
    return x * x * (3.0 - 2.0 * x)

def lerp_dir(a, b, w):
    return (Vector(a).normalized().lerp(Vector(b).normalized(), w)).normalized()

# ==============================================================================
# 1. МАТЕРІАЛИ (Principled BSDF, glTF 2.0)
# ==============================================================================

MATERIALS = {
    # key: (name, base hex, roughness, metallic, emission hex, emission strength)
    "fur":     ("MAT_Fur_Brown",      "#4A3222", 0.85, 0.0,  None,      0.0),
    "grey":    ("MAT_Fur_GreyBeard",  "#B8B0A6", 0.85, 0.0,  None,      0.0),
    "olive":   ("MAT_Backpack_Olive", "#5C6B4D", 0.80, 0.0,  None,      0.0),
    "wood":    ("MAT_Staff_Wood",     "#6E472B", 0.72, 0.0,  None,      0.0),
    "metal":   ("MAT_Lantern_Metal",  "#2B2D30", 0.35, 0.85, None,      0.0),
    "core":    ("MAT_Lantern_Core",   "#FFD27D", 0.30, 0.0,  "#FFB84D", 3.5),
    # допоміжні (за ескізом): ремені, ніс/очі, шарф, спальник, знак квесту
    "leather": ("MAT_Strap_Leather",  "#3B2314", 0.70, 0.0,  None,      0.0),
    "nose":    ("MAT_Nose_Dark",      "#1A1412", 0.30, 0.0,  None,      0.0),
    "eye":     ("MAT_Eye_Dark",       "#120D0B", 0.20, 0.0,  None,      0.0),
    "spec":    ("MAT_Eye_Spec",       "#FFFFFF", 0.10, 0.0,  "#FFFFFF", 1.0),
    "scarf":   ("MAT_Scarf_Red",      "#D92626", 0.78, 0.0,  None,      0.0),
    "bedroll": ("MAT_Bedroll_Tan",    "#A88A5E", 0.85, 0.0,  None,      0.0),
    "quest":   ("MAT_Quest_Yellow",   "#FFD54F", 0.45, 0.0,  "#FFD54F", 1.2),
}

def create_materials():
    mats = {}
    for key, (name, base, rough, metal, emis, emis_strength) in MATERIALS.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba(base))
        set_bsdf_socket(bsdf, ["Roughness"], rough)
        set_bsdf_socket(bsdf, ["Metallic"], metal)
        if emis:
            set_bsdf_socket(bsdf, ["Emission Color", "Emission"], hex_to_rgba(emis))
            set_bsdf_socket(bsdf, ["Emission Strength"], emis_strength)
        mats[key] = mat
    return mats

# ==============================================================================
# 2. ПОБУДОВНИК МЕШІВ (quad-dominant оболонки + специфікація ваг на вершину)
# ==============================================================================

class MeshBuilder:
    """Збирає меш із примітивів. Кожна вершина пам'ятає специфікацію скінінгу:
       {bone: w}                      — жорсткі ваги;
       ('auto', [bones], power)       — за відстанню до кісток ланцюжка;
       ('z', [(bone, z_center), ...]) — кусково-лінійно за висотою (тулуб)."""

    def __init__(self, name, mat_keys):
        self.name = name
        self.mat_keys = list(mat_keys)
        self.bm = bmesh.new()
        self.wl = self.bm.verts.layers.int.new("wspec")
        self.specs = []
        self.xf = Matrix.Identity(4)
        self.vspec = []

    def _spec(self, w):
        self.specs.append(w)
        return len(self.specs) - 1

    def _v(self, co, wi):
        v = self.bm.verts.new(self.xf @ Vector(co))
        v[self.wl] = wi
        return v

    def _f(self, verts, mi):
        f = self.bm.faces.new(verts)
        f.material_index = mi
        f.smooth = True
        return f

    def ellipsoid(self, center, radii, segs, rings, mat, w, rot=(0, 0, 0), box=1.0, fn=None):
        """UV-еліпсоїд; box < 1 дає супереліпсоїд («заокруглений ящик»)."""
        wi, mi = self._spec(w), self.mat_keys.index(mat)
        c, rad = Vector(center), Vector(radii)
        rm = Euler(rot, 'XYZ').to_matrix()

        def sp(v):
            return math.copysign(abs(v) ** box, v)

        def place(theta, phi):
            u = Vector((sp(math.sin(theta) * math.cos(phi)), sp(math.sin(theta) * math.sin(phi)), sp(math.cos(theta))))
            p = c + rm @ Vector((u.x * rad.x, u.y * rad.y, u.z * rad.z))
            return fn(p) if fn else p

        top = self._v(place(0.0, 0.0), wi)
        bot = self._v(place(math.pi, 0.0), wi)
        grid = []
        for i in range(1, rings):
            theta = math.pi * i / rings
            grid.append([self._v(place(theta, 2.0 * math.pi * j / segs), wi) for j in range(segs)])
        for j in range(segs):
            nj = (j + 1) % segs
            self._f((top, grid[0][j], grid[0][nj]), mi)
            self._f((bot, grid[-1][nj], grid[-1][j]), mi)
            for i in range(len(grid) - 1):
                self._f((grid[i][j], grid[i + 1][j], grid[i + 1][nj], grid[i][nj]), mi)

    def tube(self, path, radii, segs, mat, w, hint=None, scale=(1.0, 1.0), cap_start=True, cap_end=True):
        """Труба вздовж ламаної (паралельне перенесення перерізу)."""
        wi, mi = self._spec(w), self.mat_keys.index(mat)
        pts = [Vector(p) for p in path]
        n = len(pts)
        tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
        if hint is not None:
            h = Vector(hint)
        else:
            h = Vector((0, 1, 0)) if abs(tans[0].y) < 0.9 else Vector((1, 0, 0))
        nrm = (h - tans[0] * h.dot(tans[0])).normalized()
        ring_list = []
        for i in range(n):
            if i > 0:
                nrm = tans[i - 1].rotation_difference(tans[i]) @ nrm
                nrm = (nrm - tans[i] * nrm.dot(tans[i])).normalized()
            bin_ = tans[i].cross(nrm)
            r = radii[i] if isinstance(radii, (list, tuple)) else radii
            ring = []
            for s in range(segs):
                a = 2.0 * math.pi * s / segs
                ring.append(self._v(pts[i] + (nrm * math.cos(a) * scale[0] + bin_ * math.sin(a) * scale[1]) * r, wi))
            ring_list.append(ring)
        for i in range(n - 1):
            ra, rb = ring_list[i], ring_list[i + 1]
            for s in range(segs):
                ns = (s + 1) % segs
                self._f((ra[s], ra[ns], rb[ns], rb[s]), mi)
        if cap_start:
            cv = self._v(pts[0], wi)
            for s in range(segs):
                self._f((ring_list[0][(s + 1) % segs], ring_list[0][s], cv), mi)
        if cap_end:
            cv = self._v(pts[-1], wi)
            for s in range(segs):
                self._f((ring_list[-1][s], ring_list[-1][(s + 1) % segs], cv), mi)

    def limb(self, p0, p1, p2, r0, r1, r2, segs, half, mat, w, round_end=True):
        """Кінцівка з двох сегментів із заокругленими торцями."""
        p0, p1, p2 = Vector(p0), Vector(p1), Vector(p2)
        path = [p0 - (p1 - p0).normalized() * r0 * 0.55]
        radii = [r0 * 0.6]
        for i in range(half + 1):
            u = i / half
            path.append(p0.lerp(p1, u))
            radii.append(r0 + (r1 - r0) * u)
        for i in range(1, half + 1):
            u = i / half
            path.append(p1.lerp(p2, u))
            radii.append(r1 + (r2 - r1) * u)
        if round_end:
            path.append(p2 + (p2 - p1).normalized() * r2 * 0.55)
            radii.append(r2 * 0.6)
        self.tube(path, radii, segs, mat, w, hint=(0, 1, 0))

    def box(self, center, size, mat, w, rot=(0, 0, 0)):
        self.ellipsoid(center, Vector(size) * 0.5 * 1.15, 8, 4, mat, w, rot=rot, box=0.35)

    def max_z(self):
        return max(v.co.z for v in self.bm.verts)

    def clamp_floor(self):
        for v in self.bm.verts:
            v.co.z = max(0.0, v.co.z)

    def finish(self, collection, mats, k):
        bm = self.bm
        for v in bm.verts:
            v.co *= k
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.verts.ensure_lookup_table()
        self.vspec = [v[self.wl] for v in bm.verts]
        mesh = bpy.data.meshes.new(self.name + "_Data")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        for key in self.mat_keys:
            obj.data.materials.append(mats[key])
        self.tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
        self.quads = sum(1 for p in mesh.polygons if len(p.vertices) == 4)
        self.polys = len(mesh.polygons)
        return obj

# ==============================================================================
# 3. ГЕОМЕТРІЯ ПЕРСОНАЖА (дизайн-простір)
# ==============================================================================

# Тулуб-«груша» з нахилом уперед у плечах (згорблена постава)
T_C, T_R = Vector((0.0, 0.03, 0.68)), Vector((0.34, 0.30, 0.42))

def _torso_shape(rel):
    return 1.0 - 0.20 * rel, 0.07 * max(0.0, rel) ** 1.5

def torso_fn(p):
    s, lean = _torso_shape((p.z - T_C.z) / T_R.z)
    return Vector((p.x * s, (p.y - T_C.y) * s + T_C.y - lean, p.z))

def torso_surface(phi_deg, z, off=0.0):
    """Точка на поверхні тулуба: phi = 0 спереду (-Y), 90 — лівий бік (+X), 180 — спина."""
    rel = (z - T_C.z) / T_R.z
    s, lean = _torso_shape(rel)
    f = math.sqrt(max(0.0, 1.0 - rel * rel)) * s
    phi = math.radians(phi_deg)
    return Vector(((T_R.x * f + off) * math.sin(phi), T_C.y - (T_R.y * f + off) * math.cos(phi) - lean, z))

SHOULDER = {s: Vector((s * 0.25, -0.05, 1.00)) for s in (1.0, -1.0)}
ELBOW = {s: Vector((s * 0.38, -0.07, 0.80)) for s in (1.0, -1.0)}
WRIST = {s: Vector((s * 0.49, -0.09, 0.62)) for s in (1.0, -1.0)}
HIP = {s: Vector((s * 0.16, 0.03, 0.42)) for s in (1.0, -1.0)}
KNEE = {s: Vector((s * 0.165, 0.02, 0.22)) for s in (1.0, -1.0)}
ANKLE = {s: Vector((s * 0.17, 0.01, 0.0)) for s in (1.0, -1.0)}

# Вузол «посох + ліхтар» (права лапа, -X)
STAFF_X, STAFF_Y = -0.52, -0.165
STAFF_TIP = Vector((STAFF_X, STAFF_Y, 0.0))
STAFF_GRIP = Vector((STAFF_X, STAFF_Y, 0.60))
HOOK_R, HOOK_Z = 0.11, 1.45
LANTERN_PIVOT = Vector((STAFF_X - HOOK_R - 0.14, STAFF_Y, 1.487))
LANTERN_SCALE = 1.25

TORSO_W = ('z', [("pelvis", 0.45), ("spine_01", 0.70), ("spine_02", 0.95)])

def side_name(s):
    return "L" if s > 0 else "R"

def build_body():
    mb = MeshBuilder("MSH_Survivor_Body", ("fur", "grey", "nose", "eye", "spec", "scarf"))
    head = {"head": 1.0}

    # Тулуб, сива пляма на грудях, хвіст
    mb.ellipsoid(T_C, T_R, 24, 14, "fur", TORSO_W, fn=torso_fn)
    chest = torso_surface(0, 0.84)
    mb.ellipsoid((0.0, chest.y + 0.02, 0.84), (0.14, 0.045, 0.13), 14, 8, "grey", TORSO_W)
    mb.ellipsoid((0.0, 0.33, 0.42), (0.06, 0.06, 0.055), 8, 6, "fur", {"pelvis": 1.0})

    # Голова, вуха (сиві раковини та кінчики)
    mb.ellipsoid((0.0, -0.10, 1.22), (0.26, 0.235, 0.225), 20, 12, "fur", head)
    for s in (1.0, -1.0):
        ear = {f"ear.{side_name(s)}": 1.0}
        mb.ellipsoid((s * 0.18, -0.08, 1.43), (0.08, 0.045, 0.08), 12, 8, "fur", ear, rot=(0, s * 0.3, 0))
        mb.ellipsoid((s * 0.178, -0.108, 1.428), (0.05, 0.022, 0.052), 10, 6, "grey", ear, rot=(0, s * 0.3, 0))
        mb.ellipsoid((s * 0.198, -0.08, 1.482), (0.05, 0.04, 0.035), 10, 6, "grey", ear, rot=(0, s * 0.3, 0))

    # Морда: сива мордочка, ніс, очі з бліками, густі сиві брови, бакенбарди, борода
    mb.ellipsoid((0.0, -0.30, 1.17), (0.125, 0.095, 0.09), 16, 10, "grey", head)
    mb.ellipsoid((0.0, -0.385, 1.20), (0.05, 0.032, 0.035), 10, 6, "nose", head)
    for s in (1.0, -1.0):
        mb.ellipsoid((s * 0.10, -0.31, 1.265), (0.026, 0.018, 0.03), 10, 6, "eye", head)
        mb.ellipsoid((s * 0.092, -0.327, 1.276), (0.008, 0.005, 0.008), 6, 4, "spec", head)
        mb.ellipsoid((s * 0.108, -0.305, 1.325), (0.068, 0.028, 0.022), 12, 6, "grey", head,
                     rot=(0.0, s * 0.35, s * 0.35))
        mb.ellipsoid((s * 0.205, -0.205, 1.115), (0.05, 0.058, 0.085), 12, 8, "grey", head)
    mb.ellipsoid((0.0, -0.275, 1.075), (0.12, 0.075, 0.09), 14, 8, "grey", {"beard": 1.0})

    # Лапи: верхні в A-Pose, нижні з пласкою підошвою
    for s in (1.0, -1.0):
        sn = side_name(s)
        mb.limb(SHOULDER[s], ELBOW[s], WRIST[s], 0.105, 0.09, 0.085, 12, 4, "fur",
                ('auto', [f"upperarm.{sn}", f"lowerarm.{sn}", f"hand.{sn}"], 4.0))
        mb.ellipsoid((s * 0.51, -0.095, 0.59), (0.09, 0.09, 0.095), 12, 8, "fur", {f"hand.{sn}": 1.0})
        mb.limb(HIP[s], KNEE[s], ANKLE[s], 0.14, 0.12, 0.115, 12, 4, "fur",
                ('auto', [f"thigh.{sn}", f"calf.{sn}", f"foot.{sn}"], 4.0), round_end=False)
        mb.ellipsoid((s * 0.17, -0.07, 0.05), (0.105, 0.14, 0.05), 12, 6, "fur", {f"foot.{sn}": 1.0})

    # Червоний шарф: кільце довкола шиї + кінець, що лежить на грудях
    c, rx, ry = Vector((0.0, -0.02, 1.02)), 0.20, 0.20
    ring = []
    for i in range(22):
        a = 2.0 * math.pi * i / 22
        ring.append(c + Vector((rx * math.sin(a), -ry * math.cos(a), 0.012 * math.sin(2 * a))))
    ring.append(ring[0])
    mb.tube(ring, 0.055, 8, "scarf", {"neck": 0.5, "spine_02": 0.5}, hint=(0, 0, 1),
            scale=(0.85, 1.0), cap_start=False, cap_end=False)
    tail = [Vector((0.06, -0.255, 1.0))]
    for z in (0.93, 0.85, 0.76, 0.68, 0.62):
        p = torso_surface(0, z, 0.035)
        tail.append(Vector((0.065, p.y, z)))
    mb.tube(tail, [0.9, 1.0, 1.0, 1.0, 1.05, 0.9], 6, "scarf", TORSO_W, hint=(1, 0, 0), scale=(0.062, 0.018))
    return mb

def build_backpack():
    mb = MeshBuilder("MSH_Backpack", ("olive", "leather", "metal", "bedroll"))
    w = {"backpack": 1.0}
    # Корпус лежить на згорбленій спині: локальні координати рюкзака з нахилом уперед
    mb.xf = Matrix.Translation((0.0, 0.40, 0.73)) @ Matrix.Rotation(0.12, 4, 'X')
    mb.ellipsoid((0, 0, 0), (0.24, 0.14, 0.27), 12, 8, "olive", w, box=0.6)
    mb.ellipsoid((0, 0.01, 0.20), (0.245, 0.15, 0.10), 12, 6, "olive", w, box=0.7)      # клапан
    mb.ellipsoid((0, 0.14, -0.09), (0.16, 0.055, 0.12), 10, 6, "olive", w, box=0.6)     # кишеня
    mb.box((0, 0.150, 0.06), (0.045, 0.02, 0.24), "leather", w)                          # ремінь клапана
    mb.box((0, 0.200, -0.03), (0.07, 0.02, 0.05), "metal", w)                            # пряжка
    # Скатка-спальник зверху з двома шкіряними ременями
    roll_c = Vector((0.0, -0.01, 0.365))
    mb.tube([roll_c + Vector((x, 0, 0)) for x in (-0.30, -0.285, 0.285, 0.30)],
            [0.07, 0.10, 0.10, 0.07], 12, "bedroll", w, hint=(0, 0, 1))
    for x in (-0.15, 0.15):
        loop = [roll_c + Vector((x, 0.108 * math.cos(a), 0.108 * math.sin(a)))
                for a in (2.0 * math.pi * i / 12 for i in range(13))]
        mb.tube(loop, 0.02, 4, "leather", w, hint=(1, 0, 0), scale=(1.1, 0.5), cap_start=False, cap_end=False)
    # Плечові ремені: зі спини через плече, по грудях і під лапою назад до низу рюкзака
    mb.xf = Matrix.Identity(4)
    for s in (1.0, -1.0):
        pts = [Vector((0.15, 0.22, 1.00)), Vector((0.17, 0.08, 1.085)), Vector((0.175, -0.06, 1.10)),
               Vector((0.18, -0.195, 1.02))]
        for phi, z in ((40, 0.88), (48, 0.74), (75, 0.62), (115, 0.56), (142, 0.56)):
            pts.append(torso_surface(phi, z, 0.022))
        pts = [Vector((p.x * s, p.y, p.z)) for p in pts]
        mb.tube(pts, 0.024, 6, "leather", w, hint=(s, 0, 0), scale=(1.0, 0.6))
        buckle = pts[4]
        mb.box((buckle.x, buckle.y - 0.012, buckle.z), (0.06, 0.03, 0.05), "metal", w)
    return mb

def build_staff():
    mb = MeshBuilder("MSH_Staff", ("wood",))
    path = [Vector((STAFF_X, STAFF_Y, z)) for z in (0.0, 0.02, 0.35, 0.70, 1.05, 1.30, HOOK_Z)]
    radii = [0.014, 0.020, 0.022, 0.024, 0.024, 0.023, 0.022]
    cx = STAFF_X - HOOK_R
    for a in range(15, 151, 15):
        path.append(Vector((cx + HOOK_R * math.cos(math.radians(a)), STAFF_Y, HOOK_Z + HOOK_R * math.sin(math.radians(a)))))
        radii.append(0.022 - 0.004 * a / 150.0)
    end = path[-1]
    for dx, dz, r in ((-0.03, -0.018, 0.017), (-0.06, -0.018, 0.016), (-0.082, 0.0, 0.015), (-0.092, 0.025, 0.011)):
        path.append(end + Vector((dx, 0.0, dz)))
        radii.append(r)
    mb.tube(path, radii, 8, "wood", {"staff_socket": 1.0}, hint=(0, 1, 0))
    return mb

def build_lantern():
    mb = MeshBuilder("MSH_Lantern", ("metal", "core"))
    w = {"lantern_pivot": 1.0}
    P, L = LANTERN_PIVOT, LANTERN_SCALE

    def at(dx, dy, dz):
        return P + Vector((dx * L, dy * L, dz * L))

    # Кільце-підвіс на гаку
    loop = [P + Vector((0.0, 0.03 * math.cos(a), -0.012 + 0.03 * math.sin(a)))
            for a in (2.0 * math.pi * i / 12 for i in range(13))]
    mb.tube(loop, 0.006, 6, "metal", w, hint=(1, 0, 0), cap_start=False, cap_end=False)
    # Ковпак, скляна колба зі світлом, основа, чотири прутики каркаса
    mb.tube([at(0, 0, z) for z in (-0.034, -0.05, -0.072, -0.084, -0.092)],
            [r * L for r in (0.010, 0.028, 0.056, 0.062, 0.048)], 12, "metal", w, hint=(1, 0, 0))
    mb.ellipsoid(at(0, 0, -0.145), (0.044 * L, 0.044 * L, 0.058 * L), 10, 6, "core", w)
    mb.tube([at(0, 0, z) for z in (-0.196, -0.206, -0.232, -0.244)],
            [r * L for r in (0.046, 0.062, 0.062, 0.044)], 12, "metal", w, hint=(1, 0, 0))
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        cx, cy = math.cos(a), math.sin(a)
        mb.tube([at(cx * r, cy * r, z) for r, z in ((0.050, -0.088), (0.056, -0.145), (0.050, -0.20))],
                0.005 * L, 4, "metal", w, hint=(cx, cy, 0))
    return mb

def build_quest_bubble():
    """Знак оклику над головою; у Three.js: getObjectByName('MSH_QuestBubble').visible = ..."""
    mb = MeshBuilder("MSH_QuestBubble", ("quest",))
    w = {"root": 1.0}
    x, y = 0.0, -0.08
    mb.tube([Vector((x, y, z)) for z in (1.985, 1.97, 1.86, 1.79, 1.78)],
            [0.03, 0.05, 0.036, 0.026, 0.016], 10, "quest", w, hint=(1, 0, 0))
    mb.ellipsoid((x, y, 1.715), (0.04, 0.04, 0.04), 10, 6, "quest", w)
    return mb

# ==============================================================================
# 4. СКЕЛЕТ ТА СКІНІНГ
# ==============================================================================

def build_rig(collection, k):
    arm_data = bpy.data.armatures.new("ARM_Survivor_Data")
    arm_obj = bpy.data.objects.new("ARM_Survivor", arm_data)
    collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def bone(name, head, tail, parent=None, connected=False):
        b = eb.new(name)
        b.head, b.tail = Vector(head) * k, Vector(tail) * k
        b.use_deform = True
        if parent:
            b.parent = parent
            b.use_connect = connected
        return b

    root = bone("root", (0, 0, 0), (0, 0.2, 0))
    pelvis = bone("pelvis", (0, 0.03, 0.42), (0, 0.03, 0.60), root)
    spine1 = bone("spine_01", (0, 0.03, 0.60), (0, 0.01, 0.82), pelvis, True)
    spine2 = bone("spine_02", (0, 0.01, 0.82), (0, -0.05, 1.02), spine1, True)   # нахил уперед
    neck = bone("neck", (0, -0.05, 1.02), (0, -0.075, 1.09), spine2, True)
    head = bone("head", (0, -0.075, 1.09), (0, -0.10, 1.42), neck, True)
    bone("beard", (0, -0.28, 1.11), (0, -0.30, 0.97), head)
    bone("backpack", (0, 0.30, 1.00), (0, 0.46, 0.62), spine2)
    for s in (1.0, -1.0):
        sn = side_name(s)
        bone(f"ear.{sn}", (s * 0.15, -0.08, 1.40), (s * 0.21, -0.08, 1.52), head)
        ua = bone(f"upperarm.{sn}", SHOULDER[s], ELBOW[s], spine2)
        la = bone(f"lowerarm.{sn}", ELBOW[s], WRIST[s], ua, True)
        hand = bone(f"hand.{sn}", WRIST[s], (s * 0.53, -0.10, 0.55), la, True)
        th = bone(f"thigh.{sn}", HIP[s], KNEE[s], pelvis)
        ca = bone(f"calf.{sn}", KNEE[s], (s * 0.17, 0.01, 0.05), th, True)
        bone(f"foot.{sn}", (s * 0.17, 0.01, 0.05), (s * 0.17, -0.14, 0.02), ca, True)
        if sn == "R":
            sock = bone("staff_socket", STAFF_GRIP, STAFF_GRIP + Vector((0, 0, 0.30)), hand)
            bone("lantern_pivot", LANTERN_PIVOT, LANTERN_PIVOT + Vector((0, 0, -0.22)), sock)
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj

def dist_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + t * ab)).length

def skin(obj, mb, arm_obj, k):
    obj.parent = arm_obj
    mod = obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj
    bones = arm_obj.data.bones
    groups = {}

    def add(vi, name, weight):
        if weight <= 0.001:
            return
        if name not in groups:
            groups[name] = obj.vertex_groups.new(name=name)
        groups[name].add([vi], weight, 'REPLACE')

    for v in obj.data.vertices:
        spec = mb.specs[mb.vspec[v.index]]
        if isinstance(spec, dict):
            for name, weight in spec.items():
                add(v.index, name, weight)
        elif spec[0] == 'auto':
            raw = [(n, 1.0 / (dist_to_segment(v.co, bones[n].head_local, bones[n].tail_local) + 0.01) ** spec[2])
                   for n in spec[1]]
            total = sum(x for _, x in raw)
            for n, x in raw:
                add(v.index, n, x / total)
        elif spec[0] == 'z':
            chain = spec[1]
            z = v.co.z / k
            if z <= chain[0][1]:
                add(v.index, chain[0][0], 1.0)
            elif z >= chain[-1][1]:
                add(v.index, chain[-1][0], 1.0)
            else:
                for (n0, z0), (n1, z1) in zip(chain, chain[1:]):
                    if z0 <= z <= z1:
                        u = smooth((z - z0) / (z1 - z0))
                        add(v.index, n0, 1.0 - u)
                        add(v.index, n1, u)
                        break

# ==============================================================================
# 5. АНІМАЦІЇ: пози задаються у просторі арматури, FK рахується тут же
# ==============================================================================

class FK:
    """Команди на кістку:
       ('rot', [(axis, deg), ...], loc?) — повороти довкола осей арматури поверх успадкованої пози;
       ('aim', dir)                      — спрямувати кістку вздовж напрямку в просторі арматури;
       ('mat', fn(fk, pose) -> Matrix)   — задати повну матрицю в просторі арматури."""

    def __init__(self, arm_obj):
        bones = arm_obj.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.rest_inv = {n: m.inverted() for n, m in self.rest.items()}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.order = []

        def visit(b):
            self.order.append(b.name)
            for c in b.children:
                visit(c)
        for b in bones:
            if b.parent is None:
                visit(b)

    def solve(self, cmds):
        pose, basis = {}, {}
        for name in self.order:
            p = self.parent[name]
            pre = (pose[p] @ self.rest_inv[p] @ self.rest[name]) if p else self.rest[name].copy()
            c = cmds.get(name)
            b = Matrix.Identity(4)
            if c:
                pre3 = pre.to_3x3()
                pre3_inv = pre3.inverted()
                if c[0] == 'rot':
                    qw = Quaternion()
                    for axis, deg in c[1]:
                        qw = Quaternion(axis, math.radians(deg)) @ qw
                    b = (pre3_inv @ qw.to_matrix() @ pre3).to_4x4()
                    if len(c) > 2 and c[2] is not None:
                        b.translation = pre3_inv @ Vector(c[2])
                elif c[0] == 'aim':
                    d = (pre3_inv @ Vector(c[1])).normalized()
                    b = Vector((0, 1, 0)).rotation_difference(d).to_matrix().to_4x4()
                elif c[0] == 'mat':
                    b = pre.inverted() @ c[1](self, pose)
            pose[name] = pre @ b
            basis[name] = b
        return basis, pose

    def point(self, pose, bone, rest_point):
        return pose[bone] @ self.rest_inv[bone] @ Vector(rest_point)

LOC_BONES = ("pelvis", "staff_socket")

def bake_action(arm_obj, fk, name, frames, pose_fn):
    """Ключі на кадрах 0..frames => тривалість рівно frames / 30 с."""
    action = bpy.data.actions.new(name)
    arm_obj.animation_data.action = action
    prev = {}
    for f in range(frames + 1):
        basis, _ = fk.solve(pose_fn(f / frames))
        for pb in arm_obj.pose.bones:
            b = basis[pb.name]
            q = b.to_quaternion()
            if pb.name in prev and prev[pb.name].dot(q) < 0.0:
                q.negate()
            prev[pb.name] = q.copy()
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f)
            if pb.name in LOC_BONES:
                pb.location = b.translation
                pb.keyframe_insert(data_path="location", frame=f)
    action.use_fake_user = True
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    track.mute = (name != "Idle")
    arm_obj.animation_data.action = None

def build_animations(arm_obj, k):
    bpy.context.scene.render.fps = FPS
    arm_obj.animation_data_create()
    fk = FK(arm_obj)
    grip_rest, tip_rest, pivot_rest = STAFF_GRIP * k, STAFF_TIP * k, LANTERN_PIVOT * k
    rest_sock = fk.rest["staff_socket"]
    rest_lantern3 = fk.rest["lantern_pivot"].to_3x3().to_4x4()

    def staff(tip_fn):
        """Посох проходить крізь хват правої лапи, а його п'ята стоїть у точці tip_fn(grip)."""
        def fn(fk_, pose):
            grip = fk_.point(pose, "hand.R", grip_rest)
            tip = tip_fn(grip)
            q = Z_AXIS.rotation_difference((grip - tip).normalized())
            return Matrix.Translation(tip) @ q.to_matrix().to_4x4() @ Matrix.Translation(-tip_rest) @ rest_sock
        return fn

    def lantern(swing_x, swing_y):
        """Ліхтар висить прямовисно (маятник) незалежно від нахилу посоха."""
        def fn(fk_, pose):
            pivot = fk_.point(pose, "staff_socket", pivot_rest)
            sw = Quaternion(X_AXIS, math.radians(swing_x)) @ Quaternion(Y_AXIS, math.radians(swing_y))
            return Matrix.Translation(pivot) @ sw.to_matrix().to_4x4() @ rest_lantern3
        return fn

    ARM_L_UP, ARM_L_LOW = (0.30, -0.10, -1.0), (0.20, -0.32, -1.0)
    ARM_R_UP, ARM_R_LOW = (-0.35, -0.35, -1.0), (-0.25, -0.90, -0.55)

    def stance():
        return {
            "spine_01": ['rot', [(X_AXIS, 3.0)]],
            "spine_02": ['rot', [(X_AXIS, 4.0)]],
            "head": ['rot', [(X_AXIS, -4.0)]],
            "upperarm.L": ['aim', ARM_L_UP], "lowerarm.L": ['aim', ARM_L_LOW],
            "upperarm.R": ['aim', ARM_R_UP], "lowerarm.R": ['aim', ARM_R_LOW],
        }

    # Точка опори посоха на землі в стійці
    _, pose0 = fk.solve(stance())
    g0 = fk.point(pose0, "hand.R", grip_rest)
    tip0 = Vector((g0.x - 0.03 * k, g0.y - 0.07 * k, 0.0))

    # --- Idle: 90 кадрів / 3.0 с -------------------------------------------------
    def idle(t):
        p = 2.0 * math.pi * t
        br = math.sin(p)
        c = stance()
        c["spine_01"] = ['rot', [(X_AXIS, 3.0 - 1.2 * br), (Y_AXIS, 0.6 * math.sin(p + 0.8))]]
        c["spine_02"] = ['rot', [(X_AXIS, 4.0 - 1.8 * br)]]
        c["head"] = ['rot', [(X_AXIS, -4.0 + 1.6 * math.sin(p - 0.5)), (Z_AXIS, 2.0 * math.sin(p + 1.0))]]
        c["beard"] = ['rot', [(X_AXIS, 3.0 * math.sin(p - 0.9))]]
        twitch = math.exp(-((t - 0.55) / 0.035) ** 2)
        c["ear.L"] = ['rot', [(Y_AXIS, 9.0 * twitch)]]
        c["ear.R"] = ['rot', [(Y_AXIS, -6.0 * math.exp(-((t - 0.60) / 0.035) ** 2))]]
        c["lowerarm.L"] = ['aim', (0.20, -0.32 + 0.04 * br, -1.0)]
        c["staff_socket"] = ['mat', staff(lambda g: tip0)]
        c["lantern_pivot"] = ['mat', lantern(5.0 * math.sin(2.0 * p), 3.0 * math.sin(p + 0.5))]
        return c

    # --- Walk: 40 кадрів / 1.33 с, два кроки, посох переставляється раз на цикл ---
    def walk(t):
        p = 2.0 * math.pi * t
        sw, co = math.sin(p), math.cos(p)
        c = stance()
        c["pelvis"] = ['rot', [(Y_AXIS, 3.0 * sw), (Z_AXIS, 4.0 * sw)],
                       (0.018 * k * sw, 0.0, (-0.014 + 0.014 * math.cos(2.0 * p)) * k)]
        c["spine_01"] = ['rot', [(X_AXIS, 6.0), (Y_AXIS, -2.0 * sw), (Z_AXIS, -5.0 * sw)]]
        c["spine_02"] = ['rot', [(X_AXIS, 5.0), (Z_AXIS, -3.0 * sw)]]
        c["head"] = ['rot', [(X_AXIS, -5.0 + 2.0 * math.cos(2.0 * p)), (Z_AXIS, 4.0 * sw)]]
        c["beard"] = ['rot', [(X_AXIS, 5.0 * math.cos(2.0 * p - 0.8))]]
        c["ear.L"] = ['rot', [(Y_AXIS, 3.0 * math.cos(2.0 * p - 1.0))]]
        c["ear.R"] = ['rot', [(Y_AXIS, -3.0 * math.cos(2.0 * p - 1.0))]]
        for s, sn in ((1.0, "L"), (-1.0, "R")):
            a = math.radians(22.0 * sw * s)
            bend = math.radians(34.0 * max(0.0, co * s) ** 1.2)
            c[f"thigh.{sn}"] = ['aim', (s * 0.02, -math.sin(a), -math.cos(a))]
            c[f"calf.{sn}"] = ['aim', (s * 0.02, -math.sin(a - bend), -math.cos(a - bend))]
            c[f"foot.{sn}"] = ['aim', (0.0, -0.98, -0.20 - 0.25 * max(0.0, co * s))]
        la = math.radians(-16.0 * sw)
        c["upperarm.L"] = ['aim', (0.30, -0.10 - math.sin(la), -math.cos(la))]
        c["lowerarm.L"] = ['aim', (0.20, -0.36 - 1.3 * math.sin(la), -1.0)]
        # фаза посоха: 0..0.6 — стоїть на землі (земля «їде» назад), 0.6..1 — перенесення вперед
        ts = (t - 0.20) % 1.0
        if ts < 0.6:
            reach, lift = math.cos(math.pi * ts / 0.6), 0.0
        else:
            u = (ts - 0.6) / 0.4
            reach, lift = -math.cos(math.pi * u), math.sin(math.pi * u)
        c["upperarm.R"] = ['aim', (-0.35, -0.35 - 0.22 * reach, -1.0 + 0.10 * lift)]
        c["lowerarm.R"] = ['aim', (-0.25, -0.90 - 0.15 * reach, -0.55 + 0.25 * lift)]
        c["staff_socket"] = ['mat', staff(lambda g: tip0 + Vector((0.0, -0.20 * reach, 0.09 * lift)) * k)]
        c["lantern_pivot"] = ['mat', lantern(9.0 * math.sin(2.0 * p - 0.9), 5.0 * math.sin(p - 0.6))]
        return c

    # --- Talk_Gesture: 60 кадрів / 2.0 с -------------------------------------------
    def talk(t):
        p = 2.0 * math.pi * t
        e = math.sin(math.pi * t)
        w = smooth(e * 1.6)
        g = smooth((t - 0.30) / 0.18) * (1.0 - smooth((t - 0.62) / 0.18))
        c = stance()
        c["spine_01"] = ['rot', [(X_AXIS, 3.0 + 1.5 * e), (Z_AXIS, 3.0 * e * math.sin(p))]]
        c["spine_02"] = ['rot', [(X_AXIS, 4.0 + 2.0 * e)]]
        c["head"] = ['rot', [(X_AXIS, -4.0 + 9.0 * e * math.sin(3.0 * p)), (Z_AXIS, 6.0 * e * math.sin(p))]]
        c["beard"] = ['rot', [(X_AXIS, 7.0 * e * math.sin(3.0 * p - 0.8))]]
        c["ear.L"] = ['rot', [(Y_AXIS, 5.0 * e * math.sin(3.0 * p))]]
        c["ear.R"] = ['rot', [(Y_AXIS, -5.0 * e * math.sin(3.0 * p))]]
        wob = Vector((0.28 * math.sin(2.0 * p), 0.0, 0.22 * math.cos(2.0 * p))) * e
        c["upperarm.L"] = ['aim', lerp_dir(ARM_L_UP, (0.50, -0.45, -0.70), w)]
        c["lowerarm.L"] = ['aim', lerp_dir(ARM_L_LOW, Vector((0.20, -0.75, 0.55)) + wob, w)]
        c["hand.L"] = ['rot', [(Y_AXIS, 18.0 * e * math.sin(2.0 * p + 0.6))]]
        c["upperarm.R"] = ['aim', lerp_dir(ARM_R_UP, (-0.35, -0.50, -0.80), g)]
        c["lowerarm.R"] = ['aim', lerp_dir(ARM_R_LOW, (-0.20, -0.90, -0.10), g)]
        c["staff_socket"] = ['mat', staff(lambda gr: tip0 + Vector((0.0, -0.05 * g, 0.17 * g)) * k)]
        c["lantern_pivot"] = ['mat', lantern(8.0 * e * math.sin(2.0 * p), 5.0 * e * math.sin(2.0 * p + 1.0))]
        return c

    # --- Point_Direction: 45 кадрів / 1.5 с ----------------------------------------
    def point(t):
        w = smooth(t / 0.30) * (1.0 - smooth((t - 0.78) / 0.22))
        over = math.exp(-((t - 0.34) / 0.07) ** 2)
        target = (0.42, -0.88, 0.10 + 0.08 * over)
        c = stance()
        c["spine_01"] = ['rot', [(X_AXIS, 3.0 + 2.0 * w), (Z_AXIS, 5.0 * w)]]
        c["spine_02"] = ['rot', [(X_AXIS, 4.0 + 1.0 * w), (Z_AXIS, 5.0 * w)]]
        c["head"] = ['rot', [(X_AXIS, -4.0 - 2.0 * w), (Z_AXIS, 12.0 * w)]]
        c["beard"] = ['rot', [(X_AXIS, 4.0 * over)]]
        c["upperarm.L"] = ['aim', lerp_dir(ARM_L_UP, target, w)]
        c["lowerarm.L"] = ['aim', lerp_dir(ARM_L_LOW, target, w)]
        c["staff_socket"] = ['mat', staff(lambda g: tip0)]
        c["lantern_pivot"] = ['mat', lantern(5.0 * w * math.sin(4.0 * math.pi * t), 3.0 * w * math.sin(2.0 * math.pi * t))]
        return c

    for name, frames, fn in (("Idle", 90, idle), ("Walk", 40, walk), ("Talk_Gesture", 60, talk),
                             ("Point_Direction", 45, point)):
        bake_action(arm_obj, fk, name, frames, fn)

    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)

# ==============================================================================
# 6. ЗБІРКА ТА ЕКСПОРТ
# ==============================================================================

def main():
    clear_scene()
    col = bpy.data.collections.new("COL_Survivor_Character")
    bpy.context.scene.collection.children.link(col)
    mats = create_materials()

    body = build_body()
    body.clamp_floor()
    k = HEIGHT / body.max_z()
    builders = [body, build_backpack(), build_staff(), build_lantern(), build_quest_bubble()]
    objs = [mb.finish(col, mats, k) for mb in builders]
    arm_obj = build_rig(col, k)

    # Apply All Transforms перед скінінгом
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs + [arm_obj]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for obj, mb in zip(objs, builders):
        skin(obj, mb, arm_obj, k)
    build_animations(arm_obj, k)

    total = 0
    for mb in builders:
        total += mb.tris
        print(f"[Survivor] {mb.name}: {mb.tris} tris, quads {mb.quads}/{mb.polys}")
    body_z = [v.co.z for v in objs[0].data.vertices]
    print(f"[Survivor] K={k:.4f} | тіло Z: {min(body_z):.4f}..{max(body_z):.4f} | разом tris: {total}")

    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = 90

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)
    filepath = os.path.join(out_dir, "survivor.glb")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_def_bones=True,
    )
    print(f"[Survivor] Експортовано GLB: {filepath}")

if __name__ == "__main__":
    main()
