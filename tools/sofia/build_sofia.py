import bpy
import bmesh
import math
import os
from mathutils import Vector, Euler

# ==============================================================================
# 0. ДОПОМІЖНІ ФУНКЦІЇ ТА КОЛЬОРИ (sRGB -> Linear для Blender 4.x)
# ==============================================================================

def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_to_rgba(hex_str: str, alpha: float = 1.0):
    h = hex_str.lstrip('#')
    r = srgb_to_linear(int(h[0:2], 16) / 255.0)
    g = srgb_to_linear(int(h[2:4], 16) / 255.0)
    b = srgb_to_linear(int(h[4:6], 16) / 255.0)
    return (r, g, b, alpha)

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

# ==============================================================================
# 1. СТВОРЕННЯ МАТЕРІАЛІВ (glTF 2.0 Principled BSDF)
# ==============================================================================

def create_materials():
    mats = {}

    # 1. MAT_Fur_Black (#18181D + Purple Sheen #7B3FE4)
    mat_fur = bpy.data.materials.new("MAT_Fur_Black")
    mat_fur.use_nodes = True
    bsdf = mat_fur.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#18181D"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.82)
    set_bsdf_socket(bsdf, ["Sheen Weight", "Sheen"], 0.30)
    set_bsdf_socket(bsdf, ["Sheen Tint"], hex_to_rgba("#7B3FE4"))
    mats["fur"] = mat_fur

    # 2. MAT_Muzzle_Grey (#2E2E38)
    mat_muzzle = bpy.data.materials.new("MAT_Muzzle_Grey")
    mat_muzzle.use_nodes = True
    bsdf = mat_muzzle.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#2E2E38"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.80)
    set_bsdf_socket(bsdf, ["Sheen Weight", "Sheen"], 0.20)
    set_bsdf_socket(bsdf, ["Sheen Tint"], hex_to_rgba("#7B3FE4"))
    mats["muzzle"] = mat_muzzle

    # 3. MAT_Nose_Black (#0A0A0D)
    mat_nose = bpy.data.materials.new("MAT_Nose_Black")
    mat_nose.use_nodes = True
    bsdf = mat_nose.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#0A0A0D"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.18)
    set_bsdf_socket(bsdf, ["Specular IOR Level", "Specular"], 0.65)
    mats["nose"] = mat_nose

    # 4. MAT_Eyes_Glow (#FF1E1E + Emission #FF2A2A @ 3.0)
    mat_eyes = bpy.data.materials.new("MAT_Eyes_Glow")
    mat_eyes.use_nodes = True
    bsdf = mat_eyes.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#FF1E1E"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.15)
    set_bsdf_socket(bsdf, ["Emission Color", "Emission"], hex_to_rgba("#FF2A2A"))
    set_bsdf_socket(bsdf, ["Emission Strength"], 3.0)
    mats["eyes"] = mat_eyes

    # 5. MAT_Eye_Spec (Білий блік)
    mat_spec = bpy.data.materials.new("MAT_Eye_Spec")
    mat_spec.use_nodes = True
    bsdf = mat_spec.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#FFFFFF"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.10)
    set_bsdf_socket(bsdf, ["Emission Color", "Emission"], hex_to_rgba("#FFFFFF"))
    set_bsdf_socket(bsdf, ["Emission Strength"], 1.2)
    mats["spec"] = mat_spec

    # 6. MAT_Scarf_Red (#D92626)
    mat_scarf = bpy.data.materials.new("MAT_Scarf_Red")
    mat_scarf.use_nodes = True
    bsdf = mat_scarf.node_tree.nodes.get("Principled BSDF")
    set_bsdf_socket(bsdf, ["Base Color"], hex_to_rgba("#D92626"))
    set_bsdf_socket(bsdf, ["Roughness"], 0.78)
    set_bsdf_socket(bsdf, ["Sheen Weight", "Sheen"], 0.25)
    mats["scarf"] = mat_scarf

    return mats

# ==============================================================================
# 2. ПРОЦЕДУРНЕ МОДЕЛЮВАННЯ (Quad-Dominant, 4 500 - 6 500 Tris, A-Pose)
# ==============================================================================

