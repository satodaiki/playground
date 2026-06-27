import { COLORS } from './constants';
import type { WasmExports } from './constants';

// 現在の WASM 状態を Canvas に描画する。状態は Rust が持ち、ここは数値を読むだけ。
export function draw(ctx: CanvasRenderingContext2D, w: WasmExports) {
  const fw = w.field_w();
  const fh = w.field_h();

  const grad = ctx.createLinearGradient(0, 0, 0, fh);
  grad.addColorStop(0, COLORS.bgTop);
  grad.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, fw, fh);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= fw; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, fh);
    ctx.stroke();
  }

  const n = w.obstacle_count();
  for (let i = 0; i < n; i++) {
    const ox = w.obstacle_x(i);
    const oy = w.obstacle_y(i);
    const ow = w.obstacle_w(i);
    const oh = w.obstacle_h(i);
    ctx.fillStyle = COLORS.wall;
    ctx.fillRect(ox, oy, ow, oh);
    ctx.fillStyle = COLORS.wallEdge;
    ctx.fillRect(ox, oy, ow, 3);
    ctx.fillRect(ox, oy + oh - 3, ow, 3);
  }

  // プレイヤー（重力の向きで色を変え「跳躍」を表現）。
  const px = w.player_x();
  const py = w.player_y();
  ctx.fillStyle = w.player_vel() >= 0 ? COLORS.playerDown : COLORS.playerUp;
  ctx.fillRect(px, py, w.player_w(), w.player_h());

  ctx.fillStyle = COLORS.hud;
  ctx.font = 'bold 20px "Space Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`${w.score()} m`, 14, 12);
}
