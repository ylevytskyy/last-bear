"""Ведмежа-полонений у клітці з фіолетовим плющем і золотим замком-серцем
-> public/models/captive-cub-cage.glb

Запуск:  blender --background --python tools/captive_cub/build_captive_cub.py

Префаб має один спільний початок координат: центр клітки на землі (Z = 0).
Фасад (дверцята із замком) дивиться вздовж -Y. Ліва сторона ведмежати: +X.
Клітка будується одразу в метрах. Ведмежа ліпиться у «дизайн-просторі»,
масштабується до зросту 0.85 м і ставиться на підлогу клітки в точці CUB_Y.
"""
import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Euler, Matrix, Quaternion

FPS = 30
X_AXIS, Y_AXIS, Z_AXIS = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# --- Клітка (метри) -----------------------------------------------------------
HALF = 0.75            # півширина основи: габарит 1.5 x 1.5
TOP = 1.80             # висота клітки
FLOOR = 0.14           # верх дерев'яної основи = підлога для ведмежати
ROOF_Z0, ROOF_Z1 = 1.62, 1.74
PC = 0.69              # вісь кутових стовпів і площина ґрат
FY = -PC               # площина фасаду
POST_R = 0.045
DOOR_X = 0.45          # бокові стійки дверцят
DOOR_Z0, DOOR_Z1 = 0.19, 1.57
DOOR_BARS = (-0.315, -0.105, 0.105, 0.315)   # мордочка визирає між двома середніми
JAMB_X = 0.52
HINGE = Vector((-0.485, FY - 0.04, 0.0))     # вісь петель (вертикаль крізь цю точку)
DOOR_OPEN_DEG = 110.0
RAIL_Z = 1.12          # середня поперечка дверцят, на ній висить замок

# --- Замок-серце ---------------------------------------------------------------
LOCK_X, LOCK_Y = 0.485, FY - 0.078
LOCK_W, LOCK_T = 0.35, 0.075
SHACKLE_TOP = 1.08     # вісь верхньої дуги дужки
SHACKLE_R = 0.08       # радіус дуги (до осі труби)
SHACKLE_TUBE = 0.016
LOCK_GROUND = Vector((0.66, -1.05, 0.05))    # куди падає відімкнений замок

# --- Ведмежа -------------------------------------------------------------------
CUB_HEIGHT = 0.85
CUB_Y = -0.40          # де ведмежа стоїть у клітці
CUB_EXIT = 0.88        # наскільки вперед воно вистрибує після порятунку
GRIP_X, GRIP_Z = 0.315, 0.66   # за які прути і на якій висоті тримається

FUR_VARIANTS = ("#8C583A", "#C97A34", "#D9C3A3", "#4E3322", "#7A7D85")

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

def lerp(a, b, w):
    return a + (b - a) * w

def bump(t, a, b):
    """Півхвиля синуса на відрізку [a, b], поза ним нуль."""
    return math.sin(math.pi * clamp01((t - a) / (b - a))) if a < t < b else 0.0

def Q(axis, deg):
    return Quaternion(axis, math.radians(deg))

def mix_dir(a, b, w):
    return (Vector(a).normalized().lerp(Vector(b).normalized(), clamp01(w))).normalized()

# ==============================================================================
# 1. МАТЕРІАЛИ (Principled BSDF, glTF 2.0)
# ==============================================================================

