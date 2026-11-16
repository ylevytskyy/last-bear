"""Будує сцену Blender з JSON рівня (тип `Level` із src/sim/level.ts) і зберігає .blend.

blender --background --python tools/levels/level_to_blend.py -- <level.json> <out.blend>

Угоди сцени (їх читає export_level.py):
  - Осі: гра (x, y, z), y вгору  ->  Blender (x, -z, y), Z вгору. 1 одиниця = 1 м.
  - `facing` = поворот об'єкта навколо Z; «вперед» об'єкта — його локальна вісь -Y. Нахиляти не можна.
  - У рівень ідуть лише об'єкти з властивістю `lb_type` (Custom Properties); решта — декор, експорт її не бачить.
  - Порядок у списках — `lb_order`, далі за назвою; об'єкт без `lb_order` стає в кінець.
  - `id` сутності = назва об'єкта.
  - Числа рівня — властивості сцени: `lb_killY` (число), `lb_intro` (так/ні).

Об'єкти за `lb_type`:
  block     меш-коробка, рівна за осями (розмір — з габаритів у світі, з модифікаторами).
            `lb_kind`: solid | bars;  `lb_look` (необов'язково): ground | house | stem | source.
  spawn     порожній об'єкт, рівно один: де з'являється Софійка.
  entry     порожній об'єкт: де вона з'являється, прийшовши зі світу `lb_from` (backrooms | village | honeycombs).
  enemy     порожній об'єкт; `lb_kind`: bee | turtle. Бджола — центр тіла, Черепаха — підошви.
  cage      порожній об'єкт на центрі підлоги Клітки; поворот кратний чверті оберту; `lb_working`: так/ні.
  flower    порожній об'єкт на землі під ніжкою. `lb_color`: yellow | pink | blue;  `lb_opens`: так/ні;
            `lb_opensWhen`: near | keyHeld або порожньо;  `lb_to`: світ, куди веде, або порожньо.
  mover     меш-коробка в точці A (як block) з рівно одним дочірнім порожнім об'єктом `mover_to` у точці B
            (центр платформи в B). Саму платформу не масштабувати й не обертати як об'єкт.
  source    порожній об'єкт на землі під казаном, не більше одного.
  survivor  порожній об'єкт, не більше одного.
  sign      порожній об'єкт на землі; `lb_keys`: через кому з arrows, space, space2, shift, strike.
  route     порожні об'єкти — точки маршруту бота за порядком. `lb_do`: порожньо, jump, doubleJump, blink,
            strikeSource або waitMover:<id платформи>:A|B.
  trail     крива-ламана (Spline Type: Poly), по одній на `lb_trail`: flower | cage.
"""
import bpy
import json
import sys

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]
with open(src) as f:
    level = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'


def g2b(v):
    return (v["x"], -v["z"], v["y"])


_collections = {}


def collection(name):
    if name not in _collections:
        c = bpy.data.collections.new(name)
        scene.collection.children.link(c)
        _collections[name] = c
    return _collections[name]


_materials = {}


def material(name, rgba):
    if name not in _materials:
        m = bpy.data.materials.new(name)
        m.diffuse_color = rgba
        _materials[name] = m
    return _materials[name]


COLORS = {
    "solid": (0.75, 0.66, 0.38, 1.0),
    "bars": (0.3, 0.5, 0.9, 0.5),
    "house": (0.55, 0.35, 0.25, 1.0),
    "mover": (0.95, 0.55, 0.15, 1.0),
}


def box(name, block, coll, lb_type, order):
    h = block["halfExtents"]
    hx, hy, hz = h["x"], h["z"], h["y"]
    verts = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    ob.location = g2b(block["center"])
    ob["lb_type"] = lb_type
    ob["lb_order"] = order
    ob["lb_kind"] = block["kind"]
    if "look" in block:
        ob["lb_look"] = block["look"]
    key = "mover" if lb_type == "mover" else block.get("look") if block.get("look") in COLORS else block["kind"]
    mesh.materials.append(material(key, COLORS[key]))
    ob.color = COLORS[key]
    coll.objects.link(ob)
    return ob


