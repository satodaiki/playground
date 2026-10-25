import type { Place } from './maps';
import { emptyPacking, isPackingDraft } from './packing';
import type { PackingDraft } from './packing';

export type Stop = Place & { duration: number; color: number };
export type TripDraft = {
  stops: Stop[];
  departure: string;
  manualTravel: Record<string, number>;
  isSample: boolean;
  packing: PackingDraft;
};

export const TRIP_DRAFT_KEY = 'trip-planner:draft:v1';

export function emptyTrip(): TripDraft {
  return { stops: [], departure: '09:00', manualTravel: {}, isSample: false, packing: emptyPacking() };
}

function isStop(value: unknown): value is Stop {
  if (!value || typeof value !== 'object') return false;
  const stop = value as Stop;
  return typeof stop.id === 'string' && typeof stop.name === 'string' && typeof stop.address === 'string'
    && Number.isInteger(stop.duration) && stop.duration >= 15 && stop.duration <= 240 && stop.duration % 15 === 0
    && Number.isInteger(stop.color) && stop.color >= 0 && stop.color < 5
    && (stop.lat === undefined || (Number.isFinite(stop.lat) && Math.abs(stop.lat) <= 90))
    && (stop.lng === undefined || (Number.isFinite(stop.lng) && Math.abs(stop.lng) <= 180));
}

export function loadTripDraft(): TripDraft {
  try {
    const draft = JSON.parse(localStorage.getItem(TRIP_DRAFT_KEY) || 'null') as TripDraft | null;
    if (draft && Array.isArray(draft.stops) && draft.stops.every(isStop)
      && new Set(draft.stops.map((stop) => stop.id)).size === draft.stops.length
      && typeof draft.departure === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.departure)
      && draft.manualTravel && typeof draft.manualTravel === 'object' && !Array.isArray(draft.manualTravel)
      && Object.values(draft.manualTravel).every((minutes) => Number.isInteger(minutes) && minutes >= 0 && minutes <= 240)
      && typeof draft.isSample === 'boolean' && isPackingDraft(draft.packing)) return draft;
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
