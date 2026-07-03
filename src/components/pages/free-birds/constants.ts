// free_birds.wasm のエクスポート（整数/浮動小数のみの C ABI ＋ 線形メモリ）。
// 籠の矩形もゲッターで取り、契約の単一定義点を Rust 側に置く。
export type WasmExports = {
  memory: WebAssembly.Memory;
  init: (s0: number, s1: number, w: number, h: number) => void;
  resize: (w: number, h: number) => void;
  release: () => void;
  reset: () => void;
  set_pointer: (x: number, y: number, active: number) => void;
  tick: (dtMs: number) => void;
  bird_count: () => number;
  birds_ptr: () => number;
  is_released: () => number;
  cage_x: () => number;
  cage_y: () => number;
  cage_w: () => number;
  cage_h: () => number;
};

export type Phase = 'loading' | 'error' | 'caged' | 'released';

export type CageRect = { x: number; y: number; w: number; h: number };

// 描画に属する値（色）は TS 側に置く。夜明けの空に墨色の鳥、鉄の籠。
// ページ全体のトークン（FreeBirds.css）と同じ出処。
export const COLORS = {
  skyTop: '#dfe7f2',
  skyMid: '#e9e6dd',
  horizon: '#f2e7d6',
  bird: '#22262e',
  cage: '#3a4150',
  cageOpen: 'rgba(58, 65, 80, 0.35)',
} as const;

// 1 フレームの最大 dt（タブ復帰の巨大 dt を抑える）。Rust 側 MAX_DT_MS と同値。
export const MAX_DT_MS = 64;

// prefers-reduced-motion 時のシミュレーション速度倍率。
export const REDUCED_MOTION_SCALE = 0.4;

// クリック位置が籠に入っているか。pad は見た目より少し広いヒット領域（タップしやすさ）。
export function hitCage(x: number, y: number, cage: CageRect, pad = 24): boolean {
  return (
    x >= cage.x - pad &&
    x <= cage.x + cage.w + pad &&
    y >= cage.y - pad &&
    y <= cage.y + cage.h + pad
  );
}
