import '@testing-library/jest-dom/vitest';

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 各テスト後に DOM を破棄し、localStorage と stub を初期化する。
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  localStorage.clear();
});
