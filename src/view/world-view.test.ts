import { Mesh, PerspectiveCamera, Scene, type BufferGeometry, type Material } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HONEYCOMBS } from '../levels/honeycombs';
import { VILLAGE } from '../levels/village';
import type { Level } from '../sim/level';
import { createSim } from '../sim/sim';
import { createWorldView } from './world-view';

/** Найменший DOM для Бульбашки: показ у Node без браузера. */
function fakeElement() {
  // Полотно табличок: будь-який виклик малювання нічого не робить.
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  return { className: '', hidden: false, dataset: {}, style: {}, innerHTML: '', width: 0, height: 0, getContext: () => ctx, append() {}, remove() {} };
}

async function build(level: Level, world: 'village' | 'honeycombs' | null = null) {
  vi.stubGlobal('document', { createElement: () => fakeElement() });
  const sim = await createSim(level);
  const scene = new Scene();
  const deps = {
    scene,
    bloom: { mark() {} },
    camera: new PerspectiveCamera(),
    canvas: { clientWidth: 800, clientHeight: 600 },
    hudRoot: fakeElement() as unknown as HTMLElement,
    particles: { burst() {}, dust() {} },
    sound: { clink() {}, whoosh() {} },
    debug: {} as Record<string, unknown>,
  };
  return { sim, scene, deps, view: createWorldView(deps, sim, level, undefined, world) };
}

/** Усі геометрії й матеріали сіток у сцені, з позначкою «звільнено». */
function watchResources(scene: Scene) {
  const disposed = new Set<BufferGeometry | Material>();
  const all = new Set<BufferGeometry | Material>();
  scene.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (o.userData['outline']) return; // оболонки контуру ділять одну спільну темну матерію на всю гру
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const r of [o.geometry as BufferGeometry, ...(mats as Material[])]) {
      if (all.has(r)) continue;
      all.add(r);
      r.addEventListener('dispose', () => disposed.add(r));
    }
  });
  return { all, disposed };
}

afterEach(() => vi.unstubAllGlobals());

describe('world view', () => {
  it.each([
    ['village', VILLAGE],
    ['honeycombs', HONEYCOMBS],
  ] as const)('%s (with its dressing): dispose removes every mesh it added and frees all their geometries and materials', async (name, level) => {
    const { sim, scene, view } = await build(level, name);
    view.frame(1 / 60, []);
    const before = scene.children.length;
    expect(before).toBeGreaterThan(0);
    expect(view.meshCount()).toBeGreaterThan(0);
    const { all, disposed } = watchResources(scene);
    view.dispose();
    expect(scene.children).toHaveLength(0);
    expect([...all].filter((r) => !disposed.has(r))).toEqual([]);
    sim.dispose();
  }, 30_000);

  it('draws moving platforms where the rules have them', async () => {
    const { sim, view, deps, scene } = await build(HONEYCOMBS);
    for (let i = 0; i < 90; i++) sim.step({ moveX: 0, moveZ: 0, jump: false, blink: false, strike: false });
    view.frame(1 / 60, []);
    expect(sim.movers.length).toBeGreaterThan(0);
    expect(deps.debug['signs']).toBe(HONEYCOMBS.signs?.length ?? 0);
    expect(deps.debug['source']).toEqual({ cracks: 0, brew: 1, keyVisible: false, hp: 3 });
    expect(deps.debug['movers']).toEqual(sim.movers.map((m) => ({ id: m.id, position: m.position })));
    // Сітка платформи стоїть там, де платформа в правилах.
    for (const m of sim.movers) {
      const found = scene.children.some((o) => o instanceof Mesh && o.position.distanceTo(m.position as never) < 1e-6);
      expect(found).toBe(true);
    }
    view.dispose();
    sim.dispose();
  }, 30_000);
});