def add_uv_ellipsoid(bm, center, radii, segs=24, rings=16, mat_idx=0, rot_euler=(0, 0, 0)):
    ret = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    verts = set(ret['verts'])
    rot_mat = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    for v in verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        v.co = rot_mat @ p + Vector(center)
    for f in bm.faces:
        if all(v in verts for v in f.verts):
            f.material_index = mat_idx
            f.smooth = True
    return verts

def add_segmented_limb(bm, p_start, p_mid, p_end, r_start, r_mid, r_end, segs=16, rings_per_half=7, mat_idx=0, flat_bottom=False):
    p0, p1, p2 = Vector(p_start), Vector(p_mid), Vector(p_end)
    total_rings = rings_per_half * 2
    ring_verts = []

    for i in range(total_rings + 1):
        t = i / total_rings
        if t < 0.5:
            u = t * 2.0
            pos = p0.lerp(p1, u)
            rad = r_start + (r_mid - r_start) * u
        else:
            u = (t - 0.5) * 2.0
            pos = p1.lerp(p2, u)
            rad = r_mid + (r_end - r_mid) * u

        if i == total_rings and not flat_bottom:
            rad *= 0.55

        tangent = (p2 - p0).normalized()
        up = Vector((0, 1, 0)) if abs(tangent.dot(Vector((0, 1, 0)))) < 0.9 else Vector((1, 0, 0))
        side = tangent.cross(up).normalized()
        ortho = side.cross(tangent).normalized()

        circle = []
        for s in range(segs):
            ang = (2.0 * math.pi * s) / segs
            offset = (side * math.cos(ang) + ortho * math.sin(ang)) * rad
            pt = pos + offset
            if flat_bottom and i >= total_rings - 1:
                pt.z = max(0.0, pt.z)
            v = bm.verts.new(pt)
            circle.append(v)
        ring_verts.append(circle)

    for i in range(total_rings):
        rA = ring_verts[i]
        rB = ring_verts[i + 1]
        for s in range(segs):
            ns = (s + 1) % segs
            f = bm.faces.new((rA[s], rA[ns], rB[ns], rB[s]))
            f.material_index = mat_idx
            f.smooth = True

    for cap_ring, flip in ((ring_verts[0], True), (ring_verts[-1], False)):
        center_co = sum((v.co for v in cap_ring), Vector()) / len(cap_ring)
        if flat_bottom and not flip:
            center_co.z = 0.0
        v_center = bm.verts.new(center_co)
        for s in range(segs):
            ns = (s + 1) % segs
            verts_tri = (cap_ring[ns], cap_ring[s], v_center) if flip else (cap_ring[s], cap_ring[ns], v_center)
            f = bm.faces.new(verts_tri)
            f.material_index = mat_idx
            f.smooth = True

def add_scarf_mesh(bm, mat_idx=5):
    major_seg = 28
    minor_seg = 12
    R = 0.145
    r_x, r_z = 0.048, 0.042
    center_z = 0.495

    torus_rings = []
    for i in range(major_seg):
        theta = (2.0 * math.pi * i) / major_seg
        cz = center_z + 0.008 * math.sin(theta * 2.0)
        ring = []
        for j in range(minor_seg):
            phi = (2.0 * math.pi * j) / minor_seg
            nr = math.cos(phi) * r_x
            nz = math.sin(phi) * r_z
            vx = (R + nr) * math.cos(theta)
            vy = (R + nr) * math.sin(theta) * 0.92
            vz = cz + nz
            ring.append(bm.verts.new((vx, vy, vz)))
        torus_rings.append(ring)

    for i in range(major_seg):
        ni = (i + 1) % major_seg
        for j in range(minor_seg):
            nj = (j + 1) % minor_seg
            f = bm.faces.new((torus_rings[i][j], torus_rings[ni][j], torus_rings[ni][nj], torus_rings[i][nj]))
            f.material_index = mat_idx
            f.smooth = True

    for side in (-1.0, 1.0):
        length_segs = 18
        width_segs = 4
        thick = 0.014
        grid_top = []
        grid_bot = []

        for l in range(length_segs + 1):
            t = l / length_segs
            y = 0.11 + t * 0.28
            z = 0.49 - (t ** 1.35) * 0.11 + 0.012 * math.sin(t * math.pi * 2.0)
            x_center = side * (0.032 + t * 0.055)
            half_w = 0.036 * (1.0 - 0.15 * t + 0.1 * math.sin(t * math.pi))

            row_t, row_b = [], []
            for w in range(width_segs + 1):
                u = (w / width_segs) - 0.5
                x = x_center + u * 2.0 * half_w
                row_t.append(bm.verts.new((x, y, z + thick * 0.5)))
                row_b.append(bm.verts.new((x, y, z - thick * 0.5)))
            grid_top.append(row_t)
            grid_bot.append(row_b)

        for l in range(length_segs):
            for w in range(width_segs):
                f1 = bm.faces.new((grid_top[l][w], grid_top[l+1][w], grid_top[l+1][w+1], grid_top[l][w+1]))
                f2 = bm.faces.new((grid_bot[l][w+1], grid_bot[l+1][w+1], grid_bot[l+1][w], grid_bot[l][w]))
                f1.material_index = mat_idx
                f2.material_index = mat_idx
                f1.smooth = True
                f2.smooth = True
            fL = bm.faces.new((grid_bot[l][0], grid_bot[l+1][0], grid_top[l+1][0], grid_top[l][0]))
            fR = bm.faces.new((grid_top[l][width_segs], grid_top[l+1][width_segs], grid_bot[l+1][width_segs], grid_bot[l][width_segs]))
            fL.material_index = mat_idx
            fR.material_index = mat_idx

