"""Читає відкриту сцену Blender і пише JSON рівня (тип `Level` із src/sim/level.ts).

blender --background <level.blend> --python tools/levels/export_level.py -- <out.json>

Угоди сцени — у шапці level_to_blend.py. Помилки сцени (повернутий блок, невідомий тип, немає `spawn`)
зупиняють експорт із назвою об'єкта.
"""
import bmesh
import bpy
import json
import math
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
dst = argv[0]
scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()
errors = []
EPS = 1e-3  # допуск форми коробки, м


def num(x, digits=4):
    v = round(float(x), digits)
    return 0.0 if v == 0 else v


def b2g(v):
    return {"x": num(v[0]), "y": num(v[2]), "z": num(-v[1])}


def position(ob):
    return b2g(ob.matrix_world.translation)


WORLDS = {"backrooms", "village", "honeycombs"}  # WorldId у src/sim/level.ts
LOOKS = {"ground", "house", "stem", "source"}  # BlockLook у src/sim/level.ts


def facing(ob, quarter_only=False):
    """Поворот навколо вертикалі у світі (з урахуванням батьків і режиму обертання); об'єкт мусить стояти рівно."""
    e = ob.matrix_world.to_euler('XYZ')
    if abs(e.x) > 1e-3 or abs(e.y) > 1e-3:
        errors.append(f"{ob.name}: нахилений; обертати можна лише навколо Z")
    a = float(e.z)
    quarter = math.pi / 2
    k = round(a / quarter)
    if abs(a - k * quarter) < 1e-4:
        return (2 if k == -2 else k) * quarter  # −π і π — той самий напрямок; пишемо π
    if quarter_only:
        errors.append(f"{ob.name}: поворот має бути кратний чверті оберту")
    return num(a, 5)


def block(ob):
    """Коробка за габаритами меша у світі; меш мусить бути коробкою, рівною за осями."""
    if ob.type != 'MESH':
        errors.append(f"{ob.name}: блок мусить бути мешем")
        return None
    # Меш із застосованими модифікаторами, у світових координатах.
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.transform(ob.matrix_world)
    pts = [v.co.copy() for v in bm.verts]
    volume = abs(bm.calc_volume())
    bm.free()
    evaluated.to_mesh_clear()
    if not pts:
        errors.append(f"{ob.name}: порожній меш")
        return None
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    for p in pts:
        if any(min(abs(p[i] - lo[i]), abs(p[i] - hi[i])) > EPS for i in range(3)):
            errors.append(f"{ob.name}: не коробка, рівна за осями (повернута або змінена форма)")
            return None
    half = (hi - lo) / 2
    if min(num(h) for h in half) <= 0:
        errors.append(f"{ob.name}: коробка нульової товщини")
        return None
    box_volume = 8 * half[0] * half[1] * half[2]
    if abs(volume - box_volume) > 0.01 * box_volume:
        errors.append(f"{ob.name}: не суцільна коробка (клин, сходинка чи відкритий меш): об'єм {volume:.3f} проти {box_volume:.3f} м³")
        return None
    out = {
        "kind": ob.get("lb_kind", "solid"),
        "center": b2g((lo + hi) / 2),
        "halfExtents": {"x": num(half[0]), "y": num(half[2]), "z": num(half[1])},
    }
    if out["kind"] not in ("solid", "bars"):
        errors.append(f"{ob.name}: lb_kind = '{out['kind']}', має бути solid або bars")
    if ob.get("lb_look"):
        out["look"] = choice(ob, "lb_look", LOOKS)
    return out


def choice(ob, prop, allowed):
    v = ob.get(prop, "")
    if v not in allowed:
        errors.append(f"{ob.name}: {prop} = '{v}', має бути одне з {sorted(allowed)}")
    return v


by_type = {}
for ob in scene.objects:
    t = ob.get("lb_type")
    if t is None:
        continue  # декор і допоміжні об'єкти без lb_type у рівень не йдуть
    by_type.setdefault(t, []).append(ob)


def order(ob):
    """Місце у списку: `lb_order`, а без нього — у кінці (новий об'єкт не зсуває наявних)."""
    v = ob.get("lb_order")
    if v is None:
        return math.inf
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        errors.append(f"{ob.name}: lb_order має бути числом")
        return math.inf
    return v


for obs in by_type.values():
    obs.sort(key=lambda o: (order(o), o.name))

KNOWN = {"block", "spawn", "entry", "enemy", "cage", "flower", "mover", "mover_to", "source", "survivor", "sign", "route", "trail"}
for t in by_type:
    if t not in KNOWN:
        errors.append(f"невідомий lb_type '{t}' ({by_type[t][0].name})")


def all_of(t):
    return by_type.get(t, [])


def single(t, required=False):
    obs = all_of(t)
    if len(obs) > 1 or (required and not obs):
        errors.append(f"'{t}': має бути рівно один об'єкт" if required else f"'{t}': не більше одного об'єкта")
    return obs[0] if obs else None


level = {"blocks": [b for b in (block(o) for o in all_of("block")) if b]}

spawn = single("spawn", required=True)
if spawn:
    level["spawn"] = position(spawn)
level["killY"] = num(scene.get("lb_killY", -10))
if scene.get("lb_intro"):
    level["intro"] = True

