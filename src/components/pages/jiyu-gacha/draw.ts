import { makeSeed } from '@/lib/seed';

import { CATEGORIES, RARITIES } from './data';
import type { DrawResult, Part, Rarity } from './data';

// WASM コアエンジン(gacha_core.wasm)のエクスポート。
// ロジック（乱数・レアリティ・組み合わせ数）は Rust 側に閉じている。
export type WasmExports = {
  seed: (s0: number, s1: number) => void;
  next_u32: () => number;
  pick: (n: number) => number;
  roll_rarity: () => number;
  parts_count_for: (rarity: number) => number;
};

// WASM を呼んで 1 回ガチャを引く。
export function draw(w: WasmExports): DrawResult {
  const [s0, s1] = makeSeed();
  w.seed(s0, s1);
  const rarityIndex = w.roll_rarity() >>> 0;
  const count = w.parts_count_for(rarityIndex) >>> 0;
  const parts: Part[] = [];
  for (let i = 0; i < count && i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    const idx = w.pick(cat.words.length) >>> 0;
    parts.push({ label: cat.label, cls: cat.cls, word: cat.words[idx] });
  }
  return { rarityIndex, parts };
}

export function ideaText(result: DrawResult): string {
  return result.parts.map((p) => `【${p.label}】${p.word}`).join(' × ');
}

export function rarityMeta(key: string): Rarity {
  return RARITIES.find((r) => r.key === key) ?? RARITIES[0];
}