def build_sofia_mesh(mats, target_col):
    mesh = bpy.data.meshes.new("MSH_Sofia_Data")
    obj = bpy.data.objects.new("MSH_Sofia", mesh)
    target_col.objects.link(obj)

    for key in ("fur", "muzzle", "nose", "eyes", "spec", "scarf"):
        obj.data.materials.append(mats[key])

    bm = bmesh.new()

    # 1. Голова
    add_uv_ellipsoid(bm, center=(0.0, 0.0, 0.74), radii=(0.235, 0.215, 0.220), segs=24, rings=16, mat_idx=0)

    # 2. Вушка (L/R) + внутрішні сірі раковини
    for s in (-1.0, 1.0):
        add_uv_ellipsoid(bm, center=(s * 0.175, 0.01, 0.995), radii=(0.082, 0.050, 0.085),
                         segs=14, rings=10, mat_idx=0, rot_euler=(0.0, s * 0.32, 0.0))
        add_uv_ellipsoid(bm, center=(s * 0.172, -0.025, 0.990), radii=(0.048, 0.022, 0.050),
                         segs=10, rings=6, mat_idx=1, rot_euler=(0.0, s * 0.32, 0.0))

    # 3. Мордочка (Muzzle) та носик (уздовж -Y)
    add_uv_ellipsoid(bm, center=(0.0, -0.185, 0.675), radii=(0.095, 0.068, 0.072), segs=16, rings=10, mat_idx=1)
    add_uv_ellipsoid(bm, center=(0.0, -0.245, 0.702), radii=(0.036, 0.025, 0.026), segs=12, rings=8, mat_idx=2)

    # 4. Очі з яскраво-червоним світінням + білі бліки + повіки
    for s in (-1.0, 1.0):
        add_uv_ellipsoid(bm, center=(s * 0.092, -0.195, 0.752), radii=(0.038, 0.022, 0.040),
                         segs=14, rings=10, mat_idx=3, rot_euler=(0.08, 0.0, -s * 0.18))
        add_uv_ellipsoid(bm, center=(s * 0.080, -0.215, 0.766), radii=(0.011, 0.006, 0.012),
                         segs=8, rings=6, mat_idx=4)
        add_uv_ellipsoid(bm, center=(s * 0.092, -0.196, 0.785), radii=(0.041, 0.025, 0.016),
                         segs=12, rings=6, mat_idx=0, rot_euler=(0.15, 0.0, -s * 0.18))

    # 5. Тулуб + животик + хвостик
    torso_verts = add_uv_ellipsoid(bm, center=(0.0, 0.0, 0.355), radii=(0.165, 0.145, 0.185), segs=22, rings=14, mat_idx=0)
    for v in torso_verts:
        rel_z = (v.co.z - 0.355) / 0.185
        scale_xy = 1.0 - 0.18 * rel_z
        v.co.x *= scale_xy
        v.co.y *= scale_xy

    add_uv_ellipsoid(bm, center=(0.0, -0.118, 0.335), radii=(0.105, 0.040, 0.115), segs=14, rings=10, mat_idx=1)
    add_uv_ellipsoid(bm, center=(0.0, 0.148, 0.235), radii=(0.042, 0.042, 0.040), segs=10, rings=6, mat_idx=0)

    # 6. Верхні лапи в A-Pose
    for s in (-1.0, 1.0):
        add_segmented_limb(
            bm,
            p_start=(s * 0.135, 0.0, 0.455),
            p_mid=(s * 0.215, -0.01, 0.365),
            p_end=(s * 0.285, -0.02, 0.275),
            r_start=0.056, r_mid=0.048, r_end=0.044,
            segs=12, rings_per_half=5, mat_idx=0, flat_bottom=False
        )

    # 7. Нижні лапи
    for s in (-1.0, 1.0):
        add_segmented_limb(
            bm,
            p_start=(s * 0.088, 0.0, 0.215),
            p_mid=(s * 0.092, -0.01, 0.105),
            p_end=(s * 0.095, -0.02, 0.000),
            r_start=0.068, r_mid=0.058, r_end=0.055,
            segs=12, rings_per_half=5, mat_idx=0, flat_bottom=True
        )
        add_uv_ellipsoid(bm, center=(s * 0.095, -0.048, 0.028), radii=(0.052, 0.062, 0.028),
                         segs=10, rings=6, mat_idx=0)

    # 8. Червоний в'язаний шарф
    add_scarf_mesh(bm, mat_idx=5)

    # Калібрування зросту рівно до Z ∈ [0.000, 1.100] м
    bm.verts.ensure_lookup_table()
    min_z = min(v.co.z for v in bm.verts)
    max_z = max(v.co.z for v in bm.verts)
    scale_factor = 1.100 / (max_z - min_z)
    for v in bm.verts:
        v.co.z = (v.co.z - min_z) * scale_factor
        v.co.x *= scale_factor
        v.co.y *= scale_factor

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    tris_count = sum(len(p.vertices) - 2 for p in mesh.polygons)
    print(f"[Sofia Builder] Зріст: 1.10 м | Трикутників (tris): {tris_count}")
    return obj

