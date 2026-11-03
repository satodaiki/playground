import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

vi.mock('@googlemaps/js-api-loader', () => ({ importLibrary: vi.fn(), setOptions: vi.fn() }));

describe('Google Mapsの共通ローダー', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(importLibrary).mockReset();
    vi.mocked(setOptions).mockReset();
    vi.stubGlobal('google', { maps: { importLibrary: vi.fn() } });
    vi.stubGlobal('gm_authFailure', undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('地図と候補検索からの同時読み込みをまとめ、公式ローダーを一度だけ初期化する', async () => {
    vi.mocked(importLibrary).mockResolvedValue({} as google.maps.CoreLibrary);
    const { loadGoogleMaps } = await import('@/components/pages/trip-planner/maps');
    const first = loadGoogleMaps(' browser-key ');
    const second = loadGoogleMaps('browser-key');
    expect(first).toBe(second);
    await expect(first).resolves.toBe(window.google.maps);
    expect(setOptions).toHaveBeenCalledExactlyOnceWith({ key: 'browser-key', v: 'quarterly', language: 'ja', region: 'JP' });
    expect(importLibrary).toHaveBeenCalledExactlyOnceWith('core');
  });

  it('読み込み失敗を永久にキャッシュせず、同じキーで再試行できる', async () => {
    vi.mocked(importLibrary).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({} as google.maps.CoreLibrary);
    const { loadGoogleMaps } = await import('@/components/pages/trip-planner/maps');
    await expect(loadGoogleMaps('browser-key')).rejects.toMatchObject({ code: 'network' });
    await expect(loadGoogleMaps('browser-key')).resolves.toBe(window.google.maps);
    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(importLibrary).toHaveBeenCalledTimes(2);
  });

  it('キー未設定ではGoogleへリクエストを送らない', async () => {
    const { loadGoogleMaps } = await import('@/components/pages/trip-planner/maps');
    await expect(loadGoogleMaps('  ')).rejects.toMatchObject({ code: 'missing-key' });
    expect(setOptions).not.toHaveBeenCalled();
    expect(importLibrary).not.toHaveBeenCalled();
  });

  it('別のキーへ黙って切り替えず、ページの再読み込みが必要と判定する', async () => {
    vi.mocked(importLibrary).mockResolvedValue({} as google.maps.CoreLibrary);
    const { loadGoogleMaps } = await import('@/components/pages/trip-planner/maps');
    await loadGoogleMaps('first-key');
    await expect(loadGoogleMaps('different-key')).rejects.toMatchObject({ code: 'key-changed' });
    expect(setOptions).toHaveBeenCalledTimes(1);
  });

  it('応答が返らない場合は期限を設け、その後の再試行も可能にする', async () => {
    vi.useFakeTimers();
    vi.mocked(importLibrary).mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue({} as google.maps.CoreLibrary);
    const { loadGoogleMaps, MAPS_TIMEOUT_MS } = await import('@/components/pages/trip-planner/maps');
    const rejected = expect(loadGoogleMaps('browser-key')).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(MAPS_TIMEOUT_MS);
    await rejected;
    await expect(loadGoogleMaps('browser-key')).resolves.toBe(window.google.maps);
  });

  it('非同期の認証エラーを共有し、既存の認証ハンドラーも維持する', async () => {
    const previous = vi.fn();
    vi.stubGlobal('gm_authFailure', previous);
    vi.mocked(importLibrary).mockImplementation(() => new Promise(() => {}));
    const { loadGoogleMaps, watchMapsAuthorization } = await import('@/components/pages/trip-planner/maps');
    const listener = vi.fn();
    const removed = vi.fn();
    const unsubscribe = watchMapsAuthorization(removed);
    unsubscribe();
    watchMapsAuthorization(listener);
    const rejected = expect(loadGoogleMaps('browser-key')).rejects.toMatchObject({ code: 'authorization' });
    (window as Window & { gm_authFailure?: () => void }).gm_authFailure?.();
    await rejected;
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ code: 'authorization' }));
    expect(previous).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    await expect(loadGoogleMaps('browser-key')).rejects.toMatchObject({ code: 'authorization' });
    expect(importLibrary).toHaveBeenCalledOnce();
  });

  it('緯度経度の範囲を検証し、無効な値はGoogle Mapsリンクへ渡さない', async () => {
    const { hasCoordinates, placeUrl } = await import('@/components/pages/trip-planner/maps');
    expect(hasCoordinates({ id: 'zero', name: '赤道', address: '', lat: 0, lng: 0 })).toBe(true);
    const invalid = { id: 'invalid', name: '京都駅', address: '京都市', lat: 91, lng: 181 };
    expect(hasCoordinates(invalid)).toBe(false);
    expect(new URL(placeUrl(invalid)).searchParams.get('query')).toBe('京都駅 京都市');
  });
});
