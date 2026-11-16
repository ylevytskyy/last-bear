import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { toonMaterial } from '../entities/toon';
import type { Level, Vec3, WorldId } from '../sim/level';

/** Детермінований генератор (mulberry32): оздоблення однакове щоразу. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Полотно-текстура, що повторюється; малює `draw` на квадраті `size` px. */
function pattern(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Текстури підлоги й стін світу (повторюються раз на `metres` м). */
export type SurfaceTextures = { ground?: { map: Texture; metres: number }; wall?: { map: Texture; metres: number } };

export function surfaceTextures(world: WorldId): SurfaceTextures {
  if (world === 'backrooms') {
    return {
      wall: {
        metres: 2,
        map: pattern(128, (c, s) => {
          c.fillStyle = '#d9c46a';
          c.fillRect(0, 0, s, s);
          c.fillStyle = '#c9b25a';
          for (let x = 0; x < s; x += 32) c.fillRect(x, 0, 12, s); // смуги шпалер
          c.fillStyle = 'rgba(120,100,40,0.18)';
          for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? 16 : 0; x < s; x += 32) c.fillRect(x + 4, y + 4, 6, 6);
        }),
      },
      ground: {
        metres: 1.5,
        map: pattern(64, (c, s) => {
          c.fillStyle = '#a8955a';
          c.fillRect(0, 0, s, s);
          const r = rng(7);
          for (let i = 0; i < 260; i++) {
            c.fillStyle = r() < 0.5 ? 'rgba(80,65,30,0.25)' : 'rgba(200,180,110,0.25)';
            c.fillRect(r() * s, r() * s, 2, 2); // ворс килима
          }
        }),
      },
    };
  }
  if (world === 'honeycombs') {
    return {
      ground: {
        metres: 2.4,
        map: pattern(128, (c, s) => {
          c.fillStyle = '#e7a92f';
          c.fillRect(0, 0, s, s);
          c.strokeStyle = '#c4861a';
          c.lineWidth = 4;
          const R = s / 4;
          const h = (Math.sqrt(3) / 2) * R;
          for (let row = -1; row < 5; row++) {
            for (let col = -1; col < 4; col++) {
              const cx = col * 1.5 * R * 1.33 + (row % 2 ? 0.75 * R * 1.33 : 0);
              const cy = row * h;
              c.beginPath();
              for (let k = 0; k <= 6; k++) {
                const a = (Math.PI / 3) * k;
                const x = cx + R * 0.62 * Math.cos(a);
                const y = cy + R * 0.62 * Math.sin(a);
                if (k === 0) c.moveTo(x, y);
                else c.lineTo(x, y);
              }
              c.stroke();
            }
          }
        }),
      },
    };
  }
  return {
    ground: {
      metres: 3,
      map: pattern(128, (c, s) => {
        c.fillStyle = '#5f8a4a';
        c.fillRect(0, 0, s, s);
        const r = rng(11);
        for (let i = 0; i < 500; i++) {
          c.fillStyle = r() < 0.5 ? 'rgba(40,80,30,0.35)' : 'rgba(140,190,90,0.3)';
          c.fillRect(r() * s, r() * s, 2, 4); // травинки
        }
      }),
    },
  };
}

export type Dressing = { root: Group; glow: Object3D[]; dispose(): void };