def empty(name, position, coll, lb_type, order, facing=None, display='ARROWS', size=1.0):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = display
    ob.empty_display_size = size
    ob.location = g2b(position)
    if facing is not None:
        ob.rotation_euler = (0.0, 0.0, facing)
    ob["lb_type"] = lb_type
    ob["lb_order"] = order
    coll.objects.link(ob)
    if ob.name != name:
        raise SystemExit(f"назва '{name}' вже зайнята (стала '{ob.name}'): id мають бути унікальні в межах рівня")
    return ob


def polyline(name, points, coll, which):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    if points:
        spline.points.add(len(points) - 1)
        for p, v in zip(spline.points, points):
            p.co = (*g2b(v), 1.0)
    else:
        curve.splines.remove(spline)
    ob = bpy.data.objects.new(name, curve)
    ob["lb_type"] = "trail"
    ob["lb_trail"] = which
    coll.objects.link(ob)


scene["lb_killY"] = float(level["killY"])
scene["lb_intro"] = bool(level.get("intro", False))

for i, b in enumerate(level["blocks"]):
    box(f"block.{i:03d}", b, collection("blocks"), "block", i)

empty("spawn", level["spawn"], collection("markers"), "spawn", 0, display='SINGLE_ARROW', size=1.4)
for i, (world, pos) in enumerate(level.get("entries", {}).items()):
    ob = empty(f"entry.{world}", pos, collection("markers"), "entry", i, display='SINGLE_ARROW', size=1.4)
    ob["lb_from"] = world

for i, e in enumerate(level.get("enemies", [])):
    ob = empty(e["id"], e["position"], collection("enemies"), "enemy", i, e["facing"])
    ob["lb_kind"] = e["kind"]

for i, c in enumerate(level.get("cages", [])):
    ob = empty(c["id"], c["position"], collection("cages"), "cage", i, c["facing"], display='CUBE')
    ob["lb_working"] = bool(c["working"])

for i, fl in enumerate(level.get("flowers", [])):
    ob = empty(fl["id"], fl["position"], collection("flowers"), "flower", i, display='SPHERE', size=0.6)
    ob["lb_color"] = fl["color"]
    ob["lb_opens"] = bool(fl["opens"])
    ob["lb_opensWhen"] = fl.get("opensWhen", "")
    ob["lb_to"] = fl.get("to", "")

for i, m in enumerate(level.get("movers", [])):
    ob = box(m["id"], m["block"], collection("movers"), "mover", i)
    if ob.name != m["id"]:
        raise SystemExit(f"назва '{m['id']}' вже зайнята")
    to = empty(f"{m['id']}.to", m["to"], collection("movers"), "mover_to", i, display='PLAIN_AXES')
    to.parent = ob
    to.matrix_parent_inverse = ob.matrix_basis.inverted()

if "source" in level:
    empty(level["source"]["id"], level["source"]["position"], collection("markers"), "source", 0, display='CUBE')

if "survivor" in level:
    s = level["survivor"]
    empty("survivor", s["position"], collection("markers"), "survivor", 0, s["facing"])

for i, s in enumerate(level.get("signs", [])):
    ob = empty(f"sign.{i:03d}", s["position"], collection("signs"), "sign", i, s["facing"])  # ARROWS: видно, куди дивиться
    ob["lb_keys"] = ",".join(s["keys"])

if "route" in level:
    actions = {}
    for a in level["route"]["actions"]:
        if a["at"] in actions:
            raise SystemExit(f"route: дві дії в точці {a['at']} — угода сцени дозволяє одну")
        do = a["do"]
        actions[a["at"]] = do if isinstance(do, str) else f"waitMover:{do['waitMover']}:{do['near']}"
    for i, p in enumerate(level["route"]["points"]):
        ob = empty(f"route.{i:03d}", p, collection("route"), "route", i, display='SPHERE', size=0.25)
        ob["lb_do"] = actions.get(i, "")

if "trail" in level:
    for which in ("flower", "cage"):
        polyline(f"trail.{which}", level["trail"][which], collection("trail"), which)

bpy.ops.wm.save_as_mainfile(filepath=dst)
print(f"saved {dst}: {len(scene.objects)} objects")
