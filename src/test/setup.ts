import '@testing-library/jest-dom/vitest';

import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 25+ は組み込みの localStorage グローバルを持つが、--localstorage-file が
// 無いとメソッドが欠けた殻になり、vitest の jsdom 環境構築時（populateGlobal）は
// 「既に global に存在するキーは明示的な許可リストに無い限り上書きしない」ため、
// jsdom 本来の Storage は global に反映されずこの空の殻が居座ってテストを壊す。
// 単体の JSDOM インスタンスから本物の Storage 実装を取り出し、globalThis /
// window（jsdom 環境では同一オブジェクト）へ明示的に張り直す。
const { localStorage: jsdomLocalStorage } = new JSDOM('', { url: 'http://localhost/' }).window;
Object.defineProperty(globalThis, 'localStorage', {
  value: jsdomLocalStorage,
  configurable: true,
  writable: true,
});

// 各テスト後に DOM を破棄し、localStorage と stub を初期化する。
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
});