MATERIALS = {
    # key: (name, base hex, roughness, metallic, emission hex, emission strength)
    "iron":     ("MAT_Cage_Iron",     "#2C3036", 0.38, 0.85, None,      0.0),
    "wood":     ("MAT_Cage_Wood",     "#5C3D28", 0.78, 0.0,  None,      0.0),
    "gold":     ("MAT_Lock_Gold",     "#FFCC29", 0.22, 0.95, "#FFAA00", 0.3),
    "keyhole":  ("MAT_Lock_Keyhole",  "#1A1208", 0.60, 0.0,  None,      0.0),
    "stem":     ("MAT_Ivy_Stem",      "#4A1C6B", 0.65, 0.0,  None,      0.0),
    "leaf":     ("MAT_Ivy_Leaf",      "#6A2899", 0.90, 0.0,  None,      0.0),
    "glow":     ("MAT_Ivy_Glow",      "#B84DFF", 0.50, 0.0,  "#B84DFF", 2.2),
    "fur":      ("MAT_Cub_Fur",       "#8C583A", 0.82, 0.0,  None,      0.0),
    "muzzle":   ("MAT_Cub_Muzzle",    "#EBD9BC", 0.82, 0.0,  None,      0.0),
    "nose":     ("MAT_Cub_Nose",      "#2A1A14", 0.35, 0.0,  None,      0.0),
    "eye":      ("MAT_Cub_Eye",       "#17100D", 0.20, 0.0,  None,      0.0),
    "spec":     ("MAT_Cub_EyeSpec",   "#FFFFFF", 0.10, 0.0,  "#FFFFFF", 1.0),
    "blush":    ("MAT_Cub_Blush",     "#F29A9A", 0.85, 0.0,  None,      0.0),
    "bow":      ("MAT_Cub_Bow",       "#E8342E", 0.70, 0.0,  None,      0.0),
    "kerchief": ("MAT_Cub_Kerchief",  "#2FA35A", 0.78, 0.0,  None,      0.0),
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
       ('z', [(bone, z_center), ...]) — кусково-лінійно за висотою (у просторі побудови)."""

    def __init__(self, name, mat_keys):
        self.name = name
        self.mat_keys = list(mat_keys)
        self.bm = bmesh.new()
        self.wl = self.bm.verts.layers.int.new("wspec")
        self.specs = []
        self.vspec = []
        self.k, self.off = 1.0, Vector((0, 0, 0))

    def _spec(self, w):
        self.specs.append(w)
        return len(self.specs) - 1

    def _v(self, co, wi):
        v = self.bm.verts.new(Vector(co))
        v[self.wl] = wi
        return v

    def _f(self, verts, mi):
        f = self.bm.faces.new(verts)
        f.material_index = mi
        f.smooth = True
        return f

    def ellipsoid(self, center, radii, segs, rings, mat, w, rot=(0, 0, 0), box=1.0):
        """UV-еліпсоїд; box < 1 дає супереліпсоїд («заокруглений ящик»)."""
        wi, mi = self._spec(w), self.mat_keys.index(mat)
        c, rad = Vector(center), Vector(radii)
        rm = Euler(rot, 'XYZ').to_matrix()

        def sp(v):
            return math.copysign(abs(v) ** box, v)

        def place(theta, phi):
            u = Vector((sp(math.sin(theta) * math.cos(phi)), sp(math.sin(theta) * math.sin(phi)), sp(math.cos(theta))))
            return c + rm @ Vector((u.x * rad.x, u.y * rad.y, u.z * rad.z))

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

    def bar(self, a, b, r, segs, mat, w, caps=False, flare=0.0):
        """Прямий прут; flare > 0 додає м'які розширення-«комірці» на кінцях."""
        a, b = Vector(a), Vector(b)
        if flare > 0.0:
            d = (b - a).normalized() * flare * 1.6
            self.tube([a, a + d, b - d, b], [r + flare, r, r, r + flare], segs, mat, w, cap_start=caps, cap_end=caps)
        else:
            self.tube([a, b], r, segs, mat, w, cap_start=caps, cap_end=caps)

    def torus(self, center, major, minor, n, segs, mat, w, axis='Y'):
        """Кільце; axis — нормаль до площини кільця."""
        c = Vector(center)
        ring = []
        for i in range(n + 1):
            a = 2.0 * math.pi * i / n
            ca, sa = math.cos(a) * major, math.sin(a) * major
            ring.append(c + {'X': Vector((0, ca, sa)), 'Y': Vector((ca, 0, sa)), 'Z': Vector((ca, sa, 0))}[axis])
        hint = {'X': X_AXIS, 'Y': Y_AXIS, 'Z': Z_AXIS}[axis]
        self.tube(ring, minor, segs, mat, w, hint=hint, cap_start=False, cap_end=False)

    def slab(self, half, corner, z0, z1, bevel, mat, w, caps=True, arc=4):
        """Плита з округлими кутами та м'якою фаскою по краях."""
        wi, mi = self._spec(w), self.mat_keys.index(mat)

        def outline(inset, z):
            h, r = half - inset, max(corner - inset, 0.01)
            pts = []
            for q in range(4):
                cx = (h - r) * (1 if q in (0, 3) else -1)
                cy = (h - r) * (1 if q in (0, 1) else -1)
                for i in range(arc + 1):
                    a = math.pi / 2.0 * (q + i / arc)
                    pts.append(self._v((cx + r * math.cos(a), cy + r * math.sin(a), z), wi))
            return pts

        if bevel > 0.0:
            rings = [outline(bevel, z0), outline(0.0, z0 + bevel), outline(0.0, z1 - bevel), outline(bevel, z1)]
        else:
            rings = [outline(0.0, z0), outline(0.0, z1)]
        n = len(rings[0])
        for ra, rb in zip(rings, rings[1:]):
            for i in range(n):
                ni = (i + 1) % n
                self._f((ra[i], ra[ni], rb[ni], rb[i]), mi)
        if caps:
            self._f(list(reversed(rings[0])), mi).smooth = False
            self._f(rings[-1], mi).smooth = False

    def heart(self, center, width, thick, n, mat, w):
        """Пухке серце у площині XZ (товщина вздовж Y); center — нуль параметричної кривої."""
        wi, mi = self._spec(w), self.mat_keys.index(mat)
        c, sc, ht = Vector(center), width / 32.0, thick * 0.5
        curve = []
        for i in range(n):
            t = 2.0 * math.pi * i / n
            curve.append((16.0 * math.sin(t) ** 3,
                          13.0 * math.cos(t) - 5.0 * math.cos(2 * t) - 2.0 * math.cos(3 * t) - math.cos(4 * t)))

        def ring(s, y):
            return [self._v(c + Vector((x * s * sc, y, (-2.0 + (z + 2.0) * s) * sc)), wi) for x, z in curve]

        rings = [ring(0.50, ht * 1.12), ring(0.88, ht), ring(1.0, ht * 0.5),
                 ring(1.0, -ht * 0.5), ring(0.88, -ht), ring(0.50, -ht * 1.2)]
        for ra, rb in zip(rings, rings[1:]):
            for i in range(n):
                ni = (i + 1) % n
                self._f((ra[i], ra[ni], rb[ni], rb[i]), mi)
        back = self._v(c + Vector((0, ht * 1.18, -2.0 * sc)), wi)
        front = self._v(c + Vector((0, -ht * 1.3, -2.0 * sc)), wi)
        for i in range(n):
            ni = (i + 1) % n
            self._f((back, rings[0][ni], rings[0][i]), mi)
            self._f((front, rings[-1][i], rings[-1][ni]), mi)

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

    def max_z(self):
        return max(v.co.z for v in self.bm.verts)

    def finish(self, collection, mats, k=1.0, off=(0, 0, 0)):
        bm = self.bm
        self.k, self.off = k, Vector(off)
        for v in bm.verts:
            v.co = v.co * k + self.off
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
# 3. КЛІТКА, ДВЕРЦЯТА, ЗАМОК
# ==============================================================================

ROOT_W = {"root_cage": 1.0}
DOOR_W = {"door_hinge": 1.0}

def build_cage_body():
    mb = MeshBuilder("Cage_Body", ("iron", "wood"))
    # Дерев'яна основа й дах, обидва з кованою стрічкою по периметру
    mb.slab(HALF - 0.005, 0.12, 0.0, FLOOR, 0.02, "wood", ROOT_W)
    mb.slab(HALF, 0.125, 0.045, 0.095, 0.0, "iron", ROOT_W, caps=False)
    mb.slab(HALF - 0.005, 0.12, ROOF_Z0, ROOF_Z1, 0.02, "wood", ROOT_W)
    mb.slab(HALF, 0.125, ROOF_Z0 + 0.035, ROOF_Z1 - 0.035, 0.0, "iron", ROOT_W, caps=False)
    mb.torus((0, 0, TOP - 0.05), 0.036, 0.013, 12, 6, "iron", ROOT_W, axis='Y')

    z0, z1 = FLOOR - 0.01, ROOF_Z0 + 0.01
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.bar((sx * PC, sy * PC, z0), (sx * PC, sy * PC, z1), POST_R, 8, "iron", ROOT_W, flare=0.016)
    # Бокові й задні ґрати з двома поперечками
    for c in (-0.46, -0.23, 0.0, 0.23, 0.46):
        mb.bar((-PC, c, z0), (-PC, c, z1), 0.022, 6, "iron", ROOT_W)
        mb.bar((PC, c, z0), (PC, c, z1), 0.022, 6, "iron", ROOT_W)
        mb.bar((c, PC, z0), (c, PC, z1), 0.022, 6, "iron", ROOT_W)
    for z in (0.60, RAIL_Z):
        mb.bar((-PC, -PC, z), (-PC, PC, z), 0.02, 6, "iron", ROOT_W)
        mb.bar((PC, -PC, z), (PC, PC, z), 0.02, 6, "iron", ROOT_W)
        mb.bar((-PC, PC, z), (PC, PC, z), 0.02, 6, "iron", ROOT_W)
        for sx in (-1, 1):
            mb.bar((sx * JAMB_X, FY, z), (sx * PC, FY, z), 0.02, 6, "iron", ROOT_W)
    # Одвірок дверцят і скоба, крізь яку проходить дужка замка
    for sx in (-1, 1):
        mb.bar((sx * JAMB_X, FY, z0), (sx * JAMB_X, FY, z1), 0.03, 8, "iron", ROOT_W)
    mb.torus((LOCK_X, LOCK_Y, SHACKLE_TOP + 0.006), 0.034, 0.011, 10, 5, "iron", ROOT_W, axis='X')
    mb.bar((JAMB_X, FY, SHACKLE_TOP + 0.006), (LOCK_X, LOCK_Y + 0.03, SHACKLE_TOP + 0.006), 0.014, 5, "iron", ROOT_W)
    return mb

def build_cage_door():
    mb = MeshBuilder("Cage_Door", ("iron",))
    for sx in (-1, 1):
        mb.bar((sx * DOOR_X, FY, DOOR_Z0), (sx * DOOR_X, FY, DOOR_Z1), 0.026, 8, "iron", DOOR_W, caps=True)
    for z, r in ((DOOR_Z0, 0.026), (DOOR_Z1, 0.026), (RAIL_Z, 0.021)):
        mb.bar((-DOOR_X, FY, z), (DOOR_X, FY, z), r, 8, "iron", DOOR_W, caps=True)
    for x in DOOR_BARS:
        mb.bar((x, FY, DOOR_Z0), (x, FY, DOOR_Z1), 0.02, 6, "iron", DOOR_W)
    # Петлі на осі повороту та накладка засува біля замка
    for z in (0.44, 1.32):
        mb.bar((HINGE.x, HINGE.y, z - 0.07), (HINGE.x, HINGE.y, z + 0.07), 0.024, 8, "iron", DOOR_W, caps=True)
        mb.bar((HINGE.x, HINGE.y, z), (-DOOR_X, FY, z), 0.016, 5, "iron", DOOR_W)
    mb.ellipsoid((DOOR_X - 0.035, FY - 0.03, SHACKLE_TOP + 0.006), (0.085, 0.012, 0.042), 8, 4, "iron", DOOR_W, box=0.4)
    return mb

def lock_layout():
    sc = LOCK_W / 32.0
    lobe_top = SHACKLE_TOP + SHACKLE_TUBE - 0.084      # дужка здіймається на 8.4 см над серцем
    center_z = lobe_top - 11.92 * sc                    # нуль параметричної кривої серця
    return sc, lobe_top, center_z

def build_lock():
    mb = MeshBuilder("Golden_Heart_Lock", ("gold", "keyhole"))
    body, shackle = {"lock_pivot": 1.0}, {"lock_shackle": 1.0}
    sc, lobe_top, cz = lock_layout()
    mb.heart((LOCK_X, LOCK_Y, cz), LOCK_W, LOCK_T, 32, "gold", body)
    # Накладка із замковою щілиною: темне «вічко» з прорізом донизу
    face_y = LOCK_Y - LOCK_T * 0.5 * 1.3
    kz = cz - 2.0 * sc
    mb.ellipsoid((LOCK_X, face_y + 0.006, kz), (0.068, 0.014, 0.075), 12, 4, "gold", body)
    mb.ellipsoid((LOCK_X, face_y - 0.004, kz + 0.018), (0.027, 0.008, 0.027), 10, 4, "keyhole", body)
    mb.ellipsoid((LOCK_X, face_y - 0.004, kz - 0.018), (0.014, 0.008, 0.04), 8, 4, "keyhole", body)
    # Дужка: дві ніжки й півколо
    arc_z = SHACKLE_TOP - SHACKLE_R
    path = [Vector((LOCK_X + SHACKLE_R, LOCK_Y, lobe_top - 0.05))]
    for i in range(9):
        a = math.pi * i / 8
        path.append(Vector((LOCK_X + SHACKLE_R * math.cos(a), LOCK_Y, arc_z + SHACKLE_R * math.sin(a))))
    path.append(Vector((LOCK_X - SHACKLE_R, LOCK_Y, lobe_top - 0.05)))
    mb.tube(path, SHACKLE_TUBE, 8, "gold", shackle, hint=(0, 1, 0))
    return mb

# ==============================================================================
# 4. ФІОЛЕТОВИЙ ПЛЮЩ
# ==============================================================================

def perim(s, off=0.0):
    """Точка й зовнішня нормаль на обводі клітки. s у [0, 4): ціле s — середина кута,
    0..1 — фасад (зліва направо для глядача), 1..2 — правий бік, 2..3 — тил, 3..4 — лівий бік."""
    r = POST_R + 0.03 + off
    a, b = 2.0 * PC, math.pi * r / 2.0
    unit = a + b
    d = (s % 4.0) * unit + b / 2.0
    seg = int(d // unit)
    rem = d - seg * unit
    if rem < b:
        ang = math.pi + (rem / b) * (math.pi / 2.0)
        n = Vector((math.cos(ang), math.sin(ang)))
        p = Vector((-PC, -PC)) + n * r
    else:
        x = rem - b
        dip = 0.026 * smooth(min(x, a - x) / 0.10)     # на гранях плющ лягає просто на прути
        p, n = Vector((-PC + x, -PC - r + dip)), Vector((0.0, -1.0))
    for _ in range(seg % 4):
        p, n = Vector((-p.y, p.x)), Vector((-n.y, n.x))
    return p, n

def spline(way, n):
    """Catmull-Rom крізь опорні точки (s, z), n рівномірних відліків."""
    pts = [way[0]] + list(way) + [way[-1]]
    out = []
    for i in range(n):
        f = i / (n - 1) * (len(way) - 1)
        k = min(int(f), len(way) - 2)
        t = f - k
        p0, p1, p2, p3 = pts[k], pts[k + 1], pts[k + 2], pts[k + 3]
        out.append(tuple(
            0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                   + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    return out

IVY_BRANCHES = [
    # корінь у куті s = індекс; головне стебло та бічні пагони (start_u — звідки на головному відгалужується)
    {"main": [(0.0, 0.02), (0.03, 0.5), (0.10, 1.0), (0.25, 1.32), (0.55, 1.42), (0.85, 1.56)],
     "subs": [(0.22, [(0.2, 0.36), (0.42, 0.29), (0.62, 0.34)]),
              (0.45, [(0.16, 1.5), (0.3, 1.58), (0.5, 1.62)])]},
    {"main": [(1.0, 0.02), (1.04, 0.45), (1.12, 0.85), (1.3, 1.2), (1.55, 1.45), (1.8, 1.58)],
     "subs": [(0.62, [(1.1, 1.32), (0.95, 1.33), (0.75, 1.27), (0.58, 1.18), (0.45, 1.24)]),
              (0.2, [(0.93, 0.42), (0.8, 0.5), (0.7, 0.42)])]},
    {"main": [(2.0, 0.02), (2.05, 0.5), (2.2, 0.9), (2.5, 1.2), (2.8, 1.45), (3.05, 1.6)],
     "subs": [(0.2, [(1.9, 0.6), (1.7, 0.72), (1.5, 0.65)])]},
    {"main": [(3.0, 0.02), (3.04, 0.5), (3.15, 0.95), (3.4, 1.25), (3.7, 1.45), (3.97, 1.58)],
     "subs": [(0.18, [(2.9, 0.55), (2.7, 0.6), (2.5, 0.5)])]},
]

def ivy_bones(i):
    b = f"ivy_branch_{i + 1:02d}"
    return b, b + "_mid", b + "_tip"

def build_ivy():
    mb = MeshBuilder("Purple_Ivy_Vines", ("stem", "leaf", "glow"))
    rng = random.Random(11)
    leaf_no = [0]

    def leaf(base, d, nrm, size, w):
        wi, mi = mb._spec(w), mb.mat_keys.index("leaf")
        a = nrm.cross(d).normalized()
        ln = d.cross(a).normalized()
        if ln.dot(nrm) < 0.0:
            ln = -ln
        b = mb._v(base, wi)
        l = mb._v(base + d * 0.42 * size + a * 0.44 * size, wi)
        r = mb._v(base + d * 0.42 * size - a * 0.44 * size, wi)
        tip = mb._v(base + d * size, wi)
        mid = base + d * 0.5 * size + ln * 0.14 * size
        c = mb._v(mid, wi)
        mb._f((b, r, c, l), mi)
        mb._f((c, r, tip, l), mi)
        leaf_no[0] += 1
        if leaf_no[0] % 2 == 0:      # світна прожилка на кожному другому листку
            gi = mb.mat_keys.index("glow")
            up = ln * 0.008
            mb._f((mb._v(base + d * 0.12 * size + up, wi), mb._v(mid - a * 0.035 * size + up, wi),
                   mb._v(base + d * 0.9 * size + up, wi), mb._v(mid + a * 0.035 * size + up, wi)), gi)

    def thorn(p, d, w):
        wi, mi = mb._spec(w), mb.mat_keys.index("stem")
        a = d.cross(Z_AXIS if abs(d.z) < 0.9 else X_AXIS).normalized()
        b = d.cross(a)
        base = [mb._v(p + (a * math.cos(q) + b * math.sin(q)) * 0.011, wi) for q in (0.0, 2.094, 4.189)]
        apex = mb._v(p + d * 0.045, wi)
        mb._f(base, mi)
        for i in range(3):
            mb._f((base[i], base[(i + 1) % 3], apex), mi)

    def vine(branch, sz, r0, r1, ph):
        names = ivy_bones(branch)
        w = ('z', [(names[0], 0.25), (names[1], 0.85), (names[2], 1.45)])
        n = len(sz)
        pts, nrms, radii = [], [], []
        for i, (s, z) in enumerate(sz):
            u = i / (n - 1)
            env = math.sin(math.pi * u) ** 0.6
            s += 0.022 * math.sin(2 * math.pi * 3.0 * u + ph) * env
            z += 0.045 * math.sin(2 * math.pi * 3.0 * u + ph + 1.4) * env
            z = max(0.02, min(1.70, z))
            off = 0.004 * math.sin(11.0 * u + ph) + 0.045 * smooth((0.24 - z) / 0.08) + 0.045 * smooth((z - 1.50) / 0.08)
            p, nr = perim(s, off)
            pts.append(Vector((p.x, p.y, z)))
            nrms.append(Vector((nr.x, nr.y, 0.0)))
            radii.append(lerp(r0, r1, u))
        mb.tube(pts, radii, 5, "stem", w, hint=nrms[0])
        for i in range(2, n - 1):
            t = (pts[i + 1] - pts[i - 1]).normalized()
            side = nrms[i].cross(t).normalized() * (1 if i % 2 else -1)
            if i % 2 == 0 or rng.random() < 0.3:
                d = (side * rng.uniform(0.6, 1.0) + Vector((0, 0, -rng.uniform(0.35, 0.8)))
                     + nrms[i] * rng.uniform(0.25, 0.45)).normalized()
                leaf(pts[i] + nrms[i] * radii[i] * 0.5, d, nrms[i], rng.uniform(0.085, 0.13), w)
            if i % 4 == 0:
                d = (nrms[i] * 0.8 - side * 0.6 + Vector((0, 0, rng.uniform(-0.3, 0.3)))).normalized()
                thorn(pts[i] + d * radii[i] * 0.7, d, w)
            if i % 7 == 3:
                mb.ellipsoid(pts[i] + nrms[i] * (radii[i] + 0.014) - side * 0.02, (0.024, 0.024, 0.03), 4, 2, "glow", w)
        mb.ellipsoid(pts[-1] + nrms[-1] * 0.012, (0.028, 0.028, 0.036), 4, 2, "glow", w)

    for bi, br in enumerate(IVY_BRANCHES):
        main = spline(br["main"], 36)
        vine(bi, main, 0.03, 0.014, bi * 1.7)
        for si, (start_u, way) in enumerate(br["subs"]):
            start = main[int(start_u * (len(main) - 1))]
            vine(bi, spline([start] + way, 8 + 4 * len(way)), 0.02, 0.01, bi * 1.7 + 2.1 + si)
    return mb

# ==============================================================================
# 5. ВЕДМЕЖА (дизайн-простір: стоїть у нулі, зріст ~0.98)
# ==============================================================================

SHOULDER = {s: Vector((s * 0.15, 0.0, 0.53)) for s in (1.0, -1.0)}
ELBOW = {s: Vector((s * 0.245, -0.005, 0.425)) for s in (1.0, -1.0)}
WRIST = {s: Vector((s * 0.335, -0.01, 0.32)) for s in (1.0, -1.0)}
HAND_TIP = {s: Vector((s * 0.385, -0.01, 0.262)) for s in (1.0, -1.0)}
HIP = {s: Vector((s * 0.085, 0.0, 0.26)) for s in (1.0, -1.0)}
KNEE = {s: Vector((s * 0.095, -0.02, 0.15)) for s in (1.0, -1.0)}
ANKLE = {s: Vector((s * 0.10, 0.0, 0.045)) for s in (1.0, -1.0)}
BODY_C = Vector((0.0, 0.0, 0.40))
PELVIS_HEAD = Vector((0.0, 0.0, 0.27))
TORSO_W = ('z', [("pelvis", 0.27), ("spine_01", 0.40), ("spine_02", 0.52)])

def side_name(s):
    return "L" if s > 0 else "R"

def build_cub():
    mb = MeshBuilder("Bear_Cub_Captive", ("fur", "muzzle", "nose", "eye", "spec", "blush"))
    head = {"head": 1.0}
    # Тулуб, світле черевце, хвостик
    mb.ellipsoid(BODY_C, (0.175, 0.155, 0.20), 20, 12, "fur", TORSO_W)
    mb.ellipsoid((0.0, -0.105, 0.39), (0.115, 0.06, 0.13), 12, 6, "muzzle", TORSO_W)
    mb.ellipsoid((0.0, 0.16, 0.30), (0.05, 0.05, 0.045), 8, 6, "fur", {"pelvis": 1.0})
    # Велика голова, вуха
    mb.ellipsoid((0.0, -0.01, 0.74), (0.22, 0.20, 0.19), 24, 14, "fur", head)
    for s in (1.0, -1.0):
        ear = {f"ear.{side_name(s)}": 1.0}
        mb.ellipsoid((s * 0.155, 0.0, 0.905), (0.075, 0.04, 0.075), 10, 6, "fur", ear, rot=(0, s * 0.25, 0))
        mb.ellipsoid((s * 0.153, -0.027, 0.902), (0.048, 0.018, 0.048), 8, 4, "blush", ear, rot=(0, s * 0.25, 0))
    # Мордочка: ніс, рот, великі очі з бліками, рум'янець
    mb.ellipsoid((0.0, -0.175, 0.69), (0.095, 0.075, 0.068), 14, 8, "muzzle", head)
    mb.ellipsoid((0.0, -0.245, 0.715), (0.034, 0.022, 0.024), 8, 6, "nose", head)
    mb.ellipsoid((0.0, -0.246, 0.672), (0.007, 0.007, 0.02), 6, 4, "nose", head)
    for s in (1.0, -1.0):
        mb.ellipsoid((s * 0.085, -0.188, 0.762), (0.03, 0.02, 0.037), 8, 6, "eye", head)
        mb.ellipsoid((s * 0.076, -0.206, 0.775), (0.01, 0.006, 0.01), 6, 4, "spec", head)
        mb.ellipsoid((s * 0.145, -0.15, 0.69), (0.036, 0.012, 0.022), 8, 4, "blush", head, rot=(0, 0, s * 0.6))
    # Лапки
    for s in (1.0, -1.0):
        sn = side_name(s)
        mb.limb(SHOULDER[s], ELBOW[s], WRIST[s], 0.065, 0.058, 0.055, 10, 3, "fur",
                ('auto', [f"upperarm.{sn}", f"lowerarm.{sn}", f"hand.{sn}"], 4.0))
        mb.ellipsoid(WRIST[s].lerp(HAND_TIP[s], 0.45), (0.064, 0.064, 0.064), 10, 6, "fur", {f"hand.{sn}": 1.0})
        mb.limb(HIP[s], KNEE[s], ANKLE[s], 0.085, 0.076, 0.07, 10, 3, "fur",
                ('auto', [f"thigh.{sn}", f"calf.{sn}", f"foot.{sn}"], 4.0), round_end=False)
        mb.ellipsoid((s * 0.10, -0.045, 0.04), (0.075, 0.105, 0.04), 12, 6, "fur", {f"foot.{sn}": 1.0})
    return mb

def build_bow():
    mb = MeshBuilder("Cub_Bow", ("bow",))
    head = {"head": 1.0}
    c = Vector((0.09, -0.075, 0.918))
    for s in (1.0, -1.0):
        mb.ellipsoid(c + Vector((s * 0.05, 0, 0.008)), (0.052, 0.022, 0.04), 8, 6, "bow", head, rot=(0, -s * 0.35, 0))
    mb.ellipsoid(c, (0.024, 0.026, 0.026), 6, 4, "bow", head)
    return mb

def build_kerchief():
    mb = MeshBuilder("Cub_Kerchief", ("kerchief",))
    w = {"neck": 0.5, "spine_02": 0.5}
    ring = []
    for i in range(17):
        a = 2.0 * math.pi * i / 16
        ring.append(Vector((0.125 * math.sin(a), -0.115 * math.cos(a), 0.578 + 0.008 * math.cos(a))))
    mb.tube(ring, 0.034, 6, "kerchief", w, hint=(0, 0, 1), scale=(0.8, 1.0), cap_start=False, cap_end=False)
    mb.ellipsoid((0.0, -0.137, 0.512), (0.075, 0.02, 0.065), 8, 4, "kerchief", {"spine_02": 1.0}, rot=(0.25, 0, 0))
    return mb

# ==============================================================================
# 6. СКЕЛЕТИ ТА СКІНІНГ
# ==============================================================================

def new_armature(collection, name):
    data = bpy.data.armatures.new(name + "_Data")
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(bname, head, tail, parent=None, connected=False):
        b = data.edit_bones.new(bname)
        b.head, b.tail = Vector(head), Vector(tail)
        b.use_deform = True
        if parent:
            b.parent = parent
            b.use_connect = connected
        return b
    return obj, bone

def build_cage_rig(collection):
    obj, bone = new_armature(collection, "Rig_Cage")
    root = bone("root_cage", (0, 0, 0), (0, 0.3, 0))
    hinge = bone("door_hinge", (HINGE.x, HINGE.y, DOOR_Z0), (HINGE.x, HINGE.y, DOOR_Z0 + 0.6), root)
    sc, lobe_top, cz = lock_layout()
    lock = bone("lock_pivot", (LOCK_X, LOCK_Y, SHACKLE_TOP), (LOCK_X, LOCK_Y, cz - 17.0 * sc), hinge)
    bone("lock_shackle", (LOCK_X + SHACKLE_R, LOCK_Y, lobe_top - 0.03), (LOCK_X + SHACKLE_R, LOCK_Y, SHACKLE_TOP), lock)
    for i in range(4):
        p, _ = perim(float(i), 0.03)
        for name, length in zip(ivy_bones(i), (0.35, 0.65, 0.95)):
            bone(name, (p.x, p.y, 0.0), (p.x, p.y, length), root)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

def build_cub_rig(collection, k, off):
    obj, bone = new_armature(collection, "Rig_BearCub")

    def P(v):
        return Vector(v) * k + off

    root = bone("root_cub", (0, off.y, 0), (0, off.y + 0.2, 0))
    pelvis = bone("pelvis", P(PELVIS_HEAD), P((0, 0, 0.37)), root)
    spine1 = bone("spine_01", P((0, 0, 0.37)), P((0, 0, 0.47)), pelvis, True)
    spine2 = bone("spine_02", P((0, 0, 0.47)), P((0, 0, 0.56)), spine1, True)
    neck = bone("neck", P((0, 0, 0.56)), P((0, 0, 0.60)), spine2, True)
    head = bone("head", P((0, 0, 0.60)), P((0, 0, 0.92)), neck, True)
    for s in (1.0, -1.0):
        sn = side_name(s)
        bone(f"ear.{sn}", P((s * 0.13, 0, 0.87)), P((s * 0.19, 0, 0.975)), head)
        ua = bone(f"upperarm.{sn}", P(SHOULDER[s]), P(ELBOW[s]), spine2)
        la = bone(f"lowerarm.{sn}", P(ELBOW[s]), P(WRIST[s]), ua, True)
        bone(f"hand.{sn}", P(WRIST[s]), P(HAND_TIP[s]), la, True)
        th = bone(f"thigh.{sn}", P(HIP[s]), P(KNEE[s]), pelvis)
        ca = bone(f"calf.{sn}", P(KNEE[s]), P(ANKLE[s]), th, True)
        bone(f"foot.{sn}", P(ANKLE[s]), P((s * 0.10, -0.13, 0.02)), ca, True)
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj

def dist_to_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + t * ab)).length

def skin(obj, mb, arm_obj):
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
            z = (v.co.z - mb.off.z) / mb.k
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
# 7. АНІМАЦІЇ: пози задаються у просторі арматури, FK/IK рахується тут же
# ==============================================================================

class FK:
    """Команди на кістку (усі напрямки й точки — у просторі арматури):
       ('rot', quat, loc?)            — поворот довкола осей арматури поверх успадкованої пози (+ зсув);
       ('local', quat, loc?)          — поворот і зсув у власних осях кістки;
       ('abs', quat)                  — орієнтація = quat @ орієнтація спокою, незалежно від батька;
       ('aim', dir)                   — спрямувати кістку вздовж напрямку;
       ('ik', child, target, pole)    — двокісткова IK: кінець дочірньої кістки тягнеться до target;
       ('mat', Matrix)                — повна матриця кістки."""

    def __init__(self, arm_obj):
        bones = arm_obj.data.bones
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.rest_inv = {n: m.inverted() for n, m in self.rest.items()}
        self.length = {b.name: b.length for b in bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in bones}
        self.order = []

        def visit(b):
            self.order.append(b.name)
            for c in b.children:
                visit(c)
        for b in bones:
            if b.parent is None:
                visit(b)

    @staticmethod
    def _aim(pre3_inv, direction):
        d = (pre3_inv @ Vector(direction)).normalized()
        return Y_AXIS.rotation_difference(d).to_matrix().to_4x4()

    def solve(self, cmds):
        pose, basis, pending = {}, {}, {}
        for name in self.order:
            p = self.parent[name]
            pre = (pose[p] @ self.rest_inv[p] @ self.rest[name]) if p else self.rest[name].copy()
            c = cmds.get(name) or pending.get(name)
            b = Matrix.Identity(4)
            if c:
                pre3 = pre.to_3x3()
                pre3_inv = pre3.inverted()
                kind = c[0]
                if kind == 'rot':
                    b = (pre3_inv @ c[1].to_matrix() @ pre3).to_4x4()
                    if len(c) > 2 and c[2] is not None:
                        b.translation = pre3_inv @ Vector(c[2])
                elif kind == 'local':
                    b = c[1].to_matrix().to_4x4()
                    if len(c) > 2 and c[2] is not None:
                        b.translation = Vector(c[2])
                elif kind == 'abs':
                    b = (pre3_inv @ c[1].to_matrix() @ self.rest[name].to_3x3()).to_4x4()
                elif kind == 'aim':
                    b = self._aim(pre3_inv, c[1])
                elif kind == 'ik':
                    child, target, pole = c[1], Vector(c[2]), Vector(c[3])
                    a = pre.translation
                    l1, l2 = self.length[name], self.length[child]
                    d = target - a
                    dist = max(abs(l1 - l2) + 1e-4, min(d.length, (l1 + l2) * 0.999))
                    dn = d.normalized()
                    cos_a = max(-1.0, min(1.0, (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)))
                    perp = pole - dn * pole.dot(dn)
                    perp = perp.normalized() if perp.length > 1e-6 else dn.orthogonal().normalized()
                    joint = a + dn * (cos_a * l1) + perp * (math.sqrt(max(0.0, 1.0 - cos_a * cos_a)) * l1)
                    b = self._aim(pre3_inv, joint - a)
                    pending[child] = ('aim', (a + dn * dist) - joint)
                elif kind == 'mat':
                    b = pre.inverted() @ c[1]
            pose[name] = pre @ b
            basis[name] = b
        return basis, pose

def bake_action(arm_obj, fk, name, frames, pose_fn, loc_bones=(), scale_bones=(), solo=False):
    """Ключі на кадрах 0..frames => тривалість рівно frames / 30 с.
    pose_fn(t) повертає (команди FK, {кістка: (sx, sy, sz)})."""
    action = bpy.data.actions.new(name)
    arm_obj.animation_data.action = action
    prev = {}
    for f in range(frames + 1):
        cmds, scales = pose_fn(f / frames)
        basis, _ = fk.solve(cmds)
        for pb in arm_obj.pose.bones:
            b = basis[pb.name]
            q = b.to_quaternion()
            if pb.name in prev and prev[pb.name].dot(q) < 0.0:
                q.negate()
            prev[pb.name] = q.copy()
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = q
            pb.keyframe_insert(data_path="rotation_quaternion", frame=f)
            if pb.name in loc_bones:
                pb.location = b.translation
                pb.keyframe_insert(data_path="location", frame=f)
            if pb.name in scale_bones:
                pb.scale = scales.get(pb.name, (1.0, 1.0, 1.0))
                pb.keyframe_insert(data_path="scale", frame=f)
    action.use_fake_user = True
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    track.mute = not solo
    arm_obj.animation_data.action = None
    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)

# --- Клітка -------------------------------------------------------------------

def build_cage_animations(arm_obj):
    arm_obj.animation_data_create()
    fk = FK(arm_obj)
    ivy_all = [n for i in range(4) for n in ivy_bones(i)]
    lock_rest = fk.rest["lock_pivot"]
    lock_rest3 = lock_rest.to_3x3()
    lock_flat = Q(Z_AXIS, 28.0) @ Q(X_AXIS, -90.0)       # лежить на землі лицем догори

    def locked_idle(t):
        ph = 2.0 * math.pi * t
        cmds = {"lock_pivot": ('rot', Q(X_AXIS, 2.0 * math.sin(2 * ph + 0.5)) @ Q(Y_AXIS, 5.0 * math.sin(ph)))}
        scales = {}
        for i in range(4):
            for j, n in enumerate(ivy_bones(i)):
                a = ph + i * 1.3 + j * 0.7
                h = 1.0 + 0.018 * math.sin(a)
                scales[n] = (h, 1.0 + 0.012 * math.sin(a + 1.0), h)
        return cmds, scales

    def unlock_open(t):
        cmds, scales = {}, {}
        # 1) замок здригається, дужка клацає й відкидається
        es = smooth((t - 0.10) / 0.10)
        cmds["lock_shackle"] = ('local', Q(Y_AXIS, 95.0 * es), (0.0, 0.03 * es, 0.0))
        if t < 0.22:
            shake = 12.0 * math.sin(2.0 * math.pi * 3.0 * t / 0.12) * (1.0 - clamp01(t / 0.12)) if t < 0.12 else 0.0
            cmds["lock_pivot"] = ('rot', Q(Y_AXIS, shake))
        else:
            # 2) замок падає на землю перед кліткою і завмирає відкритим
            u = clamp01((t - 0.22) / 0.20)
            pos = lock_rest.translation.lerp(LOCK_GROUND, smooth(u))
            pos.z = lerp(lock_rest.translation.z, LOCK_GROUND.z, u * u) + 0.05 * bump(t, 0.42, 0.54)
            q = Quaternion().slerp(lock_flat, smooth(u))
            m = (q.to_matrix() @ lock_rest3).to_4x4()
            m.translation = pos
            cmds["lock_pivot"] = ('mat', m)
        # 3) плющ в'яне згори донизу: осідає на землю і стягується до коренів
        for i in range(4):
            for j, n in enumerate(reversed(ivy_bones(i))):       # кінчик -> середина -> основа
                start = 0.05 + 0.035 * i + 0.09 * j
                h = lerp(1.0, 0.055, smooth((t - start) / 0.34))
                w = lerp(1.0, 0.30, smooth((t - start - 0.08) / 0.34))
                scales[n] = (w, h, w)
        # 4) дверцята плавно розчиняються назовні
        cmds["door_hinge"] = ('rot', Q(Z_AXIS, -DOOR_OPEN_DEG * smooth((t - 0.42) / 0.55)))
        return cmds, scales

    loc = ("lock_pivot", "lock_shackle")
    bake_action(arm_obj, fk, "Cage_Locked_Idle", 60, locked_idle, loc, ivy_all, solo=True)
    bake_action(arm_obj, fk, "Cage_Unlock_Open", 45, unlock_open, loc, ivy_all)

# --- Ведмежа ------------------------------------------------------------------

def build_cub_animations(arm_obj, k, off):
    arm_obj.animation_data_create()
    fk = FK(arm_obj)

    def P(v):
        return Vector(v) * k + off

    c_rest, pel = P(BODY_C), P(PELVIS_HEAD)
    ank = {s: P(ANKLE[s]) for s in (1.0, -1.0)}
    arm_rest = {s: (ELBOW[s] - SHOULDER[s]).normalized() for s in (1.0, -1.0)}

    def body(cmds, r, d):
        """Тіло як ціле: поворот r довкола центру тулуба та зсув d."""
        cmds["pelvis"] = ('rot', r, Vector(d) + r @ (pel - c_rest) - (pel - c_rest))

    def body_pt(r, d, p):
        return c_rest + Vector(d) + r @ (p - c_rest)

    def legs(cmds, r, d, ground, air=0.0, tuck=(0.0, -0.02, 0.05)):
        """Стопи стоять у ground[s] (зсув від пози спокою); air = 1 підтягує їх до тіла в польоті."""
        for s in (1.0, -1.0):
            sn = side_name(s)
            g = ank[s] + Vector(ground[s] if isinstance(ground, dict) else ground)
            a = body_pt(r, d, ank[s] + Vector(tuck))
            cmds[f"thigh.{sn}"] = ('ik', f"calf.{sn}", g.lerp(a, air), r @ Vector((s * 0.25, -1.0, 0.1)))
            cmds[f"foot.{sn}"] = ('abs', Quaternion().slerp(r, air))

    def ears(cmds, droop, flutter):
        for s in (1.0, -1.0):
            cmds[f"ear.{side_name(s)}"] = ('rot', Q(X_AXIS, -droop * 0.35) @ Q(Y_AXIS, s * (droop + flutter * (1 if s > 0 else 0.7))))

    def grip(cmds, s, target):
        sn = side_name(s)
        cmds[f"upperarm.{sn}"] = ('ik', f"lowerarm.{sn}", target, (s * 0.6, 0.25, -1.0))
        cmds[f"hand.{sn}"] = ('aim', (0.0, -0.85, 0.5))

    bar_y = FY + 0.05

    def captive_sad(t):
        ph = 2.0 * math.pi * t
        cmds = {}
        r = Q(X_AXIS, 7.0 + 1.0 * math.sin(ph))
        d = (0.008 * math.sin(ph), -0.055, -0.012 - 0.005 * math.sin(2 * ph))
        body(cmds, r, d)
        legs(cmds, r, d, (0, 0, 0))
        cmds["spine_01"] = ('rot', Q(X_AXIS, 4.0))
        cmds["spine_02"] = ('rot', Q(X_AXIS, 5.0 + 1.5 * math.sin(2 * ph)))
        cmds["neck"] = ('rot', Q(X_AXIS, 7.0))
        cmds["head"] = ('rot', Q(Z_AXIS, 5.0 * math.sin(ph)) @ Q(Y_AXIS, 4.0 * math.sin(ph + 1.0))
                        @ Q(X_AXIS, 13.0 + 3.0 * math.sin(2 * ph + 0.6)))
        ears(cmds, 24.0, 6.0 * math.sin(2 * ph + 0.4))
        for s in (1.0, -1.0):
            grip(cmds, s, (s * GRIP_X, bar_y, GRIP_Z))
        return cmds, {}

    def captive_call_help(t):
        ph = 2.0 * math.pi * t
        hop = math.sin(2 * ph)                      # два підстрибування за цикл
        up, down = max(0.0, hop), max(0.0, -hop)
        cmds = {}
        r = Q(Z_AXIS, -13.0) @ Q(X_AXIS, 6.0 - 4.0 * up)
        d = (0.0, -0.06, 0.11 * up - 0.03 * down)
        body(cmds, r, d)
        legs(cmds, r, d, (0, -0.02, 0), air=smooth(up * 1.6), tuck=(0.0, -0.01, 0.03))
        cmds["spine_02"] = ('rot', Q(X_AXIS, 3.0))
        cmds["head"] = ('rot', Q(Z_AXIS, 13.0) @ Q(Y_AXIS, 7.0 * math.sin(ph)) @ Q(X_AXIS, -12.0 - 5.0 * up))
        ears(cmds, -6.0, 9.0 * math.sin(3 * ph))
        grip(cmds, -1.0, (-GRIP_X, bar_y, GRIP_Z + 0.07 * up))
        # ліва лапка просунута між прутами й махає
        wave = math.sin(3 * ph)
        cmds["upperarm.L"] = ('ik', "lowerarm.L", (0.21 + 0.05 * wave, FY - 0.03, 0.93 + 0.06 * up + 0.02 * math.cos(3 * ph)),
                              (0.6, 0.3, -1.0))
        cmds["hand.L"] = ('aim', (0.45 * wave, -0.5, 1.0))
        return cmds, {}

    def rescued_celebrate(t):
        cmds = {}
        hop = smooth(t / 0.20)                                   # вистрибує з клітки
        hop_air = math.sin(math.pi * hop) if t < 0.20 else 0.0
        fv = clamp01((t - 0.28) / 0.34)                          # сальто
        flip_air = 4.0 * fv * (1.0 - fv)
        hooray = smooth((t - 0.22) / 0.08) * (1.0 - smooth((t - 0.72) / 0.08))
        bow = smooth((t - 0.73) / 0.10) * (1.0 - smooth((t - 0.90) / 0.09))
        down = smooth((hop - 0.4) / 0.5)

        travel = Vector((0.0, -CUB_EXIT * hop, -off.z * down))
        d = travel + Vector((0.0, 0.0, 0.15 * hop_air + 0.42 * flip_air
                             - 0.045 * bump(t, 0.20, 0.28) - 0.05 * bump(t, 0.62, 0.72) - 0.03 * bow))
        flip = Q(X_AXIS, 360.0 * smooth(fv))
        r = flip @ Q(X_AXIS, -9.0 * hop_air + 20.0 * bow)
        body(cmds, r, d)
        air = max(hop_air, smooth(min(fv, 1.0 - fv) / 0.12))
        legs(cmds, r, d, travel, air=air, tuck=(0.0, -0.03, 0.07))

        cmds["spine_01"] = ('rot', Q(X_AXIS, 13.0 * bow))
        cmds["spine_02"] = ('rot', Q(X_AXIS, 13.0 * bow - 6.0 * hooray))
        cmds["head"] = ('rot', Q(Y_AXIS, 6.0 * math.sin(2.0 * math.pi * 3.0 * t) * hooray)
                        @ Q(X_AXIS, -12.0 * hooray + 16.0 * bow))
        ears(cmds, -8.0 * hooray + 10.0 * bow, 8.0 * math.sin(2.0 * math.pi * 4.0 * t) * hooray)
        for s in (1.0, -1.0):
            sn = side_name(s)
            v = mix_dir(arm_rest[s], (s * 0.45, 0.55, -0.45), hop_air)       # замах назад у стрибку
            v = mix_dir(v, (s * 0.42, -0.12, 1.0), hooray)                    # лапки вгору
            v = mix_dir(v, (s * 0.85, 0.3, -0.35), bow)                       # розводить лапки в поклоні
            v = flip @ v
            cmds[f"upperarm.{sn}"] = ('aim', v)
            cmds[f"lowerarm.{sn}"] = ('aim', mix_dir(v, flip @ Vector((s * 0.1, -0.2, 1.0)), 0.25 * hooray))
        return cmds, {}

    loc = ("pelvis",)
    bake_action(arm_obj, fk, "Cub_Captive_Sad", 60, captive_sad, loc, solo=True)
    bake_action(arm_obj, fk, "Cub_Captive_CallHelp", 45, captive_call_help, loc)
    bake_action(arm_obj, fk, "Cub_Rescued_Celebrate", 60, rescued_celebrate, loc)

# ==============================================================================
# 8. ЗБІРКА ТА ЕКСПОРТ
# ==============================================================================

def set_origin(obj, point):
    """Переносить опорну точку (pivot) об'єкта в point, не зрушуючи геометрію."""
    obj.data.transform(Matrix.Translation(-Vector(point)))
    obj.location = Vector(point)

def report(label, builders):
    total = 0
    for mb in builders:
        total += mb.tris
        print(f"[CaptiveCub] {mb.name}: {mb.tris} tris, quads {mb.quads}/{mb.polys}")
    print(f"[CaptiveCub] {label}: {total} tris")
    return total

def main():
    clear_scene()
    scene = bpy.context.scene
    scene.render.fps = FPS
    mats = create_materials()
    col_cage = bpy.data.collections.new("COL_Cage")
    col_cub = bpy.data.collections.new("COL_BearCub")
    scene.collection.children.link(col_cage)
    scene.collection.children.link(col_cub)

    cage_builders = [build_cage_body(), build_cage_door(), build_lock(), build_ivy()]
    cage_objs = [mb.finish(col_cage, mats) for mb in cage_builders]

    cub_body = build_cub()
    k = CUB_HEIGHT / cub_body.max_z()
    off = Vector((0.0, CUB_Y, FLOOR))
    cub_builders = [cub_body, build_bow(), build_kerchief()]
    cub_objs = [mb.finish(col_cub, mats, k, off) for mb in cub_builders]

    rig_cage = build_cage_rig(col_cage)
    rig_cub = build_cub_rig(col_cub, k, off)

    # Apply All Transforms перед скінінгом
    bpy.ops.object.select_all(action='DESELECT')
    for o in cage_objs + cub_objs + [rig_cage, rig_cub]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = rig_cage
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for obj, mb in zip(cage_objs, cage_builders):
        skin(obj, mb, rig_cage)
    for obj, mb in zip(cub_objs, cub_builders):
        skin(obj, mb, rig_cub)

    # Pivot дверцят — строго на осі петель, pivot замка — у точці підвісу
    set_origin(cage_objs[1], (HINGE.x, HINGE.y, DOOR_Z0))
    set_origin(cage_objs[2], (LOCK_X, LOCK_Y, SHACKLE_TOP))

    build_cage_animations(rig_cage)
    build_cub_animations(rig_cub, k, off)

    report("клітка + дверцята + замок + плющ (ціль 4000-6500)", cage_builders)
    report("ведмежа з бантиком і хустинкою (ціль 3000-4500)", cub_builders)
    zs = [v.co.z for v in cub_objs[0].data.vertices]
    print(f"[CaptiveCub] K={k:.4f} | ведмежа Z: {min(zs):.4f}..{max(zs):.4f} (зріст {max(zs) - min(zs):.4f})")

    scene.frame_start = 0
    scene.frame_end = 60

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)
    filepath = os.path.join(out_dir, "captive-cub-cage.glb")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_def_bones=True,
    )
    print(f"[CaptiveCub] Експортовано GLB: {filepath}")

if __name__ == "__main__":
    main()
