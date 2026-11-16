"""Рендерить контрольні кадри з готового .glb (перевірка саме експортованого файлу).

    blender --background --python tools/sofia/preview_glb.py -- model.glb out_dir [Clip:frame:view ...]
view: front | side | back | q (три чверті спереду) | bq (три чверті ззаду) | face
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
glb, out_dir, shots = argv[0], argv[1], argv[2:]
os.makedirs(out_dir, exist_ok=True)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=glb)
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
key = bpy.data.objects.get("PROP_Flower_Key")
scene = bpy.context.scene
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
scene.render.resolution_x = scene.render.resolution_y = 560
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("W")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.55, 0.57, 0.62, 1)
bg.inputs[1].default_value = 1.0
scene.world = world


def light(name, kind, loc, energy, color):
    d = bpy.data.lights.new(name, kind)
    d.energy, d.color = energy, color
    o = bpy.data.objects.new(name, d)
    o.location = loc
    scene.collection.objects.link(o)
    o.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


light("key", "SUN", (-2, -3, 3), 4.0, (1, 0.97, 0.9))
light("fill", "SUN", (3, -2, 1), 1.5, (0.7, 0.8, 1))
light("rim", "SUN", (0.5, 3, 2.5), 5.0, (0.62, 0.4, 1))

cam_d = bpy.data.cameras.new("cam")
cam_d.lens = 70
cam = bpy.data.objects.new("cam", cam_d)
scene.collection.objects.link(cam)
scene.camera = cam
VIEWS = {
    "front": ((0, -4.2, 0.62), 0.56),
    "side": ((4.2, 0, 0.62), 0.56),
    "back": ((0, 4.2, 0.62), 0.56),
    "q": ((-2.6, -3.3, 1.1), 0.55),
    "bq": ((2.6, 3.3, 1.3), 0.55),
    "face": ((-0.8, -2.0, 0.95), 0.83),
    "close": ((-1.5, -1.9, 0.75), 0.42),
    "closeb": ((1.6, 1.8, 0.8), 0.42),
}


def find_action(name):
    for a in bpy.data.actions:
        if a.name == name or a.name.startswith(name + "_") or a.name.startswith(name + "."):
            return a
    raise SystemExit("no action for clip " + name + ": " + ", ".join(a.name for a in bpy.data.actions))


for shot in shots:
    clip, frame, view = shot.split(":")
    if not rig.animation_data:
        rig.animation_data_create()
    for t in rig.animation_data.nla_tracks:
        t.mute = True
    if clip == "Rest":
        rig.animation_data.action = None
        for pb in rig.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
    else:
        act = find_action(clip)
        rig.animation_data.action = act
        if hasattr(rig.animation_data, "action_slot") and getattr(act, "slots", None):
            rig.animation_data.action_slot = act.slots[0]
    if key:
        key.hide_render = clip != "Unlock_Cage"
    scene.frame_set(int(frame))
    loc, tz = VIEWS[view]
    cam.location = loc
    cam.rotation_euler = (Vector((0, 0, tz)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out_dir, "%s_%s_%s.png" % (clip, frame, view))
    bpy.ops.render.render(write_still=True)
print("[preview] actions:", sorted(a.name for a in bpy.data.actions))
