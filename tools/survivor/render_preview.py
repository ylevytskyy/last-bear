"""Контактний аркуш з експортованого GLB (перевірка саме того файлу, що піде у гру).

blender --background --python tools/survivor/render_preview.py -- <model.glb> <out.png>
"""
import bpy
import sys
import os
import math
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb_path, out_path = argv[0], argv[1]
W, H = 440, 560

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb_path)
scene = bpy.context.scene
arm = next(o for o in scene.objects if o.type == 'ARMATURE')

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
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
scene.collection.objects.link(sun)

cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.lens = 60
scene.collection.objects.link(cam)
scene.camera = cam

def look(azimuth_deg, dist=5.6, target=(0.0, 0.0, 0.98), elev=0.12):
    a = math.radians(azimuth_deg)   # 0 = спереду (камера на -Y)
    t = Vector(target)
    cam.location = t + Vector((math.sin(a) * dist, -math.cos(a) * dist, elev * dist))
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun.rotation_euler = (math.radians(50), 0, a + math.radians(-25))

def set_action(name, frame):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks:
        tr.mute = True
    act = next((a for a in bpy.data.actions if a.name == name or a.name.startswith(name)), None)
    if act is None:
        raise RuntimeError(f"action {name} not found: {[a.name for a in bpy.data.actions]}")
    ad.action = act
    if hasattr(ad, "action_slot") and len(getattr(act, "slots", [])):
        ad.action_slot = act.slots[0]
    scene.frame_set(frame)

def rest_pose():
    ad = arm.animation_data
    if ad:
        ad.action = None
        for tr in ad.nla_tracks:
            tr.mute = True
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    scene.frame_set(0)
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)

shots = [
    ("rest", None, 0, 0), ("rest", None, 0, 90), ("rest", None, 0, 180), ("rest", None, 0, -40),
    ("Idle", "Idle", 0, 0), ("Idle", "Idle", 45, -40), ("Walk", "Walk", 8, -60), ("Walk", "Walk", 28, 90),
    ("Talk", "Talk_Gesture", 22, -25), ("Talk", "Talk_Gesture", 34, 0),
    ("Point", "Point_Direction", 20, 0), ("Point", "Point_Direction", 20, 60),
]
tiles = []
tmp_dir = os.path.dirname(out_path)
for i, (label, action, frame, az) in enumerate(shots):
    if action:
        set_action(action, frame)
    else:
        rest_pose()
    look(az)
    path = os.path.join(tmp_dir, f"_shot_{i:02d}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    tiles.append(np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4))
    bpy.data.images.remove(img)
    os.remove(path)

cols = 4
rows = [np.concatenate(tiles[r:r + cols], axis=1) for r in range(0, len(tiles), cols)]
sheet = np.concatenate(rows[::-1], axis=0)   # пікселі Blender ідуть знизу вгору
out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
out.pixels = sheet.ravel()
out.filepath_raw = out_path
out.file_format = 'PNG'
out.save()
print(f"[preview] {out_path}")
