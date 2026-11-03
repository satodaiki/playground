import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeWalkingRoutes } from '@/components/pages/trip-planner/routes';
import type { Place } from '@/components/pages/trip-planner/maps';

const stops: Place[] = [
  { id: 'a', name: '京都駅', address: '京都駅', lat: 34.9858, lng: 135.7588 },
  { id: 'b', name: '東寺', address: '京都 東寺', lat: 34.9806, lng: 135.7478 },
];
function api(computeRoutes: ReturnType<typeof vi.fn>) {
  return { computeRoutes } as unknown as typeof google.maps.routes.Route;
}

describe('徒歩経路の取得', () => {
  afterEach(() => vi.useRealTimers());

  it('必要なフィールドと徒歩指定で、住所と座標をGoogleの仕様どおりに渡す', async () => {
    const compute = vi.fn().mockResolvedValue({ routes: [{ legs: [{ durationMillis: 75001 }, { durationMillis: 0 }], warnings: ['歩道を確認'] }] });
    const result = await computeWalkingRoutes(api(compute), [stops[0], { id: 'middle', name: '休憩', address: '京都市 カフェ' }, stops[1]]);
    expect(compute).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      origin: { lat: stops[0].lat, lng: stops[0].lng }, destination: { lat: stops[1].lat, lng: stops[1].lng },
      intermediates: [{ location: '京都市 カフェ' }], travelMode: 'WALKING', fields: ['path', 'legs', 'warnings', 'viewport'],
    }));
    expect(result.minutes).toEqual([2, 0]);
    expect(result.warnings).toEqual(['歩道を確認']);
  });

  it('上限を超える旅程を接続点を重ねて分割し、全区間の時間を順番どおり返す', async () => {
    const many = Array.from({ length: 54 }, (_, index) => ({ id: String(index), name: `場所${index}`, address: `住所${index}` }));
    const compute = vi.fn(async (request: google.maps.routes.ComputeRoutesRequest) => ({ routes: [{
      legs: Array.from({ length: Array.from(request.intermediates || []).length + 1 }, () => ({ durationMillis: 60000 })),
      warnings: ['同じ注意'],
    }] }));
    const result = await computeWalkingRoutes(api(compute), many);
    expect(compute).toHaveBeenCalledTimes(3);
    expect(compute.mock.calls.map(([request]) => [request.origin, request.destination])).toEqual([
      ['住所0', '住所26'], ['住所26', '住所52'], ['住所52', '住所53'],
    ]);
    expect(result.minutes).toEqual(Array(53).fill(1));
    expect(result.warnings).toEqual(['同じ注意']);
  });

  it.each([
    { routes: [] }, { routes: [{ legs: [] }] }, { routes: [{ legs: [{}] }] },
    { routes: [{ legs: [{ durationMillis: -1 }] }] }, { routes: [{ legs: [{ durationMillis: NaN }] }] },
    { routes: [{ legs: [{ durationMillis: Infinity }] }] },
  ])('欠けた時間や不正な応答を0分と見なさない: %s', async (response) => {
    await expect(computeWalkingRoutes(api(vi.fn().mockResolvedValue(response)), stops)).rejects.toMatchObject({ code: 'no-route' });
  });

  it('旅程変更で古くなったリクエストの続きを取得しない', async () => {
    let current = true;
    let finish: (value: unknown) => void = () => {};
    const compute = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const many = Array.from({ length: 30 }, (_, index) => ({ id: String(index), name: String(index), address: String(index) }));
    const request = computeWalkingRoutes(api(compute), many, () => current);
    current = false;
    finish({ routes: [{ legs: Array.from({ length: 26 }, () => ({ durationMillis: 60000 })) }] });
    expect((await request).minutes).toEqual([]);
    expect(compute).toHaveBeenCalledOnce();
  });

  it('経路APIから応答がなくても期限内に終了する', async () => {
    vi.useFakeTimers();
    const request = computeWalkingRoutes(api(vi.fn(() => new Promise(() => {}))), stops);
    const rejected = expect(request).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(15000);
    await rejected;
  });
});
