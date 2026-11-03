import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TripMap from '@/components/pages/trip-planner/TripMap';
import { loadGoogleMaps, walkingUrl } from '@/components/pages/trip-planner/maps';
import type { Place } from '@/components/pages/trip-planner/maps';
import { createGoogleMapsMock } from './googleMapsMock';

vi.mock('@/components/pages/trip-planner/maps', async (original) => ({
  ...await original<typeof import('@/components/pages/trip-planner/maps')>(),
  loadGoogleMaps: vi.fn(),
}));

const places: Place[] = [
  { id: 'a', name: '近江町市場', address: '石川県金沢市', lat: 36.5712, lng: 136.6568 },
  { id: 'b', name: 'ひがし茶屋街', address: '石川県金沢市', lat: 36.5726, lng: 136.6665 },
];

function mockSdk(computeRoutes = createGoogleMapsMock().computeRoutes) {
  const fixture = createGoogleMapsMock();
  fixture.libraries.routes.Route.computeRoutes = computeRoutes;
  vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
  return computeRoutes;
}

describe('TripMap', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    vi.mocked(loadGoogleMaps).mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('未接続では経路未取得と示し、座標のない場所にも実用的な外部リンクを作る', () => {
    const unlocated: Place = { id: 'new', name: '東京駅', address: '東京駅' };
    const onRoute = vi.fn();
    render(<TripMap stops={[...places, unlocated]} selectedId="a" onSelect={vi.fn()} onRoute={onRoute} />);
    expect(screen.getByText('地点の位置関係（経路未取得）')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '3. 東京駅 ↗' })).toHaveAttribute('href', expect.stringContaining('maps/search/'));
    const url = new URL(walkingUrl(places[0], unlocated));
    expect(url.searchParams.get('destination')).toBe('東京駅');
    expect(url.searchParams.get('travelmode')).toBe('walking');
    expect(loadGoogleMaps).not.toHaveBeenCalled();
    expect(onRoute).not.toHaveBeenCalled();
    expect(document.querySelector('svg')).not.toHaveTextContent('東京駅');
  });

  it('徒歩時間を分単位で返し、同じ行き先の再レンダーでは経路を再取得しない', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const computeRoutes = mockSdk();
    const onRoute = vi.fn();
    const props = { stops: places, selectedId: 'a', onSelect: vi.fn(), onRoute };
    const { rerender } = render(<TripMap {...props} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([2]));
    expect(screen.getByText('歩道を確認してください')).toBeInTheDocument();
    rerender(<TripMap {...props} stops={places.map((place) => ({ ...place }))} />);
    expect(computeRoutes).toHaveBeenCalledTimes(1);
    expect(computeRoutes).toHaveBeenCalledWith(expect.objectContaining({ travelMode: 'WALKING' }));
  });

  it('古い経路計算が後から完了しても、新しい順番の移動時間を上書きしない', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    let resolveOld: (value: unknown) => void = () => {};
    const computeRoutes = mockSdk(vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ routes: [{ legs: [{ durationMillis: 180000 }], createPolylines: () => [] }] }));
    const onRoute = vi.fn();
    const props = { stops: places, selectedId: 'a', onSelect: vi.fn(), onRoute };
    const { rerender } = render(<TripMap {...props} />);
    await waitFor(() => expect(computeRoutes).toHaveBeenCalledTimes(1));
    rerender(<TripMap {...props} stops={[...places].reverse()} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([3]));
    await act(async () => { resolveOld({ routes: [{ legs: [{ durationMillis: 600000 }], createPolylines: () => [] }] }); });
    expect(onRoute).toHaveBeenLastCalledWith([3]);
  });

  it('座標のある場所のリネームでは経路と取得済みの移動時間を保ち、地図のリンクを更新する', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const computeRoutes = mockSdk();
    const onRoute = vi.fn();
    const props = { stops: places, selectedId: 'a', onSelect: vi.fn(), onRoute };
    const { rerender } = render(<TripMap {...props} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([2]));
    const href = screen.getByRole('link', { name: '1. 近江町市場 ↗' }).getAttribute('href');
    const calls = onRoute.mock.calls.length;

    rerender(<TripMap {...props} stops={places.map((place, index) => index === 0 ? { ...place, name: '朝ごはん' } : place)} />);
    expect(screen.getByRole('link', { name: '1. 朝ごはん ↗' })).toHaveAttribute('href', href);
    expect(computeRoutes).toHaveBeenCalledTimes(1);
    expect(onRoute).toHaveBeenCalledTimes(calls);
  });

  it('名前だけで追加した場所の訂正は、新しい検索先で経路を取得し直す', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const computeRoutes = mockSdk();
    const stops: Place[] = [{ id: 'a', name: '京と駅', address: '京と駅' }, places[1]];
    const props = { stops, selectedId: 'a', onSelect: vi.fn(), onRoute: vi.fn() };
    const { rerender } = render(<TripMap {...props} />);
    await waitFor(() => expect(props.onRoute).toHaveBeenLastCalledWith([2]));

    rerender(<TripMap {...props} stops={[{ ...stops[0], name: '京都駅', address: '京都駅' }, stops[1]]} />);
    await waitFor(() => expect(computeRoutes).toHaveBeenCalledTimes(2));
    expect(computeRoutes).toHaveBeenLastCalledWith(expect.objectContaining({ origin: '京都駅' }));
  });

  it('欠けた移動時間を0分として扱わず、未計算に戻す', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    mockSdk(vi.fn().mockResolvedValue({ routes: [{ legs: [{}], createPolylines: () => [] }] }));
    const onRoute = vi.fn();
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={onRoute} />);
    await waitFor(() => expect(screen.getByRole('status', { name: '徒歩経路の状態' })).toHaveTextContent('移動時間は未計算'));
    expect(onRoute).toHaveBeenLastCalledWith(null);
    expect(onRoute).not.toHaveBeenCalledWith([0]);
  });

  it('経路ライブラリが使えなくても地図とピンを表示し、経路だけを再取得できる', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fixture = createGoogleMapsMock();
    fixture.errors.routes = new Error('Routes API disabled');
    vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
    const onRoute = vi.fn();
    const user = userEvent.setup();
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={onRoute} />);
    await screen.findByText(/徒歩経路を取得できませんでした/);
    expect(screen.getByRole('region', { name: 'Google Mapsの地図' })).toBeVisible();
    expect(fixture.markers).toHaveLength(2);
    expect(onRoute).toHaveBeenLastCalledWith(null);
    delete fixture.errors.routes;
    await user.click(screen.getByRole('button', { name: '徒歩経路を再取得' }));
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([2]));
    expect(fixture.MapConstructor).toHaveBeenCalledTimes(1);
  });

  it('ピンのライブラリが失敗しても、地図と徒歩経路は利用できる', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fixture = createGoogleMapsMock();
    fixture.errors.marker = new Error('Marker unavailable');
    vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
    const onRoute = vi.fn();
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={onRoute} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([2]));
    expect(screen.getByRole('region', { name: 'Google Mapsの地図' })).toBeVisible();
    expect(screen.getByText(/場所のピンを表示できませんでした/)).toBeInTheDocument();
    expect(fixture.setMap).toHaveBeenCalledWith(fixture.instances[0]);
  });

  it('一時的なSDKの読み込み失敗を再試行して復旧できる', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fixture = createGoogleMapsMock();
    vi.mocked(loadGoogleMaps).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(fixture.sdk);
    const user = userEvent.setup();
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={vi.fn()} />);
    await screen.findByText(/地図を読み込めませんでした/);
    await user.click(screen.getByRole('button', { name: '地図を再読み込み' }));
    await waitFor(() => expect(screen.getByRole('status', { name: '地図の状態' })).toHaveTextContent('地図を表示しています'));
    expect(screen.getByRole('region', { name: 'Google Mapsの地図' })).toBeVisible();
  });

  it('タイルが読み込まれない場合は、いつまでも空白にせず再試行を案内する', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fixture = createGoogleMapsMock({ autoTiles: false });
    vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={vi.fn()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByRole('status', { name: '地図の状態' })).toHaveTextContent('読み込みに時間がかかっています');
    expect(screen.getByRole('button', { name: '地図を再読み込み' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Google Mapsの地図' })).not.toBeInTheDocument();
  });

  it('同期的な経路APIの例外でも画面を壊さず、地図を残す', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    mockSdk(vi.fn(() => { throw new Error('Invalid request'); }));
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={vi.fn()} />);
    await screen.findByText(/徒歩経路を取得できませんでした/);
    expect(screen.getByRole('region', { name: 'Google Mapsの地図' })).toBeVisible();
  });

  it('旅程に合わせて地図を中央表示し、ピンと旅程の選択を同期する', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'owned-map-id');
    const fixture = createGoogleMapsMock();
    vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
    const onSelect = vi.fn();
    const stops = [{ ...places[0], name: '京都駅', lat: 34.9858, lng: 135.7588 }];
    const { rerender, unmount } = render(<TripMap stops={stops} selectedId={null} onSelect={onSelect} onRoute={vi.fn()} />);
    await waitFor(() => expect(fixture.markers).toHaveLength(1));
    expect(fixture.MapConstructor).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      center: { lat: 34.9858, lng: 135.7588 }, zoom: 14, mapId: 'owned-map-id',
    }));
    act(() => { fixture.markers[0].dispatchEvent(new Event('gmp-click')); });
    expect(onSelect).toHaveBeenCalledWith(stops[0].id);
    rerender(<TripMap stops={stops} selectedId={stops[0].id} onSelect={onSelect} onRoute={vi.fn()} />);
    expect(fixture.markers[0]).toHaveAttribute('aria-pressed', 'true');
    expect(fixture.instances[0].panTo).toHaveBeenCalledWith(stops[0]);
    unmount();
    expect(fixture.markers[0].map).toBeNull();
    expect(fixture.sdk.event.clearInstanceListeners).toHaveBeenCalled();
  });

  it('名前だけの場所でも、取得した経路の表示範囲に地図を合わせる', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const fixture = createGoogleMapsMock();
    const bounds = new fixture.Bounds().extend({ lat: 35, lng: 135 });
    fixture.computeRoutes.mockResolvedValue({ routes: [{ legs: [{ durationMillis: 60000 }], viewport: bounds, createPolylines: fixture.createPolylines }] });
    vi.mocked(loadGoogleMaps).mockResolvedValue(fixture.sdk);
    const user = userEvent.setup();
    const stops = [{ id: 'kyoto', name: '京都駅', address: '京都駅' }, { id: 'temple', name: '東寺', address: '東寺 京都' }];
    const onRoute = vi.fn();
    render(<TripMap stops={stops} selectedId={null} onSelect={vi.fn()} onRoute={onRoute} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([1]));
    expect(fixture.instances[0].fitBounds).toHaveBeenCalledWith(expect.objectContaining({ points: [{ lat: 35, lng: 135 }] }), 48);
    expect(screen.getByText(/2地点に位置情報がありません/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '旅程全体を表示' }));
    expect(fixture.instances[0].fitBounds).toHaveBeenCalledTimes(2);
  });

  it('SDK読込後に認証エラーが届いても、地図表示済みと案内し続けない', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    mockSdk();
    const onRoute = vi.fn();
    render(<TripMap stops={places} selectedId="a" onSelect={vi.fn()} onRoute={onRoute} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([2]));
    act(() => { (window as Window & { gm_authFailure?: () => void }).gm_authFailure?.(); });
    expect(screen.getByRole('status', { name: '地図の状態' })).toHaveTextContent('Google Mapsに接続できません');
    expect(screen.getByRole('button', { name: 'ページを再読み込み' })).toBeInTheDocument();
    expect(onRoute).toHaveBeenLastCalledWith(null);
  });
});
