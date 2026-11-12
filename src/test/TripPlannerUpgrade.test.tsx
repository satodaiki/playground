import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import TripPlanner from '@/components/pages/TripPlanner';
import { TRIP_DRAFT_KEY, emptyTrip, loadTripDraft, normalizeTripDraft, saveTripDraft } from '@/components/pages/trip-planner/draft';
import { decodeTrip, encodeTrip } from '@/components/pages/trip-planner/share';
import { buildIcs } from '@/components/pages/trip-planner/ics';
import { computeTripRoutes } from '@/components/pages/trip-planner/routes';
import { openingHoursWarning } from '@/components/pages/trip-planner/maps';
import { fetchWeather, weatherSuggestions } from '@/components/pages/trip-planner/weather';
import { suggestPacking } from '@/components/pages/trip-planner/packing';
import { emptyPacking } from '@/components/pages/trip-planner/packing';

vi.mock('@/components/pages/trip-planner/TripMap', () => ({
  default: () => <div>地図</div>,
}));

describe('ドラフトの移行と共有', () => {
  it('旧形式（v1）の保存データを現行形式へ移行して読み込む', () => {
    localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify({
      stops: [{ id: 'a', name: '京都駅', address: '京都駅', duration: 45, color: 0 }],
      departure: '08:30', manualTravel: {}, isSample: false,
      packing: { destination: '', purpose: '', activities: [], generatedFor: null, items: [] },
    }));
    const draft = loadTripDraft();
    expect(draft.stops).toHaveLength(1);
    expect(draft.departure).toBe('08:30');
    expect(draft.title).toBe('');
    expect(draft.startDate).toBe('');
    expect(draft.travelModes).toEqual({});
  });

  it('共有エンコードは往復でき、復元時に新しいIDが振られる', () => {
    const draft = { ...emptyTrip(), title: '金沢旅行', startDate: '2026-04-10' };
    draft.stops = [{ id: 'x', name: '兼六園', address: '金沢市', duration: 60, color: 1, day: 2, memo: '予約済み', cost: 500 }];
    const restored = decodeTrip(encodeTrip(draft));
    expect(restored?.title).toBe('金沢旅行');
    expect(restored?.id).not.toBe(draft.id);
    expect(restored?.stops[0]).toMatchObject({ day: 2, memo: '予約済み', cost: 500 });
    expect(decodeTrip('not-a-trip')).toBeNull();
    expect(normalizeTripDraft({ stops: [{}] })).toBeNull();
  });
});

describe('移動手段つき経路', () => {
  it('電車は区間ごとにTRANSITで取得し、徒歩と混ざっても順番どおりに返す', async () => {
    const compute = vi.fn(async (request: { travelMode: string }) => ({
      routes: [{ legs: [{ durationMillis: request.travelMode === 'TRANSIT' ? 1_200_000 : 600_000 }], warnings: [] }],
    }));
    const api = { computeRoutes: compute } as unknown as typeof google.maps.routes.Route;
    const a = { id: 'a', name: 'A', address: 'A' };
    const b = { id: 'b', name: 'B', address: 'B' };
    const c = { id: 'c', name: 'C', address: 'C' };
    const result = await computeTripRoutes(api, [
      { from: a, to: b, mode: 'TRANSIT' },
      { from: b, to: c, mode: 'WALKING' },
    ]);
    expect(result.minutes).toEqual([20, 10]);
    expect(compute.mock.calls.map(([request]) => (request as { travelMode: string }).travelMode)).toEqual(['TRANSIT', 'WALKING']);
  });
});

describe('ICS書き出し', () => {
  it('日付と時刻を持つイベントを生成する', () => {
    const ics = buildIcs([{ uid: 'u1', title: '兼六園, 入園', date: '2026-04-10', startMinutes: 570, endMinutes: 630, location: '金沢市' }]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260410T093000');
    expect(ics).toContain('DTEND:20260410T103000');
    expect(ics).toContain('SUMMARY:兼六園\\, 入園');
  });
});

describe('営業時間チェック', () => {
  const hours = { periods: [{ open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 17, minute: 0 } }] };
  it('営業時間内は警告なし、時間外と休業日は警告する', () => {
    // 2026-04-10 は金曜日
    expect(openingHoursWarning(hours, '2026-04-10', 600, 60)).toBeNull();
    expect(openingHoursWarning(hours, '2026-04-10', 1020, 60)).toMatch(/営業時間外/);
    expect(openingHoursWarning(hours, '2026-04-11', 600, 60)).toMatch(/休業日/);
    expect(openingHoursWarning(undefined, '2026-04-10', 600, 60)).toBeNull();
    expect(openingHoursWarning(hours, '', 600, 60)).toBeNull();
  });
});

describe('天気連動', () => {
  it('予報を取得し、雨・寒さから持ち物候補を作って提案に混ぜられる', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        daily: {
          time: ['2026-04-10'], weather_code: [61], temperature_2m_max: [12], temperature_2m_min: [3],
          precipitation_probability_max: [80],
        },
      }),
    })) as unknown as typeof fetch;
    const days = await fetchWeather(35, 135, '2026-04-10', 1, fetcher);
    expect(days).toHaveLength(1);
    const suggestions = weatherSuggestions(days);
    expect(suggestions.map((item) => item.id)).toContain('rain');
    expect(suggestions.map((item) => item.id)).toContain('warm');
    const packing = suggestPacking({ ...emptyPacking(), destination: '京都' }, suggestions);
    expect(packing.items.some((item) => item.id === 'rain' && /降水確率80%/.test(item.reason))).toBe(true);
  });
});

describe('アップグレードUI', () => {
  it('日を追加して2日目に場所を置き、メモと費用を保存できる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    await user.click(screen.getByRole('button', { name: '日を追加' }));
    await user.click(screen.getByRole('button', { name: '2日目に追加' }));
    await user.type(screen.getByLabelText('次に行きたい場所は？'), '清水寺');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));

    expect(screen.getByRole('heading', { name: /2日目/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清水寺、滞在45分' }));
    fireEvent.change(screen.getByLabelText('メモ・予約情報'), { target: { value: '9時の回を予約済み' } });
    fireEvent.change(screen.getByLabelText('費用（円）'), { target: { value: '1200' } });

    const saved = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    const shimizu = saved.stops.find((stop: { name: string }) => stop.name === '清水寺');
    expect(shimizu.day).toBe(2);
    expect(shimizu.memo).toBe('9時の回を予約済み');
    expect(shimizu.cost).toBe(1200);
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('¥1,200');
  });

  it('出発日を設定でき、ICSボタンが有効になる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.type(screen.getByLabelText('最初に行きたい場所は？'), '京都駅');
    await user.click(screen.getByRole('button', { name: '場所を追加' }));
    const icsButton = screen.getByRole('button', { name: /カレンダー（\.ics）/ });
    expect(icsButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('出発日'), { target: { value: '2026-04-10' } });
    expect(icsButton).not.toBeDisabled();
    const saved = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    expect(saved.startDate).toBe('2026-04-10');
  });

  it('移動手段を電車に切り替えて保存できる', async () => {
    const user = userEvent.setup();
    render(<TripPlanner />);
    await user.click(screen.getByRole('button', { name: '金沢のサンプルを見る' }));
    await user.click(screen.getByRole('button', { name: '近江町市場からひがし茶屋街への移動時間を追加' }));
    await user.click(screen.getByRole('button', { name: '電車' }));
    const saved = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY)!);
    expect(Object.values(saved.travelModes)).toContain('TRANSIT');
    expect(saveTripDraft).toBeDefined();
  });
});
