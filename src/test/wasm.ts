import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { vi } from 'vitest';

// ページコンポーネントは `fetch(wasmUrl) → arrayBuffer() → WebAssembly.instantiate`
// で WASM を読む。テストでは実際の .wasm バイト列をディスクから読み出して
// fetch を差し替えることで、本物の Rust ロジックを UI 越しに検証する（モックの
// 振る舞いではなく実コードをテストする）。
export function mockWasmFetch(fileName: string): void {
  const bytes = readFileSync(resolve(process.cwd(), 'src/assets', fileName));
  // Buffer の該当領域だけを切り出して ArrayBuffer 化する。
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => ab }) as unknown as Response),
  );
}

// WASM 読み込み失敗（エラー状態）を再現する。
export function mockWasmFetchFailure(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('network error (test)');
    }),
  );
}