# ==============================================================================
# 3. СТВОРЕННЯ СКЕЛЕТА (DEF_ Ієрархія + Шарф) ТА СКІНІНГ
# ==============================================================================

def build_sofia_rig(target_col):
    arm_data = bpy.data.armatures.new("ARM_Sofia_Data")
    arm_obj = bpy.data.objects.new("ARM_Sofia", arm_data)
    target_col.objects.link(arm_obj)

    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones

    def make_bone(name, head, tail, parent=None, connected=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        b.use_deform = True
        if parent:
            b.parent = parent
            b.use_connect = connected
        return b

    b_root = make_bone("DEF_root", (0, 0, 0.0), (0, 0.12, 0.0))
    b_pelvis = make_bone("DEF_pelvis", (0, 0, 0.20), (0, 0, 0.29), b_root, False)
    b_spine1 = make_bone("DEF_spine_01", (0, 0, 0.29), (0, 0, 0.39), b_pelvis, True)
    b_spine2 = make_bone("DEF_spine_02", (0, 0, 0.39), (0, 0, 0.48), b_spine1, True)
    b_neck = make_bone("DEF_neck", (0, 0, 0.48), (0, 0, 0.55), b_spine2, True)
    b_head = make_bone("DEF_head", (0, 0, 0.55), (0, 0, 0.92), b_neck, True)

    for side, s in (("L", 1.0), ("R", -1.0)):
        make_bone(f"DEF_ear.{side}", (s * 0.14, 0.01, 0.92), (s * 0.20, 0.01, 1.08), b_head, False)
        make_bone(f"DEF_eyelid.{side}", (s * 0.092, -0.18, 0.785), (s * 0.092, -0.22, 0.785), b_head, False)

    b_st1 = make_bone("DEF_scarf_tail_01", (0, 0.11, 0.49), (0, 0.20, 0.46), b_neck, False)
    b_st2 = make_bone("DEF_scarf_tail_02", (0, 0.20, 0.46), (0, 0.30, 0.42), b_st1, True)
    make_bone("DEF_scarf_tail_03", (0, 0.30, 0.42), (0, 0.40, 0.37), b_st2, True)

    for side, s in (("L", 1.0), ("R", -1.0)):
        b_ua = make_bone(f"DEF_upperarm.{side}", (s * 0.135, 0.0, 0.455), (s * 0.215, -0.01, 0.365), b_spine2, False)
        b_la = make_bone(f"DEF_lowerarm.{side}", (s * 0.215, -0.01, 0.365), (s * 0.265, -0.018, 0.300), b_ua, True)
        make_bone(f"DEF_hand.{side}", (s * 0.265, -0.018, 0.300), (s * 0.305, -0.025, 0.255), b_la, True)

        b_th = make_bone(f"DEF_thigh.{side}", (s * 0.090, 0.0, 0.215), (s * 0.092, -0.01, 0.105), b_pelvis, False)
        b_ca = make_bone(f"DEF_calf.{side}", (s * 0.092, -0.01, 0.105), (s * 0.095, -0.015, 0.028), b_th, True)
        make_bone(f"DEF_foot.{side}", (s * 0.095, -0.015, 0.028), (s * 0.095, -0.075, 0.010), b_ca, True)

    bpy.ops.object.mode_set(mode='OBJECT')
    return arm_obj

def dist_to_segment(p: Vector, a: Vector, b: Vector) -> float:
    ab = b - a
    ab_len_sq = ab.length_squared
    if ab_len_sq < 1e-8:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab_len_sq))
    proj = a + t * ab
    return (p - proj).length

