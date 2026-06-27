import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWasm } from '@/hooks/useWasm';
import { mockWasmFetch, mockWasmFetchFailure } from './wasm';

type GachaExports = { seed: (a: number, b: number) => void; roll_rarity: () => number };

describe('useWasm', () => {
  it('ロード成功で status=ready になり exports が使える', async () => {
    mockWasmFetch('gacha_core.wasm');
    const { result } = renderHook(() => useWasm<GachaExports>('/gacha_core.wasm'));

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(typeof result.current.exports?.seed).toBe('function');
  });

  it('ロード失敗で status=error になり exports は null のまま', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockWasmFetchFailure();
    const { result } = renderHook(() => useWasm('/missing.wasm'));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.exports).toBeNull();
  });
});