/** Прикраси без колізії: правила їх не бачать. */
export function dressWorld(world: WorldId, level: Level): Dressing {
  const root = new Group();
  root.name = 'dressing';
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const glow: Object3D[] = [];
  const instanced: InstancedMesh[] = [];
  const g = <T extends BufferGeometry>(x: T) => (geometries.push(x), x);
  const m = <T extends Material>(x: T) => (materials.push(x), x);
  const r = rng(world.length * 97 + 3);
  const place = (mesh: Mesh, at: Vec3) => {
    mesh.position.set(at.x, at.y, at.z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  if (world === 'backrooms') {
    // Лампи денного світла під стелею: світні панелі над проходом.
    const lamp = m(new MeshBasicMaterial({ color: '#fbfff2' }));
    const panel = g(new BoxGeometry(1.2, 0.06, 0.5));
    for (let z = -16; z <= 10; z += 4) {
      for (const x of [-4, 4]) {
        const p = place(new Mesh(panel, lamp), { x, y: 3.95, z });
        p.castShadow = false;
        glow.push(p);
      }
    }
  }

  if (world === 'village') {
    const trunk = m(toonMaterial({ color: '#6b4a2b' }));
    const leaves = m(toonMaterial({ color: '#3f7f3a' }));
    const bush = m(toonMaterial({ color: '#4f8f45' }));
    const post = m(toonMaterial({ color: '#7a5a3a' }));
    const trunkGeo = g(new CylinderGeometry(0.18, 0.25, 1.6, 7));
    const crownGeo = g(new ConeGeometry(1.2, 2.6, 8));
    const bushGeo = g(new IcosahedronGeometry(0.6, 0));
    const postGeo = g(new BoxGeometry(0.12, 1, 0.12));
    const railGeo = g(new BoxGeometry(1.0, 0.08, 0.06));
    const lampGeo = g(new SphereGeometry(0.18, 10, 8));
    const lampMat = m(new MeshBasicMaterial({ color: '#ffd28a' }));
    // Ліс за стінами площі: камера лишається всередині стін, тож дерева ніколи не закривають Софійку.
    for (let i = 0; i < 28; i++) {
      const side = i % 4;
      const u = -24 + r() * 48;
      const out = 21.8 + r() * 3;
      const at = side === 0 ? { x: u, y: 0, z: -out } : side === 1 ? { x: u, y: 0, z: out } : side === 2 ? { x: -out, y: 0, z: u } : { x: out, y: 0, z: u };
      if (r() < 0.6) {
        place(new Mesh(trunkGeo, trunk), { ...at, y: 0.8 });
        place(new Mesh(crownGeo, leaves), { ...at, y: 2.6 }).scale.setScalar(0.8 + r() * 0.5);
      } else {
        place(new Mesh(bushGeo, bush), { ...at, y: 0.35 }).scale.set(1 + r() * 0.6, 0.7, 1 + r() * 0.6);
      }
    }
    // Низький паркан перед рядом Кліток (позаду них нічого не загороджує).
    const cages = level.cages ?? [];
    if (cages.length) {
      const xs = cages.map((c) => c.position.x);
      const z = cages[0]!.position.z + 2.6;
      const from = Math.min(...xs) - 1.5;
      const to = Math.max(...xs) + 1.5;
      const count = Math.floor(to - from) + 1;
      const posts = new InstancedMesh(postGeo, post, count); // один виклик малювання на весь паркан
      const dummy = new Object3D();
      for (let i = 0; i < count; i++) {
        dummy.position.set(from + i, 0.5, z);
        dummy.updateMatrix();
        posts.setMatrixAt(i, dummy.matrix);
      }
      posts.instanceMatrix.needsUpdate = true;
      posts.castShadow = true;
      root.add(posts);
      instanced.push(posts);
      const rail = place(new Mesh(railGeo, post), { x: (from + to) / 2, y: 0.75, z });
      rail.scale.x = to - from;
    }
    // Ліхтарі вздовж Доріжки до Квітки.
    for (const p of (level.trail?.flower ?? []).slice(1)) {
      place(new Mesh(postGeo, post), { x: p.x + 1.4, y: 0.9, z: p.z }).scale.set(1, 1.8, 1);
      const bulb = place(new Mesh(lampGeo, lampMat), { x: p.x + 1.4, y: 1.95, z: p.z });
      bulb.castShadow = false;
      glow.push(bulb);
    }
  }

  if (world === 'honeycombs') {
    // Хмари внизу й навколо.
    const cloud = m(toonMaterial({ color: '#ffffff', emissive: '#dfefff', emissiveIntensity: 0.25 }));
    const puff = g(new SphereGeometry(1, 10, 8));
    for (let i = 0; i < 26; i++) {
      const group = new Group();
      const at = { x: -10 + r() * 110, y: -9 + r() * 6, z: -30 + r() * 60 };
      for (let k = 0; k < 4; k++) {
        const p = new Mesh(puff, cloud);
        p.position.set((k - 1.5) * 1.6, r() * 0.6, r() * 1.2);
        p.scale.setScalar(1.2 + r() * 1.3);
        group.add(p);
      }
      group.position.set(at.x, at.y, at.z);
      root.add(group);
    }
  }

  return {
    root,
    glow,
    dispose() {
      for (const x of instanced) x.dispose();
      for (const x of geometries) x.dispose();
      for (const x of materials) x.dispose();
    },
  };
}