def apply_transforms_and_skin(mesh_obj, arm_obj):
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    mesh_obj.parent = arm_obj
    mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
    mod.object = arm_obj

    bones = [b for b in arm_obj.data.bones if b.name != "DEF_root"]
    vgroups = {b.name: mesh_obj.vertex_groups.new(name=b.name) for b in bones}
    mesh_obj.vertex_groups.new(name="DEF_root")

    mesh = mesh_obj.data
    poly_mat_by_vert = {i: 0 for i in range(len(mesh.vertices))}
    for poly in mesh.polygons:
        for vi in poly.vertices:
            poly_mat_by_vert[vi] = poly.material_index

    for v in mesh.vertices:
        co = v.co
        mat_id = poly_mat_by_vert[v.index]

        if mat_id == 5 and co.y > 0.115:
            scarf_bones = ["DEF_scarf_tail_01", "DEF_scarf_tail_02", "DEF_scarf_tail_03"]
            weights = []
            for bname in scarf_bones:
                b = arm_obj.data.bones[bname]
                d = dist_to_segment(co, b.head_local, b.tail_local)
                weights.append((bname, 1.0 / ((d + 0.025) ** 3)))
            total_w = sum(w for _, w in weights)
            for bname, w in weights:
                vgroups[bname].add([v.index], w / total_w, 'REPLACE')
            continue

        if mat_id == 5:
            vgroups["DEF_neck"].add([v.index], 0.75, 'REPLACE')
            vgroups["DEF_spine_02"].add([v.index], 0.25, 'REPLACE')
            continue

        if mat_id in (2, 3, 4):
            vgroups["DEF_head"].add([v.index], 1.0, 'REPLACE')
            continue

        body_bones = [b for b in bones if not b.name.startswith("DEF_scarf") and not b.name.startswith("DEF_eyelid")]
        dists = []
        for b in body_bones:
            d = dist_to_segment(co, b.head_local, b.tail_local)
            dists.append((b.name, d))
        dists.sort(key=lambda x: x[1])

        top3 = dists[:3]
        inv_w = [(name, 1.0 / ((d + 0.02) ** 3.5)) for name, d in top3]
        total_w = sum(w for _, w in inv_w)
        for name, w in inv_w:
            vgroups[name].add([v.index], w / total_w, 'REPLACE')

# ==============================================================================
# 4. АНІМАЦІЇ ТА NLA TRACKS (30 FPS)
# ==============================================================================

def set_pose_rot(pb, rx_deg, ry_deg, rz_deg):
    pb.rotation_mode = 'XYZ'
    pb.rotation_euler = (math.radians(rx_deg), math.radians(ry_deg), math.radians(rz_deg))

def key_bone(pb, frame, loc=False, rot=True):
    if rot:
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)
    if loc:
        pb.keyframe_insert(data_path="location", frame=frame)

def reset_pose(arm_obj):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.location = (0.0, 0.0, 0.0)

