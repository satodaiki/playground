import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TripPlanner from '@/components/pages/TripPlanner';
import { TRIP_DRAFT_KEY } from '@/components/pages/trip-planner/draft';
import { loadGoogleMaps } from '@/components/pages/trip-planner/maps';
import type { GoogleMaps } from '@/components/pages/trip-planner/maps';

vi.mock('@/components/pages/trip-planner/TripMap', () => ({ default: () => <div>地図</div> }));
vi.mock('@/components/pages/trip-planner/maps', async (original) => ({
  ...await original<typeof import('@/components/pages/trip-planner/maps')>(),
  loadGoogleMaps: vi.fn(),
}));

function mockSdk() {
  const importLibrary = vi.fn().mockResolvedValue({});
  vi.mocked(loadGoogleMaps).mockResolvedValue({
    importLibrary,
    places: { PlaceAutocompleteElement: class { constructor() { return document.createElement('input'); } } },
  } as unknown as GoogleMaps);
  return importLibrary;
}

function prediction(overrides = {}) {
  return {
    id: 'google-kyoto', displayName: '京都駅', formattedAddress: '京都府京都市下京区東塩小路釜殿町',
    location: { lat: () => 34.9858, lng: () => 135.7588 },
    fetchFields: vi.fn().mockResolvedValue({}), ...overrides,
  };
}

function select(widget: HTMLElement, place: ReturnType<typeof prediction>) {
  fireEvent(widget, Object.assign(new Event('gmp-select'), { placePrediction: { toPlace: () => place } }));
}

async function searchInput() {
  await screen.findByText('Google Mapsの候補を選ぶと、住所・位置情報付きで旅程に追加します。');
  return screen.getByLabelText('最初に行きたい場所は？');
}

describe('Google Placesの候補検索', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    vi.mocked(loadGoogleMaps).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('旅程の入力欄で候補を選び、住所と座標を保存して次の検索へ進める', async () => {
    const importLibrary = mockSdk();
    render(<TripPlanner />);
    const input = await searchInput();
    expect(importLibrary).toHaveBeenCalledExactlyOnceWith('places');
    const place = prediction();
    select(input, place);

    await screen.findByRole('button', { name: '京都駅、滞在45分' });
    expect(place.fetchFields).toHaveBeenCalledWith({ fields: ['displayName', 'formattedAddress', 'location'] });
    await waitFor(() => expect(JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!).stops).toEqual([
      { id: 'google-kyoto', name: '京都駅', address: place.formattedAddress, lat: 34.9858, lng: 135.7588, duration: 45, color: 0 },
    ]));
    expect(new URL(screen.getByRole('link', { name: 'Google Mapsで見る' }).getAttribute('href')!).searchParams.get('query')).toBe('34.9858,135.7588');
    expect(screen.getByLabelText('次に行きたい場所は？')).toHaveValue('');
    expect(screen.getByLabelText('次に行きたい場所は？')).toHaveFocus();
  });

  it('キー未設定では検索を呼ばず、履歴・入力例の候補を出さずに手入力できる', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    localStorage.setItem('trip-planner:recent-places:v1', JSON.stringify(['京都駅']));
    const user = userEvent.setup();
    render(<TripPlanner />);
    expect(loadGoogleMaps).not.toHaveBeenCalled();
    expect(screen.getByText(/候補検索は未接続/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '場所の入力候補' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '姫路城{Enter}');
    expect(screen.getByRole('button', { name: '姫路城、滞在45分' })).toBeInTheDocument();
  });

  it('検索の認証・通信エラー時は、入力文字を保って手入力に切り替える', async () => {
    mockSdk();
    const user = userEvent.setup();
    render(<TripPlanner />);
    const input = await searchInput();
    fireEvent.input(input, { target: { value: '京都駅' } });
    fireEvent(input, new Event('gmp-error'));
    expect(screen.getByText(/候補検索を利用できません/)).toBeInTheDocument();
    expect(screen.getByLabelText('最初に行きたい場所は？')).toHaveValue('京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    expect(screen.getByRole('button', { name: '京都駅、滞在45分' })).toBeInTheDocument();
  });

  it('SDKを読み込めなくても手入力で続けられる', async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValue(new Error('Network error'));
    render(<TripPlanner />);
    await screen.findByText(/候補検索を利用できません/);
    expect(screen.getByLabelText('最初に行きたい場所は？')).toBeEnabled();
  });

  it.each([
    { location: undefined },
    { location: { lat: () => NaN, lng: () => 135 } },
    { location: { lat: () => 91, lng: () => 135 } },
    { id: '' },
    { fetchFields: async () => { throw new Error('Details unavailable'); } },
  ])('詳細取得の失敗や無効な地点を旅程に追加せず再検索できる: %s', async (overrides) => {
    mockSdk();
    render(<TripPlanner />);
    const input = await searchInput();
    select(input, prediction(overrides));
    await screen.findByText(/場所を取得できませんでした/);
    expect(JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!).stops).toEqual([]);
    select(input, prediction());
    await screen.findByRole('button', { name: '京都駅、滞在45分' });
  });

  it('後から選んだ候補を優先し、古い詳細取得で別の場所を追加しない', async () => {
    mockSdk();
    let resolveOld: () => void = () => {};
    const old = prediction({ fetchFields: vi.fn(() => new Promise<void>((resolve) => { resolveOld = resolve; })) });
    render(<TripPlanner />);
    const input = await searchInput();
    select(input, old);
    select(input, prediction({ id: 'tokyo', displayName: '東京駅' }));
    await screen.findByRole('button', { name: '東京駅、滞在45分' });
    await act(async () => resolveOld());
    expect(screen.queryByRole('button', { name: '京都駅、滞在45分' })).not.toBeInTheDocument();
  });

  it('検索中に新しい旅程へ切り替えても、古い候補の取得結果を追加しない', async () => {
    mockSdk();
    let resolveOld: () => void = () => {};
    const old = prediction({ fetchFields: vi.fn(() => new Promise<void>((resolve) => { resolveOld = resolve; })) });
    const user = userEvent.setup();
    render(<TripPlanner />);
    const input = await searchInput();
    fireEvent.input(input, { target: { value: '京都' } });
    select(input, old);
    await user.click(screen.getByRole('button', { name: '新しい旅程を作る' }));
    await user.click(screen.getByRole('button', { name: '空の旅程に切り替える' }));
    await act(async () => resolveOld());
    expect(JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!).stops).toEqual([]);
    expect(screen.getByLabelText('最初に行きたい場所は？')).toHaveValue('');
  });
});
