"""Контактний аркуш і заміри з експортованого GLB (перевіряється саме той файл, що піде у гру).

blender --background --python tools/captive_cub/render_preview.py -- <model.glb> <out.png>
"""
import bpy
import sys
import os
import math
import json
import struct
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_path, out_path = argv[0], argv[1]
W, H = 520, 520

# --- Заміри просто з glTF JSON --------------------------------------------------
with open(glb_path, "rb") as fh:
    fh.read(12)
    length, _ = struct.unpack("<II", fh.read(8))
    gltf = json.loads(fh.read(length))
acc = gltf["accessors"]
for a in gltf.get("animations", []):
    times = [acc[s["input"]]["max"][0] for s in a["samplers"]]
    nodes = {gltf["nodes"][c["target"]["node"]]["name"] for c in a["channels"]}
    print(f"[check] animation {a['name']}: {max(times):.3f} s, {len(a['channels'])} channels, "
          f"cage bones: {any(n.startswith(('door', 'lock', 'ivy', 'root_cage')) for n in nodes)}, "
          f"cub bones: {any(n.startswith(('pelvis', 'head', 'spine')) for n in nodes)}")
for m in gltf["meshes"]:
    tris = sum(acc[p["indices"]]["count"] // 3 for p in m["primitives"])
    mats = [gltf["materials"][p["material"]]["name"] for p in m["primitives"]]
    print(f"[check] mesh {m['name']}: {tris} tris, materials {mats}")
print("[check] skins:", [(s.get("name"), len(s["joints"])) for s in gltf["skins"]])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)
scene = bpy.context.scene
arms = {o.name: o for o in scene.objects if o.type == 'ARMATURE'}
print("[check] objects:", sorted((o.name, o.type) for o in scene.objects))
print("[check] actions:", sorted(a.name for a in bpy.data.actions))

def set_action(arm, name, frame_dummy=None):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    if name is None:
        ad.action = None
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        return
    cands = [a for a in bpy.data.actions if a.name == name or a.name.startswith(name)]
    for act in cands:
        try:
            ad.action = act
        except Exception:
            continue
        slots = list(getattr(ad, "action_suitable_slots", []))
        if hasattr(ad, "action_slot"):
            mine = [s for s in slots if arm.name in s.name_display] or slots
            if not mine:
                continue
            ad.action_slot = mine[0]
        return
    raise RuntimeError(f"action {name} not found for {arm.name}: {[a.name for a in bpy.data.actions]}")

def bounds(names):
    deps = bpy.context.evaluated_depsgraph_get()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in scene.objects:
        if o.type == 'MESH' and o.name in names:
            ev = o.evaluated_get(deps)
            for v in ev.data.vertices:
                p = ev.matrix_world @ v.co
                lo = Vector(map(min, lo, p))
                hi = Vector(map(max, hi, p))
    return lo, hi

def fmt(b):
    return "min (%.3f %.3f %.3f) max (%.3f %.3f %.3f)" % (*b[0], *b[1])

for a in arms.values():
    set_action(a, None)
scene.frame_set(0)
print("[check] rest Cage_Body:", fmt(bounds({"Cage_Body"})))
print("[check] rest Cage_Door:", fmt(bounds({"Cage_Door"})))
print("[check] rest Lock:", fmt(bounds({"Golden_Heart_Lock"})))
print("[check] rest Ivy:", fmt(bounds({"Purple_Ivy_Vines"})))
print("[check] rest Cub:", fmt(bounds({"Bear_Cub_Captive"})))
door = next(o for o in scene.objects if o.name == "Cage_Door")
print("[check] door origin (world):", tuple(round(c, 3) for c in door.matrix_world.translation))
set_action(arms["Rig_Cage"], "Cage_Unlock_Open")
scene.frame_set(45)
print("[check] open@45 Cage_Door:", fmt(bounds({"Cage_Door"})))
print("[check] open@45 Lock:", fmt(bounds({"Golden_Heart_Lock"})))
print("[check] open@45 Ivy:", fmt(bounds({"Purple_Ivy_Vines"})))
set_action(arms["Rig_BearCub"], "Cub_Rescued_Celebrate")
scene.frame_set(60)
print("[check] celebrate@60 Cub:", fmt(bounds({"Bear_Cub_Captive"})))