def push_to_nla(arm_obj, action):
    action.use_fake_user = True
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()
    track = arm_obj.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, int(action.frame_range[0]), action)
    strip.name = action.name
    track.mute = (action.name != "Idle")

def build_animations(arm_obj):
    bpy.context.scene.render.fps = 30
    if not arm_obj.animation_data:
        arm_obj.animation_data_create()
    pb = arm_obj.pose.bones

    # 1. Idle (60 кадрів)
    act_idle = bpy.data.actions.new("Idle")
    arm_obj.animation_data.action = act_idle
    reset_pose(arm_obj)

    for f, ph in ((1, 0.0), (15, 0.5 * math.pi), (30, math.pi), (45, 1.5 * math.pi), (60, 2.0 * math.pi)):
        s = math.sin(ph)
        c = math.cos(ph)
        pb["DEF_pelvis"].location = (0.0, 0.0, 0.006 * s)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)

        set_pose_rot(pb["DEF_spine_01"], 2.0 * s, 0.0, 0.0)
        set_pose_rot(pb["DEF_head"], -2.5 * s, 1.5 * c, 0.0)
        set_pose_rot(pb["DEF_ear.L"], 3.5 * c, 0.0, 2.5 * s)
        set_pose_rot(pb["DEF_ear.R"], 3.5 * c, 0.0, -2.5 * s)
        set_pose_rot(pb["DEF_scarf_tail_01"], 4.0 * s, 0.0, 2.0 * c)
        set_pose_rot(pb["DEF_scarf_tail_02"], 6.0 * c, 0.0, 3.0 * s)
        set_pose_rot(pb["DEF_scarf_tail_03"], 8.0 * s, 0.0, -4.0 * c)

        for name in ("DEF_spine_01", "DEF_head", "DEF_ear.L", "DEF_ear.R",
                     "DEF_scarf_tail_01", "DEF_scarf_tail_02", "DEF_scarf_tail_03"):
            key_bone(pb[name], f)

    for f, dz in ((1, 0.0), (34, 0.0), (36, -0.028), (38, 0.0), (60, 0.0)):
        pb["DEF_eyelid.L"].location = (0.0, 0.0, dz)
        pb["DEF_eyelid.R"].location = (0.0, 0.0, dz)
        key_bone(pb["DEF_eyelid.L"], f, loc=True, rot=False)
        key_bone(pb["DEF_eyelid.R"], f, loc=True, rot=False)

    push_to_nla(arm_obj, act_idle)

    # 2. Walk (30 кадрів)
    act_walk = bpy.data.actions.new("Walk")
    arm_obj.animation_data.action = act_walk
    reset_pose(arm_obj)

    for f in (1, 8, 15, 23, 30):
        ph = ((f - 1) / 29.0) * 2.0 * math.pi
        swing = math.sin(ph)
        bounce = abs(math.cos(ph))

        pb["DEF_pelvis"].location = (0.0, 0.0, 0.018 * bounce)
        set_pose_rot(pb["DEF_pelvis"], 3.0, 4.0 * swing, -5.0 * swing)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)

        set_pose_rot(pb["DEF_thigh.L"], 28.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.L"], max(0.0, -32.0 * swing), 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.R"], -28.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.R"], max(0.0, 32.0 * swing), 0.0, 0.0)

        set_pose_rot(pb["DEF_upperarm.L"], -22.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.R"], 22.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_head"], -3.0 * bounce, -3.0 * swing, 0.0)

        set_pose_rot(pb["DEF_scarf_tail_01"], 12.0 + 6.0 * bounce, 0.0, 5.0 * swing)
        set_pose_rot(pb["DEF_scarf_tail_02"], 8.0 * bounce, 0.0, -8.0 * swing)
        set_pose_rot(pb["DEF_scarf_tail_03"], 10.0 * bounce, 0.0, 10.0 * swing)

        for name in ("DEF_thigh.L", "DEF_calf.L", "DEF_thigh.R", "DEF_calf.R",
                     "DEF_upperarm.L", "DEF_upperarm.R", "DEF_head",
                     "DEF_scarf_tail_01", "DEF_scarf_tail_02", "DEF_scarf_tail_03"):
            key_bone(pb[name], f)

    push_to_nla(arm_obj, act_walk)

    # 3. Run (20 кадрів)
    act_run = bpy.data.actions.new("Run")
    arm_obj.animation_data.action = act_run
    reset_pose(arm_obj)

    for f in (1, 6, 11, 16, 20):
        ph = ((f - 1) / 19.0) * 2.0 * math.pi
        swing = math.sin(ph)
        bounce = abs(math.cos(ph))

        pb["DEF_pelvis"].location = (0.0, 0.0, 0.032 * bounce)
        set_pose_rot(pb["DEF_pelvis"], 14.0, 6.0 * swing, -7.0 * swing)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)

        set_pose_rot(pb["DEF_spine_01"], 10.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_head"], -14.0, 0.0, 0.0)

        set_pose_rot(pb["DEF_thigh.L"], 48.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.L"], max(0.0, -55.0 * swing), 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.R"], -48.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.R"], max(0.0, 55.0 * swing), 0.0, 0.0)

        set_pose_rot(pb["DEF_upperarm.L"], -42.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_lowerarm.L"], 35.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.R"], 42.0 * swing, 0.0, 0.0)
        set_pose_rot(pb["DEF_lowerarm.R"], 35.0, 0.0, 0.0)

        set_pose_rot(pb["DEF_scarf_tail_01"], 34.0 + 8.0 * bounce, 0.0, 6.0 * swing)
        set_pose_rot(pb["DEF_scarf_tail_02"], 18.0 - 10.0 * bounce, 0.0, -10.0 * swing)
        set_pose_rot(pb["DEF_scarf_tail_03"], 12.0 * bounce, 0.0, 14.0 * swing)

        for name in ("DEF_spine_01", "DEF_head", "DEF_thigh.L", "DEF_calf.L",
                     "DEF_thigh.R", "DEF_calf.R", "DEF_upperarm.L", "DEF_lowerarm.L",
                     "DEF_upperarm.R", "DEF_lowerarm.R",
                     "DEF_scarf_tail_01", "DEF_scarf_tail_02", "DEF_scarf_tail_03"):
            key_bone(pb[name], f)

    push_to_nla(arm_obj, act_run)

    # 4a. Jump_Start (15 кадрів)
    act_js = bpy.data.actions.new("Jump_Start")
    arm_obj.animation_data.action = act_js
    reset_pose(arm_obj)
    for f, z_off, crouch, arm_up in ((1, 0.0, 0.0, 0.0), (8, -0.045, 32.0, -25.0), (15, 0.06, -15.0, 55.0)):
        pb["DEF_pelvis"].location = (0.0, 0.0, z_off)
        set_pose_rot(pb["DEF_spine_01"], crouch * 0.4, 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.L"], crouch, 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.R"], crouch, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.L"], -crouch * 1.3, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.R"], -crouch * 1.3, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.L"], arm_up, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.R"], arm_up, 0.0, 0.0)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)
        for n in ("DEF_spine_01", "DEF_thigh.L", "DEF_thigh.R", "DEF_calf.L", "DEF_calf.R", "DEF_upperarm.L", "DEF_upperarm.R"):
            key_bone(pb[n], f)
    push_to_nla(arm_obj, act_js)

    # 4b. Jump_Air (15 кадрів)
    act_ja = bpy.data.actions.new("Jump_Air")
    arm_obj.animation_data.action = act_ja
    reset_pose(arm_obj)
    for f, w in ((1, -1.0), (8, 1.0), (15, -1.0)):
        pb["DEF_pelvis"].location = (0.0, 0.0, 0.07)
        set_pose_rot(pb["DEF_thigh.L"], 28.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.R"], -20.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.L"], -35.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.R"], -25.0, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.L"], 45.0, 0.0, 12.0)
        set_pose_rot(pb["DEF_upperarm.R"], 45.0, 0.0, -12.0)
        set_pose_rot(pb["DEF_scarf_tail_01"], -22.0 + 6.0 * w, 0.0, 0.0)
        set_pose_rot(pb["DEF_scarf_tail_02"], -15.0 - 8.0 * w, 0.0, 0.0)
        set_pose_rot(pb["DEF_scarf_tail_03"], -10.0 + 10.0 * w, 0.0, 0.0)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)
        for n in ("DEF_thigh.L", "DEF_thigh.R", "DEF_calf.L", "DEF_calf.R",
                  "DEF_upperarm.L", "DEF_upperarm.R", "DEF_scarf_tail_01", "DEF_scarf_tail_02", "DEF_scarf_tail_03"):
            key_bone(pb[n], f)
    push_to_nla(arm_obj, act_ja)

    # 4c. Land (18 кадрів)
    act_land = bpy.data.actions.new("Land")
    arm_obj.animation_data.action = act_land
    reset_pose(arm_obj)
    for f, z_off, squat, scarf_drop in ((1, 0.02, 10.0, -18.0), (6, -0.05, 36.0, 28.0), (18, 0.0, 0.0, 0.0)):
        pb["DEF_pelvis"].location = (0.0, 0.0, z_off)
        set_pose_rot(pb["DEF_spine_01"], squat * 0.45, 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.L"], squat, 0.0, 0.0)
        set_pose_rot(pb["DEF_thigh.R"], squat, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.L"], -squat * 1.2, 0.0, 0.0)
        set_pose_rot(pb["DEF_calf.R"], -squat * 1.2, 0.0, 0.0)
        set_pose_rot(pb["DEF_scarf_tail_01"], scarf_drop, 0.0, 0.0)
        set_pose_rot(pb["DEF_scarf_tail_02"], scarf_drop * 0.8, 0.0, 0.0)
        key_bone(pb["DEF_pelvis"], f, loc=True, rot=True)
        for n in ("DEF_spine_01", "DEF_thigh.L", "DEF_thigh.R", "DEF_calf.L", "DEF_calf.R", "DEF_scarf_tail_01", "DEF_scarf_tail_02"):
            key_bone(pb[n], f)
    push_to_nla(arm_obj, act_land)

    # 5. Unlock_Cage (45 кадрів)
    act_unlock = bpy.data.actions.new("Unlock_Cage")
    arm_obj.animation_data.action = act_unlock
    reset_pose(arm_obj)

    keyframes_unlock = (
        (1,  0.0,  0.0,  0.0,   0.0,  0.0),
        (14, 8.0,  68.0, 25.0,  0.0, -6.0),
        (24, 10.0, 72.0, 20.0, 55.0, -8.0),
        (32, 10.0, 72.0, 20.0, -15.0, -4.0),
        (45, 0.0,  0.0,  0.0,   0.0,  0.0),
    )
    for f, sp_rx, ua_rx, la_rx, h_ry, hd_rx in keyframes_unlock:
        set_pose_rot(pb["DEF_spine_01"], sp_rx, 0.0, 0.0)
        set_pose_rot(pb["DEF_upperarm.R"], ua_rx, 0.0, -18.0 if ua_rx > 0 else 0.0)
        set_pose_rot(pb["DEF_lowerarm.R"], la_rx, 0.0, 0.0)
        set_pose_rot(pb["DEF_hand.R"], 0.0, h_ry, 0.0)
        set_pose_rot(pb["DEF_head"], hd_rx, 0.0, 0.0)
        for n in ("DEF_spine_01", "DEF_upperarm.R", "DEF_lowerarm.R", "DEF_hand.R", "DEF_head"):
            key_bone(pb[n], f)

    push_to_nla(arm_obj, act_unlock)
    reset_pose(arm_obj)
    arm_obj.animation_data.action = None

# ==============================================================================
# 5. ГОЛОВНА ТОЧКА ВХОДУ ТА АВТО-ЕКСПОРТ У GLB
# ==============================================================================

def main():
    clear_scene()

    col = bpy.data.collections.new("COL_Sofia_Character")
    bpy.context.scene.collection.children.link(col)

    mats = create_materials()
    mesh_obj = build_sofia_mesh(mats, col)
    arm_obj = build_sofia_rig(col)

    apply_transforms_and_skin(mesh_obj, arm_obj)
    build_animations(arm_obj)

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60

    out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "public", "models"))
    os.makedirs(out_dir, exist_ok=True)
    out_m = os.path.join(out_dir, "sofia-agy-m.glb")
    out_default = os.path.join(out_dir, "sofia.glb")

    for filepath in (out_m, out_default):
        bpy.ops.export_scene.gltf(
            filepath=filepath,
            export_format='GLB',
            export_yup=True,
            export_apply=True,
            export_animations=True,
            export_animation_mode='NLA_TRACKS',
            export_def_bones=True
        )
        print(f"[Sofia Builder] Експортовано GLB: {filepath}")

if __name__ == "__main__":
    main()
