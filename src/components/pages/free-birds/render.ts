import { COLORS } from './constants';
import type { CageRect } from './constants';

// 空・籠・群れの描画。鳥バッファは鳥ごとに [x, y, vx, vy]。
// 鳥は速度方向を向いた「への字」の翼で描き、nowMs で羽ばたかせる。
export function draw(
  ctx: CanvasRenderingContext2D,
  view: Float32Array,
  count: number,
  cage: CageRect,
  released: boolean,
  nowMs: number,
): void {
  const { width, height } = ctx.canvas;
  drawSky(ctx, width, height);
  drawCage(ctx, cage, released);
  for (let i = 0; i < count; i++) {
    const x = view[i * 4];
    const y = view[i * 4 + 1];
    const vx = view[i * 4 + 2];
    const vy = view[i * 4 + 3];
    drawBird(ctx, x, y, Math.atan2(vy, vx), nowMs * 0.012 + i * 1.7);
  }
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLORS.skyTop);
  g.addColorStop(0.62, COLORS.skyMid);
  g.addColorStop(1, COLORS.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ドーム型の鳥かご。解放後は薄く残し、扉（右側の1本）を外側へ開いて描く。
function drawCage(ctx: CanvasRenderingContext2D, cage: CageRect, released: boolean): void {
  if (cage.w <= 0 || cage.h <= 0) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = released ? COLORS.cageOpen : COLORS.cage;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const cx = cage.x + cage.w / 2;
  const domeY = cage.y + cage.h * 0.3;

  // ドーム（上部の弧）
  ctx.beginPath();
  ctx.moveTo(cage.x, domeY);
  ctx.quadraticCurveTo(cx, cage.y - cage.h * 0.18, cage.x + cage.w, domeY);
  ctx.stroke();

  // 縦棒 7 本（右端の 1 本は扉）
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const t = i / (bars - 1);
    const bx = cage.x + t * cage.w;
    // ドームの弧に沿った上端
    const topY = domeY - Math.sin(t * Math.PI) * cage.h * 0.28;
    ctx.beginPath();
    if (released && i === bars - 1) {
      // 扉：下端を支点に外側へ 60 度開く
      const doorLen = cage.y + cage.h - topY;
      ctx.moveTo(bx, cage.y + cage.h);
      ctx.lineTo(bx + doorLen * 0.87, cage.y + cage.h - doorLen * 0.5);
    } else {
      ctx.moveTo(bx, topY);
      ctx.lineTo(bx, cage.y + cage.h);
    }
    ctx.stroke();
  }

  // 台座
  ctx.beginPath();
  ctx.moveTo(cage.x - cage.w * 0.06, cage.y + cage.h);
  ctx.lineTo(cage.x + cage.w * 1.06, cage.y + cage.h);
  ctx.stroke();
  ctx.restore();
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  flap: number,
): void {
  const wing = 5 + Math.sin(flap) * 2.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = COLORS.bird;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -wing);
  ctx.quadraticCurveTo(0, 0, 3, 0);
  ctx.quadraticCurveTo(0, 0, -4, wing);
  ctx.stroke();
  ctx.restore();
}