if all_of("enemy"):
    level["enemies"] = [
        {"id": o.name, "kind": choice(o, "lb_kind", {"bee", "turtle"}), "position": position(o), "facing": facing(o)}
        for o in all_of("enemy")
    ]
if all_of("cage"):
    level["cages"] = [
        {"id": o.name, "position": position(o), "facing": facing(o, quarter_only=True), "working": bool(o.get("lb_working", False))}
        for o in all_of("cage")
    ]
if all_of("flower"):
    level["flowers"] = []
    for o in all_of("flower"):
        fl = {
            "id": o.name,
            "position": position(o),
            "color": choice(o, "lb_color", {"yellow", "pink", "blue"}),
            "opens": bool(o.get("lb_opens", False)),
        }
        if o.get("lb_opensWhen"):
            fl["opensWhen"] = choice(o, "lb_opensWhen", {"near", "keyHeld"})
        if o.get("lb_to"):
            fl["to"] = choice(o, "lb_to", WORLDS)
        level["flowers"].append(fl)
if all_of("mover"):
    level["movers"] = []
    for o in all_of("mover"):
        ends = [c for c in o.children if c.get("lb_type") == "mover_to"]
        # Точка B — дочірній об'єкт: масштаб чи поворот платформи зсунув би її разом із собою.
        if any(abs(v - 1) > 1e-4 for v in o.scale) or any(abs(a) > 1e-4 for a in o.rotation_euler):
            errors.append(f"{o.name}: платформу не можна масштабувати чи обертати як об'єкт — зміни меш в Edit Mode або застосуй Ctrl+A")
        b = block(o)
        if len(ends) != 1:
            errors.append(f"{o.name}: рухома платформа потребує рівно одного дочірнього об'єкта mover_to (точка B)")
            continue
        if b:
            level["movers"].append({"id": o.name, "block": b, "to": position(ends[0])})
source = single("source")
if source:
    level["source"] = {"id": source.name, "position": position(source)}
if all_of("entry"):
    level["entries"] = {}
    for o in all_of("entry"):
        world = choice(o, "lb_from", WORLDS)
        if world in level["entries"]:
            errors.append(f"{o.name}: другий вхід зі світу '{world}'")
        level["entries"][world] = position(o)
for o in all_of("mover_to"):
    if o.parent is None or o.parent.get("lb_type") != "mover":
        errors.append(f"{o.name}: точка B мусить бути дочірнім об'єктом рухомої платформи")
if all_of("sign"):
    KEYS = {"arrows", "space", "space2", "shift", "strike"}
    level["signs"] = []
    for o in all_of("sign"):
        keys = [k.strip() for k in str(o.get("lb_keys", "")).split(",") if k.strip()]
        if not keys or any(k not in KEYS for k in keys):
            errors.append(f"{o.name}: lb_keys = '{o.get('lb_keys', '')}', дозволені {sorted(KEYS)} через кому")
        level["signs"].append({"position": position(o), "facing": facing(o), "keys": keys})
if all_of("route"):
    mover_ids = {o.name for o in all_of("mover")}
    route = {"points": [], "actions": []}
    for i, o in enumerate(all_of("route")):
        route["points"].append(position(o))
        do = str(o.get("lb_do", ""))
        if not do:
            continue
        if do == "strikeSource" and not all_of("source"):
            errors.append(f"{o.name}: lb_do = 'strikeSource', але в рівні немає Джерела")
        if do in ("jump", "doubleJump", "blink", "strikeSource"):
            route["actions"].append({"at": i, "do": do})
            continue
        parts = do.split(":")
        if len(parts) == 3 and parts[0] == "waitMover" and parts[1] in mover_ids and parts[2] in ("A", "B"):
            route["actions"].append({"at": i, "do": {"waitMover": parts[1], "near": parts[2]}})
        else:
            errors.append(f"{o.name}: lb_do = '{do}' (jump, doubleJump, blink, strikeSource або waitMover:<id>:A|B)")
    level["route"] = route
survivor = single("survivor")
if survivor:
    level["survivor"] = {"position": position(survivor), "facing": facing(survivor)}
if all_of("trail"):
    trail = {"flower": [], "cage": []}
    seen_trails = set()
    for o in all_of("trail"):
        which = choice(o, "lb_trail", {"flower", "cage"})
        if which in seen_trails:
            errors.append(f"{o.name}: друга Доріжка '{which}'")
        seen_trails.add(which)
        if o.type != 'CURVE':
            errors.append(f"{o.name}: Доріжка мусить бути кривою")
            continue
        if any(s.type != 'POLY' for s in o.data.splines):
            errors.append(f"{o.name}: Доріжка мусить бути ламаною (Spline Type: Poly), не Bezier чи NURBS")
            continue
        pts = [o.matrix_world @ Vector(p.co[:3]) for s in o.data.splines for p in s.points]
        if which in trail:
            trail[which] = [b2g(p) for p in pts]
    level["trail"] = trail

if errors:
    print("ЕКСПОРТ ЗУПИНЕНО:")
    for e in errors:
        print("  -", e)
    sys.exit(1)

with open(dst, "w") as f:
    json.dump(level, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"exported {dst}: {len(level['blocks'])} blocks")
