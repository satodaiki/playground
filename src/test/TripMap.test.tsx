import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripMap from '@/components/pages/trip-planner/TripMap';
import { loadGoogleMaps, walkingUrl } from '@/components/pages/trip-planner/maps';
import type { GoogleMaps, Place } from '@/components/pages/trip-planner/maps';

vi.mock('@/components/pages/trip-planner/maps', async (original) => ({
  ...await original<typeof import('@/components/pages/trip-planner/maps')>(),
  loadGoogleMaps: vi.fn(),
}));

const places: Place[] = [
  { id: 'a', name: '近江町市場', address: '石川県金沢市', lat: 36.5712, lng: 136.6568 },
  { id: 'b', name: 'ひがし茶屋街', address: '石川県金沢市', lat: 36.5726, lng: 136.6665 },
];

function mockSdk(computeRoutes = vi.fn().mockResolvedValue({ routes: [{ legs: [{ durationMillis: 75000 }], warnings: ['歩道を確認してください'], createPolylines: () => [{ setMap: vi.fn() }] }] })) {
  const sdk = {
    importLibrary: vi.fn().mockResolvedValue({}),
    Map: class { fitBounds = vi.fn(); panTo = vi.fn(); },
    LatLngBounds: class { extend = vi.fn(); },
    marker: { AdvancedMarkerElement: class { map = null; } },
    places: { PlaceAutocompleteElement: class { constructor() { return document.createElement('div'); } } },
    routes: { Route: { computeRoutes } },
  } as unknown as GoogleMaps;
  vi.mocked(loadGoogleMaps).mockResolvedValue(sdk);
  return computeRoutes;
}

describe('TripMap', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    vi.mocked(loadGoogleMaps).mockReset();
  });

  it('未接続では経路未取得と示し、座標のない場所にも実用的な外部リンクを作る', () => {
    const unlocated: Place = { id: 'new', name: '東京駅', address: '東京駅' };
    const onRoute = vi.fn();
    render(<TripMap stops={[...places, unlocated]} selectedId="a" onAdd={vi.fn()} onSelect={vi.fn()} onRoute={onRoute} />);
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
    const props = { stops: places, selectedId: 'a', onAdd: vi.fn(), onSelect: vi.fn(), onRoute };
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
    const props = { stops: places, selectedId: 'a', onAdd: vi.fn(), onSelect: vi.fn(), onRoute };
    const { rerender } = render(<TripMap {...props} />);
    await waitFor(() => expect(computeRoutes).toHaveBeenCalledTimes(1));
    rerender(<TripMap {...props} stops={[...places].reverse()} />);
    await waitFor(() => expect(onRoute).toHaveBeenLastCalledWith([3]));
    await act(async () => { resolveOld({ routes: [{ legs: [{ durationMillis: 600000 }], createPolylines: () => [] }] }); });
    expect(onRoute).toHaveBeenLastCalledWith([3]);
  });

  it('欠けた移動時間を0分として扱わず、未計算に戻す', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    mockSdk(vi.fn().mockResolvedValue({ routes: [{ legs: [{}], createPolylines: () => [] }] }));
    const onRoute = vi.fn();
    render(<TripMap stops={places} selectedId="a" onAdd={vi.fn()} onSelect={vi.fn()} onRoute={onRoute} />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('移動時間は未計算'));
    expect(onRoute).toHaveBeenLastCalledWith(null);
    expect(onRoute).not.toHaveBeenCalledWith([0]);
  });
});
