// leap_to_freedom.wasm のエクスポート（整数/浮動小数のみの C ABI）。
// 描画に必要なレイアウト値もゲッターで取り、契約の単一定義点を Rust 側に置く。
export type WasmExports = {
  init: (s0: number, s1: number) => void;
  flip: () => void;
  tick: (dtMs: number) => void;
  player_y: () => number;
  player_vel: () => number;
  obstacle_count: () => number;
  obstacle_x: (i: number) => number;
  obstacle_y: (i: number) => number;
  obstacle_w: (i: number) => number;
  obstacle_h: (i: number) => number;
  score: () => number;
  is_over: () => number;
  field_w: () => number;
  field_h: () => number;
  player_x: () => number;
  player_w: () => number;
  player_h: () => number;
};

export type Phase = 'loading' | 'error' | 'ready' | 'playing' | 'over';

// 描画に属する値（色）は TS 側に置く。
// プレイヤーは重力が下向き＝拘束のとき amber、上向き＝解放のとき mint。
// この 2 色がページ全体の配色（amber=下/拘束・mint=上/自由）の出処になっている。
export const COLORS = {
  bgTop: '#0b1020',
  bgBottom: '#0f1730',
  wall: '#39456f',
  wallEdge: '#5b6aa3',
  playerDown: '#ffc24b',
  playerUp: '#6ff0c0',
  grid: 'rgba(111, 240, 192, 0.06)',
  hud: '#eef2ff',
} as const;

export const HIGHSCORE_KEY = 'leap_to_freedom_highscore';
// 1 フレームの最大 dt（タブ復帰などの巨大 dt を抑え、すり抜けを防ぐ）。
export const MAX_DT_MS = 50;

export function readHighscore(): number {
  const raw = localStorage.getItem(HIGHSCORE_KEY);
  if (raw === null) {
    return 0;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
