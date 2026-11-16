import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';

export type SignKey = 'arrows' | 'space' | 'space2' | 'shift' | 'strike';

/** Малює одну клавішу-картинку в квадраті `size` px; без літер. */
function drawKey(ctx: CanvasRenderingContext2D, key: SignKey, x: number, y: number, size: number): void {
  const cap = (cx: number, cy: number, w: number, h: number) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.strokeStyle = '#3a3a44';
    ctx.lineWidth = size * 0.04;
    ctx.beginPath();
    ctx.roundRect(cx, cy, w, h, size * 0.08);
    ctx.fill();
    ctx.stroke();
  };
  const arrow = (cx: number, cy: number, s: number, angle: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.8, s * 0.2);
    ctx.lineTo(s * 0.3, s * 0.2);
    ctx.lineTo(s * 0.3, s);
    ctx.lineTo(-s * 0.3, s);
    ctx.lineTo(-s * 0.3, s * 0.2);
    ctx.lineTo(-s * 0.8, s * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const u = size / 3;
  if (key === 'arrows') {
    const cells: [number, number, number][] = [[1, 0, 0], [0, 1, -Math.PI / 2], [1, 1, Math.PI], [2, 1, Math.PI / 2]];
    for (const [cx, cy, a] of cells) {
      cap(x + cx * u + 2, y + (cy + 0.5) * u + 2, u - 4, u - 4);
      arrow(x + (cx + 0.5) * u, y + (cy + 1) * u, u * 0.28, a);
    }
  } else if (key === 'space' || key === 'space2') {
    const rows = key === 'space' ? 1 : 2;
    for (let r = 0; r < rows; r++) cap(x + 4, y + size * (rows === 1 ? 0.38 : 0.2 + r * 0.38), size - 8, size * 0.24);
  } else if (key === 'shift') {
    cap(x + 6, y + size * 0.2, size - 12, size * 0.6);
    arrow(x + size / 2, y + size / 2, size * 0.2, 0);
  } else {
    // Удар: клавіша з лапою (три пальчики й подушечка) і миша з лівою кнопкою.
    cap(x + 4, y + size * 0.1, size * 0.5, size * 0.5);
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath();
    ctx.arc(x + 4 + size * 0.25, y + size * 0.42, size * 0.1, 0, Math.PI * 2);
    for (const dx of [-0.12, 0, 0.12]) ctx.arc(x + 4 + size * (0.25 + dx), y + size * 0.24, size * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f1ea';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.78, y + size * 0.62, size * 0.16, size * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff6a3d';
    ctx.beginPath();
    ctx.ellipse(x + size * 0.73, y + size * 0.48, size * 0.07, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export type SignModel = { root: Group; dispose(): void };

/** Табличка на ніжці з намальованими клавішами (без літер). Земля під ніжкою — (0,0,0), лице дивиться в +z. */
export function buildSign(keys: readonly SignKey[]): SignModel {
  const cell = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cell * Math.max(1, keys.length);
  canvas.height = cell;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  keys.forEach((k, i) => drawKey(ctx, k, i * cell + 8, 8, cell - 16));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const wood = new MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 });
  const face = new MeshStandardMaterial({ map: texture, roughness: 0.8 });
  const width = 0.7 * Math.max(1, keys.length);
  const boardGeo = new BoxGeometry(width, 0.7, 0.06);
  const postGeo = new BoxGeometry(0.1, 1.1, 0.1);
  const root = new Group();
  root.name = 'sign';
  const post = new Mesh(postGeo, wood);
  post.position.y = 0.55;
  const board = new Mesh(boardGeo, [wood, wood, wood, wood, face, wood]);
  board.position.y = 1.35;
  root.add(post, board);
  return {
    root,
    dispose() {
      boardGeo.dispose();
      postGeo.dispose();
      wood.dispose();
      face.dispose();
      texture.dispose();
    },
  };
}
