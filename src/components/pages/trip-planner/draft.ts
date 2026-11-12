import type { Place, TravelMode } from './maps';
import { emptyPacking, isPackingDraft } from './packing';
import type { PackingDraft } from './packing';
import type { WeatherDay } from './weather';

export type Stop = Place & {
  duration: number;
  color: number;
  /** 何日目の予定か（未設定は1日目）。 */
  day?: number;
  /** メモ・予約情報（未設定は空）。 */
  memo?: string;
  /** 費用（円、未設定は不明）。 */
  cost?: number;
};

export type TripDraft = {
  id: string;
  title: string;
  /** 出発日（YYYY-MM-DD、未設定は空文字）。 */
  startDate: string;
  stops: Stop[];
  /** 1日目の出発時刻。 */
  departure: string;
  /** 2日目以降の出発時刻（キーは日数）。 */
  departures: Record<string, string>;
  /** 明示的に用意した日数（予定が無い日を含む）。 */
  days?: number;
  manualTravel: Record<string, number>;
  travelModes: Record<string, TravelMode>;
  isSample: boolean;
  packing: PackingDraft;
  weather?: WeatherDay[];
};

export const TRIP_DRAFT_KEY = 'trip-planner:draft:v1';
export const TRIPS_KEY = 'trip-planner:trips:v2';
export const MAX_STAY_MINUTES = 240;
export const MAX_TRAVEL_MINUTES = 240;

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function newTripId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `trip-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function emptyTrip(): TripDraft {
  return {
    id: newTripId(), title: '', startDate: '', stops: [], departure: '09:00', departures: {},
    manualTravel: {}, travelModes: {}, isSample: false, packing: emptyPacking(),
  };
}

export function stopDay(stop: Stop): number {
  return stop.day ?? 1;
}

export function tripDayCount(draft: Pick<TripDraft, 'stops' | 'days'>): number {
  const fromStops = draft.stops.reduce((max, stop) => Math.max(max, stopDay(stop)), 1);
  return Math.max(1, draft.days ?? 1, fromStops);
}

export function departureForDay(draft: Pick<TripDraft, 'departure' | 'departures'>, day: number): string {
  if (day <= 1) return draft.departure;
  return draft.departures[String(day)] ?? draft.departure;
}

/** 日付文字列に日数を足した YYYY-MM-DD を返す（不正な日付はそのまま返す）。 */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setDate(parsed.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

export function dateForDay(draft: Pick<TripDraft, 'startDate'>, day: number): string {
  return draft.startDate ? addDays(draft.startDate, day - 1) : '';
}

function isOpeningHours(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const hours = value as Place['openingHours'];
  if (!Array.isArray(hours?.periods)) return false;
  const point = (p: unknown) => {
    if (!p || typeof p !== 'object') return false;
    const pointValue = p as { day: number; hour: number; minute: number };
    return Number.isInteger(pointValue.day) && pointValue.day >= 0 && pointValue.day <= 6
      && Number.isInteger(pointValue.hour) && pointValue.hour >= 0 && pointValue.hour <= 23
      && Number.isInteger(pointValue.minute) && pointValue.minute >= 0 && pointValue.minute <= 59;
  };
  return hours.periods.every((period) => period && point(period.open) && (period.close === undefined || point(period.close)))
    && (hours.weekdayDescriptions === undefined
      || (Array.isArray(hours.weekdayDescriptions) && hours.weekdayDescriptions.every((line) => typeof line === 'string')));
}

export function isStop(value: unknown): value is Stop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as Stop;
  return typeof stop.id === 'string' && typeof stop.name === 'string' && typeof stop.address === 'string'
    && Number.isInteger(stop.duration) && stop.duration >= 15 && stop.duration <= MAX_STAY_MINUTES && stop.duration % 15 === 0
    && Number.isInteger(stop.color) && stop.color >= 0 && stop.color < 5
    && (stop.lat === undefined || (Number.isFinite(stop.lat) && Math.abs(stop.lat) <= 90))
    && (stop.lng === undefined || (Number.isFinite(stop.lng) && Math.abs(stop.lng) <= 180))
    && (stop.day === undefined || (Number.isInteger(stop.day) && stop.day >= 1 && stop.day <= 31))
    && (stop.memo === undefined || (typeof stop.memo === 'string' && stop.memo.length <= 1000))
    && (stop.cost === undefined || (Number.isInteger(stop.cost) && stop.cost >= 0 && stop.cost <= 100_000_000))
    && isOpeningHours(stop.openingHours);
}

function isMinutesRecord(value: unknown): value is Record<string, number> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(
      (minutes) => Number.isInteger(minutes) && (minutes as number) >= 0 && (minutes as number) <= MAX_TRAVEL_MINUTES,
    );
}

function isTimeRecord(value: unknown): value is Record<string, string> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((time) => typeof time === 'string' && TIME_PATTERN.test(time));
}

function isTravelModes(value: unknown): value is Record<string, TravelMode> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((mode) => mode === 'WALKING' || mode === 'TRANSIT' || mode === 'DRIVING');
}

function isWeatherDays(value: unknown): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every((day) => day && typeof day === 'object'
    && typeof (day as WeatherDay).date === 'string'
    && Number.isFinite((day as WeatherDay).maxTemp) && Number.isFinite((day as WeatherDay).minTemp)
    && Number.isFinite((day as WeatherDay).precipitationProbability)
    && Number.isInteger((day as WeatherDay).weatherCode));
}

/**
 * 保存済みデータ（旧形式を含む）を現行の TripDraft に正規化する。
 * 旧形式: departure のみで、title/startDate/departures/travelModes を持たない。
 * 解釈できない場合は null。
 */
export function normalizeTripDraft(value: unknown): TripDraft | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<TripDraft> & { departure?: string };
  if (!Array.isArray(raw.stops) || !raw.stops.every(isStop)) return null;
  if (new Set(raw.stops.map((stop) => stop.id)).size !== raw.stops.length) return null;
  if (typeof raw.departure !== 'string' || !TIME_PATTERN.test(raw.departure)) return null;
  if (!isMinutesRecord(raw.manualTravel)) return null;
  if (typeof raw.isSample !== 'boolean' || !isPackingDraft(raw.packing)) return null;
  if (raw.title !== undefined && typeof raw.title !== 'string') return null;
  if (raw.startDate !== undefined && !(typeof raw.startDate === 'string' && (raw.startDate === '' || DATE_PATTERN.test(raw.startDate)))) return null;
  if (raw.departures !== undefined && !isTimeRecord(raw.departures)) return null;
  if (raw.travelModes !== undefined && !isTravelModes(raw.travelModes)) return null;
  if (raw.days !== undefined && !(Number.isInteger(raw.days) && (raw.days as number) >= 1 && (raw.days as number) <= 31)) return null;
  if (!isWeatherDays(raw.weather)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newTripId(),
    title: raw.title ?? '',
    startDate: raw.startDate ?? '',
    stops: raw.stops,
    departure: raw.departure,
    departures: raw.departures ?? {},
    ...(raw.days !== undefined ? { days: raw.days } : {}),
    manualTravel: raw.manualTravel,
    travelModes: raw.travelModes ?? {},
    isSample: raw.isSample,
    packing: raw.packing,
    ...(raw.weather !== undefined ? { weather: raw.weather } : {}),
  };
}

export function loadTripDraft(): TripDraft {
  try {
    const draft = normalizeTripDraft(JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY) || 'null'));
    if (draft) return draft;
  } catch { /* A missing or unreadable draft starts a new trip. */ }
  return emptyTrip();
}

export function saveTripDraft(draft: TripDraft): boolean {
  try {
    localStorage.setItem(TRIP_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** 保存済みの旅の一覧を読む。アクティブな旅は TRIP_DRAFT_KEY 側が正。 */
export function loadTrips(active: TripDraft): TripDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TRIPS_KEY) || 'null') as unknown;
    if (Array.isArray(parsed)) {
      const trips = parsed
        .map((item) => normalizeTripDraft(item))
        .filter((item): item is TripDraft => item !== null);
      const others = trips.filter((trip) => trip.id !== active.id);
      return [active, ...others];
    }
  } catch { /* fall through */ }
  return [active];
}

export function saveTrips(trips: TripDraft[]): boolean {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
    return true;
  } catch {
    return false;
  }
}

export function tripLabel(draft: TripDraft): string {
  if (draft.title.trim()) return draft.title.trim();
  if (draft.isSample) return 'サンプル：金沢';
  const first = draft.stops[0]?.name;
  return first ? `${first} の旅` : '無題の旅';
}