# --- Рендер ---------------------------------------------------------------------
for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new("W")
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.62, 0.62, 0.58, 1.0)
bg.inputs[1].default_value = 0.9
scene.world = world
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN'))
sun.data.energy = 3.0
scene.collection.objects.link(sun)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens = 60
scene.collection.objects.link(cam)
scene.camera = cam

def look(azimuth_deg, dist, target, elev):
    a = math.radians(azimuth_deg)   # 0 = спереду (камера на -Y)
    t = Vector(target)
    cam.location = t + Vector((math.sin(a) * dist, -math.cos(a) * dist, elev * dist))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun.rotation_euler = (math.radians(50), 0, a + math.radians(-25))

FULL = (5.6, (0.0, -0.1, 0.9), 0.22)
WIDE = (7.4, (0.0, -0.6, 0.8), 0.25)
NEAR = (2.9, (0.0, -0.5, 0.72), 0.12)
shots = [
    # (cage action, frame, cub action, frame, azimuth, camera)
    (None, 0, None, 0, 0, FULL), (None, 0, None, 0, 35, FULL), (None, 0, None, 0, 90, FULL), (None, 0, None, 0, 180, FULL),
    ("Cage_Locked_Idle", 15, "Cub_Captive_Sad", 15, 0, FULL), ("Cage_Locked_Idle", 45, "Cub_Captive_Sad", 45, 25, NEAR),
    ("Cage_Locked_Idle", 15, "Cub_Captive_Sad", 15, 60, NEAR), ("Cage_Locked_Idle", 15, "Cub_Captive_Sad", 15, -90, FULL),
    ("Cage_Locked_Idle", 30, "Cub_Captive_CallHelp", 6, 0, NEAR), ("Cage_Locked_Idle", 30, "Cub_Captive_CallHelp", 6, 40, NEAR),
    ("Cage_Locked_Idle", 30, "Cub_Captive_CallHelp", 17, -30, NEAR), ("Cage_Locked_Idle", 30, "Cub_Captive_CallHelp", 28, 80, FULL),
    ("Cage_Unlock_Open", 8, "Cub_Captive_CallHelp", 0, 20, FULL), ("Cage_Unlock_Open", 16, "Cub_Captive_CallHelp", 0, 20, WIDE),
    ("Cage_Unlock_Open", 26, "Cub_Captive_CallHelp", 0, 20, WIDE), ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 0, 20, WIDE),
    ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 9, 60, WIDE), ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 24, 60, WIDE),
    ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 30, 60, WIDE), ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 40, 20, WIDE),
    ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 50, 60, WIDE), ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 60, 0, WIDE),
    ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 60, 180, WIDE), ("Cage_Unlock_Open", 45, "Cub_Rescued_Celebrate", 60, -70, WIDE),
]
only = [int(x) for x in argv[2].split(",")] if len(argv) > 2 else None
tiles = []
tmp_dir = os.path.dirname(out_path)
for i, (ca, cf, ba, bf, az, camdef) in enumerate(shots):
    if only is not None and i not in only:
        continue
    set_action(arms["Rig_Cage"], ca)
    set_action(arms["Rig_BearCub"], ba)
    # кадри двох анімацій різні: виставляємо кожну своїм кадром через зсув NLA неможливо, тож
    # семплюємо клітку, «заморожуємо» її позу і тоді семплюємо ведмежа
    scene.frame_set(cf)
    if ca and ba and cf != bf:
        frozen = {pb.name: (pb.matrix_basis.copy()) for pb in arms["Rig_Cage"].pose.bones}
        arms["Rig_Cage"].animation_data.action = None
        scene.frame_set(bf)
        for pb in arms["Rig_Cage"].pose.bones:
            pb.matrix_basis = frozen[pb.name]
        bpy.context.view_layer.update()
    elif ba:
        scene.frame_set(bf if not ca else cf)
    look(az, *camdef)
    path = os.path.join(tmp_dir, f"_shot_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    tiles.append(np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4))
    bpy.data.images.remove(img)
    os.remove(path)

cols = 4
while len(tiles) % cols:
    tiles.append(np.zeros_like(tiles[0]))
rows = [np.concatenate(tiles[r:r + cols], axis=1) for r in range(0, len(tiles), cols)]
sheet = np.concatenate(rows[::-1], axis=0)   # пікселі Blender ідуть знизу вгору
out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
out.pixels = sheet.ravel()
out.filepath_raw = out_path
out.file_format = 'PNG'
out.save()
print(f"[preview] {out_path}")
