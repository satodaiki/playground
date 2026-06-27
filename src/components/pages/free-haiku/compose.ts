import { makeSeed } from '@/lib/seed';

import { BANKS } from './data';
import type { Poem } from './data';

// free_haiku.wasm のエクスポート。句の「構造」（行数・各行のセグメント数・
// 各セグメントが引く語彙バンク）と韻律スコアは Rust 側に閉じている。
// 語そのものの選択は pick() を使って TS 側で行う。
export type WasmExports = {
  seed: (s0: number, s1: number) => void;
  pick: (n: number) => number;
  roll: () => number;
  line_len: (i: number) => number;
  seg_bank: (i: number, j: number) => number;
  score_reset: () => void;
  score_push: (len: number) => void;
  score_eval: () => number;
};

// WASM を呼んで自由律俳句を 1 句生成する。
// 構造は roll/line_len/seg_bank、語の選択は pick、字数の韻律評価は score_* を使う。
export function generate(w: WasmExports): Poem {
  const [s0, s1] = makeSeed();
  w.seed(s0, s1);

  const lineCount = w.roll() >>> 0;
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    const segs = w.line_len(i) >>> 0;
    const parts: string[] = [];
    for (let j = 0; j < segs; j++) {
      const bank = BANKS[w.seg_bank(i, j) >>> 0];
      const word = bank.words[w.pick(bank.words.length) >>> 0];
      parts.push(word);
    }
    lines.push(parts.join(''));
  }

  w.score_reset();
  for (const line of lines) {
    w.score_push([...line].length);
  }
  const score = w.score_eval() | 0;

  return { lines, score };
}

export function poemText(poem: Poem): string {
  return poem.lines.join('\n');
}

export function oneLine(text: string): string {
  return text.split('\n').join(' / ');
}
