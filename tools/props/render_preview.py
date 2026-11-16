"""Контактний аркуш з експортованого GLB (перевірка саме того файлу, що піде у гру).

blender --background --python tools/props/render_preview.py -- <model.glb> <out.png> <target_z> <dist> <shots> [hide]
    shots: "Clip:frame:azimuth;..." (Clip = rest -> поза спокою)
    hide:  назви об'єктів через кому, які сховати (наприклад, стадії тріщин)
"""
import bpy
import sys
import os
import math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_path, out_path, target_z, dist = argv[0], argv[1], float(argv[2]), float(argv[3])
shots = [s.split(":") for s in argv[4].split(";")]
hidden = argv[5].split(",") if len(argv) > 5 else []
W, H = 480, 480

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
for obj in scene.objects:
    if any(obj.name.startswith(h) for h in hidden):
        obj.hide_render = True

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
bg.inputs[0].default_value = (0.55, 0.57, 0.60, 1.0)
bg.inputs[1].default_value = 0.9
scene.world = world

sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", 'SUN'))
sun.data.energy = 3.0
scene.collection.objects.link(sun)

floor_mesh = bpy.data.meshes.new("Floor")
bpy.context.view_layer.update()
floor_z = min((o.matrix_world @ Vector(c)).z for o in scene.objects if o.type == 'MESH' for c in o.bound_box) - 0.25 * (target_z == 0.0)
floor_mesh.from_pydata([(-4, -4, floor_z), (4, -4, floor_z), (4, 4, floor_z), (-4, 4, floor_z)], [], [(0, 1, 2, 3)])
scene.collection.objects.link(bpy.data.objects.new("Floor", floor_mesh))

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens = 60
scene.collection.objects.link(cam)
scene.camera = cam


def look(azimuth_deg, elev=0.35):
    a = math.radians(azimuth_deg)   # 0 = камера на -Y
    t = Vector((0.0, 0.0, target_z))
    cam.location = t + Vector((math.sin(a) * dist, -math.cos(a) * dist, elev * dist))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun.rotation_euler = (math.radians(50), 0, a + math.radians(-25))


def set_action(name, frame):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    if name == "rest":
        ad.action = None
        for pb in arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        scene.frame_set(0)
        return
    act = next((a for a in bpy.data.actions if a.name == name), None)
    if act is None:
        raise RuntimeError(f"action {name} not found: {[a.name for a in bpy.data.actions]}")
    ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    scene.frame_set(frame)


tiles = []
tmp_dir = os.path.dirname(out_path)
for i, (action, frame, az) in enumerate(shots):
    set_action(action, int(frame))
    look(float(az))
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
