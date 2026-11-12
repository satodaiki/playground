import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Car, Clock3, CloudSun, Footprints, GripVertical, Link2, MapPin, Plus, Route, TrainFront, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'wouter';

import TripMap from './trip-planner/TripMap';
import PlaceSearch from './trip-planner/PlaceSearch';
import PackingChecklist from './trip-planner/PackingChecklist';
import TripBooklet from './trip-planner/TripBooklet';
import {
  dateForDay, departureForDay, emptyTrip, loadTripDraft, loadTrips, saveTripDraft, saveTrips,
  stopDay, tripDayCount, tripLabel,
} from './trip-planner/draft';
import type { Stop, TripDraft } from './trip-planner/draft';
import { hasCoordinates, openingHoursWarning, placeUrl, TRAVEL_MODES, travelModeLabel } from './trip-planner/maps';
import type { Place, TravelMode } from './trip-planner/maps';
import { suggestPacking } from './trip-planner/packing';
import { fetchWeather, weatherSuggestions, weatherSummaryLine } from './trip-planner/weather';
import type { WeatherDay } from './trip-planner/weather';
import { tripFromHash, tripShareUrl, parseTripJson } from './trip-planner/share';
import { buildIcs, downloadTextFile } from './trip-planner/ics';
import type { IcsEvent } from './trip-planner/ics';
import './TripPlanner.css';

const PIXELS_PER_MINUTE = 2;
const SAMPLE_ID = 'kanazawa-sample';
const SAMPLE: Stop[] = [
  { id: 'omicho', name: '近江町市場', address: '石川県金沢市上近江町50', lat: 36.5712, lng: 136.6568, duration: 45, color: 0 },
  { id: 'higashi', name: 'ひがし茶屋街', address: '石川県金沢市東山1丁目', lat: 36.5726, lng: 136.6665, duration: 60, color: 1 },
  { id: 'castle', name: '金沢城公園', address: '石川県金沢市丸の内1-1', lat: 36.5641, lng: 136.6594, duration: 45, color: 2 },
  { id: 'kenroku', name: '兼六園', address: '石川県金沢市兼六町1', lat: 36.561, lng: 136.6626, duration: 60, color: 3 },
  { id: 'daisetz', name: '鈴木大拙館', address: '石川県金沢市本多町3丁目4-20', lat: 36.5553, lng: 136.6604, duration: 45, color: 4 },
];

function timeLabel(minutes: number) {
  const days = Math.floor(minutes / 1440);
  const clock = `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return days ? `${clock}（${days}日後）` : clock;
}

function durationLabel(minutes: number) {
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}時間` : ''}${minutes % 60 || !minutes ? `${minutes % 60}分` : ''}`;
}

function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

function legKeyOf(from: Stop, to: Stop) {
  return JSON.stringify([from.id, to.id]);
}

function modeIcon(mode: TravelMode) {
  if (mode === 'TRANSIT') return TrainFront;
  if (mode === 'DRIVING') return Car;
  return Footprints;
}

type Leg = { from: Stop; to: Stop; key: string; mode: TravelMode; minutes: number | null };

export default function TripPlanner() {
  const [initial] = useState(() => {
    const shared = typeof window !== 'undefined' ? tripFromHash(window.location.hash) : null;
    const draft = shared ?? loadTripDraft();
    return { draft, shared: Boolean(shared) };
  });
  const [tripId, setTripId] = useState(initial.draft.id);
  const [title, setTitle] = useState(initial.draft.title);
  const [startDate, setStartDate] = useState(initial.draft.startDate);
  const [stops, setStops] = useState<Stop[]>(initial.draft.stops);
  const [selectedId, setSelectedId] = useState<string | null>(initial.draft.stops[0]?.id ?? null);
  const [durationDraft, setDurationDraft] = useState(String(initial.draft.stops[0]?.duration ?? 45));
  const [departure, setDeparture] = useState(initial.draft.departure);
  const [departures, setDepartures] = useState<Record<string, string>>(initial.draft.departures);
  const [daysExplicit, setDaysExplicit] = useState<number | undefined>(initial.draft.days);
  const [isSample, setIsSample] = useState(initial.draft.isSample);
  const [packing, setPacking] = useState(initial.draft.packing);
  const [weather, setWeather] = useState<WeatherDay[] | undefined>(initial.draft.weather);
  const [weatherStatus, setWeatherStatus] = useState('');
  const [pendingPlan, setPendingPlan] = useState<'new' | 'sample' | null>(null);
  const [planRevision, setPlanRevision] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const [travel, setTravel] = useState<number[] | null>(null);
  const [manualTravel, setManualTravel] = useState<Record<string, number>>(initial.draft.manualTravel);
  const [travelModes, setTravelModes] = useState<Record<string, TravelMode>>(initial.draft.travelModes);
  const [selectedLeg, setSelectedLeg] = useState<string | null>(null);
  const [travelDraft, setTravelDraft] = useState('15');
  const [selectedDay, setSelectedDay] = useState(1);
  const [trips, setTrips] = useState<TripDraft[]>(() => loadTrips(initial.draft));
  const [shareNotice, setShareNotice] = useState('');
  // shortcut: 削除の取り消しは直前の1件のみ。複数段階の取り消しが必要になったら履歴を持つ。
  const [removed, setRemoved] = useState<{ stop: Stop; index: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [bookletOpen, setBookletOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const resizing = useRef<{ id: string; x: number; duration: number } | null>(null);
  const placeInput = useRef<HTMLInputElement>(null);
  const timelineScroll = useRef<HTMLDivElement>(null);
  const bookletButton = useRef<HTMLButtonElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initial.shared) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [initial.shared]);

  const currentDraft = (): TripDraft => ({
    id: tripId, title, startDate, stops, departure, departures,
    ...(daysExplicit !== undefined ? { days: daysExplicit } : {}),
    manualTravel, travelModes, isSample, packing,
    ...(weather !== undefined ? { weather } : {}),
  });

  useEffect(() => {
    const draft = currentDraft();
    const saved = saveTripDraft(draft);
    const stored = loadTrips(draft);
    saveTrips(stored);
    // Storage availability is an external browser state; report a failed write without interrupting editing.
    const update = window.setTimeout(() => setSaveFailed(!saved), 0);
    return () => window.clearTimeout(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, title, startDate, stops, departure, departures, daysExplicit, manualTravel, travelModes, isSample, packing, weather]);

  const selected = stops.find((stop) => stop.id === selectedId);
  const selectedIndex = stops.findIndex((stop) => stop.id === selectedId);
  const dayCount = tripDayCount({ stops, days: daysExplicit });
  const daysList = Array.from({ length: dayCount }, (_, index) => index + 1);
  const start = toMinutes(departure);
  const stayMinutes = stops.reduce((sum, stop) => sum + stop.duration, 0);
  const totalCost = stops.reduce((sum, stop) => sum + (stop.cost ?? 0), 0);
  const hasCost = stops.some((stop) => stop.cost !== undefined);
  const totalLegs = stops.slice(0, -1).filter((from, index) => stopDay(from) === stopDay(stops[index + 1])).length;
  const legs: Leg[] = [];
  stops.slice(0, -1).forEach((from, index) => {
    const to = stops[index + 1];
    if (stopDay(from) !== stopDay(to)) return;
    const key = legKeyOf(from, to);
    const automatic = travel?.length === totalLegs ? travel[legs.length] : null;
    legs.push({ from, to, key, mode: travelModes[key] ?? 'WALKING', minutes: manualTravel[key] ?? automatic });
  });
  const missingTravel = legs.filter((leg) => leg.minutes === null).length;
  const hasTravel = missingTravel === 0;
  const hasKnownTravel = legs.some((leg) => leg.minutes !== null);
  const travelMinutes = legs.reduce((sum, leg) => sum + (leg.minutes ?? 0), 0);
  const activeLeg = legs.find((leg) => leg.key === selectedLeg);
  const allWalking = legs.every((leg) => leg.mode === 'WALKING');

  // 日ごとのタイムライン（到着・出発はその日の出発時刻から数える）
  const dayTimelines = daysList.map((day) => {
    const dayStops = stops.filter((stop) => stopDay(stop) === day);
    const dayStart = toMinutes(departureForDay({ departure, departures }, day));
    let cursor = dayStart;
    const entries = dayStops.map((stop) => {
      const arrival = cursor;
      const leg = legs.find((item) => item.from.id === stop.id) ?? null;
      cursor += stop.duration + (leg?.minutes ?? 0);
      return { stop, arrival, leg };
    });
    const dayTotal = entries.reduce((sum, entry) => sum + entry.stop.duration + (entry.leg?.minutes ?? 0), 0);
    return { day, dayStops, dayStart, entries, finish: dayStart + dayTotal, date: dateForDay({ startDate }, day) };
  });
  const lastDayWithStops = [...dayTimelines].reverse().find((item) => item.entries.length > 0);
  const finishLabel = dayCount === 1 && !startDate
    ? timeLabel(start + stayMinutes + travelMinutes)
    : lastDayWithStops
      ? `${lastDayWithStops.day}日目 ${lastDayWithStops.date ? `${lastDayWithStops.date.slice(5).replace('-', '/')} ` : ''}${timeLabel(lastDayWithStops.finish)}`
      : timeLabel(start);
  const summaryTotal = stayMinutes + travelMinutes;

  function changeTravel(key: string, minutes: number) {
    setIsSample(false);
    const value = Math.max(0, Math.min(240, Math.round(minutes)));
    setManualTravel((current) => ({ ...current, [key]: value }));
    setTravelDraft(String(value));
  }

  function changeMode(key: string, mode: TravelMode) {
    setIsSample(false);
    setTravelModes((current) => ({ ...current, [key]: mode }));
    setTravel(null);
  }

  function selectStop(id: string) {
    const stop = stops.find((item) => item.id === id);
    if (!stop) return;
    setSelectedId(id);
    setDurationDraft(String(stop.duration));
    setSelectedDay(stopDay(stop));
  }

  function changeDuration(id: string, minutes: number) {
    setIsSample(false);
    const value = Math.max(15, Math.min(240, Math.round(minutes / 15) * 15));
    setStops((current) => current.map((stop) => stop.id === id ? { ...stop, duration: value } : stop));
    setDurationDraft(String(value));
  }

  function renameStop(id: string, value: string) {
    const name = value.trim();
    const stop = stops.find((item) => item.id === id);
    if (!stop || !name || name.length > 150 || name === stop.name) return;
    const updateAddress = !hasCoordinates(stop) && stop.address === stop.name;
    setStops((current) => current.map((item) => item.id === id
      ? { ...item, name, address: updateAddress ? name : item.address }
      : item));
    if (updateAddress) setTravel(null);
    setIsSample(false);
  }

  function updateStop(id: string, patch: Partial<Stop>) {
    setIsSample(false);
    setStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...patch } : stop));
  }

  function moveStopWithinDay(id: string, target: number) {
    const stop = stops.find((item) => item.id === id);
    if (!stop) return;
    const day = stopDay(stop);
    const group = stops.filter((item) => stopDay(item) === day);
    const from = group.findIndex((item) => item.id === id);
    if (from < 0 || target < 0 || target >= group.length || target === from) return;
    setIsSample(false);
    const nextGroup = [...group];
    nextGroup.splice(target, 0, nextGroup.splice(from, 1)[0]);
    const next: Stop[] = [];
    let cursor = 0;
    stops.forEach((item) => { next.push(stopDay(item) === day ? nextGroup[cursor++] : item); });
    setTravel(null);
    setSelectedLeg(null);
    setStops(next);
    selectStop(id);
  }

  function moveStopToIndex(id: string, globalTarget: number) {
    const index = stops.findIndex((stop) => stop.id === id);
    if (index < 0 || globalTarget < 0 || globalTarget >= stops.length || globalTarget === index) return;
    setIsSample(false);
    const targetDay = stopDay(stops[globalTarget]);
    const next = [...stops];
    const [moved] = next.splice(index, 1);
    const insertAt = next.findIndex((stop) => stop.id === stops[globalTarget].id);
    next.splice(insertAt < 0 ? next.length : insertAt, 0, { ...moved, ...(targetDay === 1 ? { day: undefined } : { day: targetDay }) });
    setTravel(null);
    setSelectedLeg(null);
    setStops(next);
    selectStop(id);
  }

  function moveStopToDay(id: string, day: number) {
    const stop = stops.find((item) => item.id === id);
    if (!stop || stopDay(stop) === day) return;
    setIsSample(false);
    const rest = stops.filter((item) => item.id !== id);
    const moved: Stop = { ...stop, ...(day === 1 ? { day: undefined } : { day }) };
    let insertAt = rest.length;
    for (let index = rest.length - 1; index >= 0; index -= 1) {
      if (stopDay(rest[index]) === day) { insertAt = index + 1; break; }
      if (stopDay(rest[index]) < day) { insertAt = index + 1; break; }
    }
    rest.splice(insertAt, 0, moved);
    setTravel(null);
    setSelectedLeg(null);
    setStops(rest);
    setSelectedDay(day);
  }

  function addPlace(place: Place) {
    setIsSample(false);
    const day = Math.min(selectedDay, dayCount);
    const id = stops.some((stop) => stop.id === place.id) || removed?.stop.id === place.id ? crypto.randomUUID() : place.id;
    const newStop: Stop = { ...place, id, duration: 45, color: stops.length % 5, ...(day > 1 ? { day } : {}) };
    setStops((current) => {
      let insertAt = current.length;
      for (let index = current.length - 1; index >= 0; index -= 1) {
        if (stopDay(current[index]) <= day) { insertAt = index + 1; break; }
        insertAt = 0;
      }
      const next = [...current];
      next.splice(insertAt, 0, newStop);
      return next;
    });
    setTravel(null);
    setSelectedLeg(null);
    setSelectedId(id);
    setDurationDraft('45');
  }

  function removeStop() {
    if (!selected) return;
    setIsSample(false);
    const next = stops.filter((stop) => stop.id !== selected.id);
    setRemoved({ stop: selected, index: selectedIndex });
    setStops(next);
    setTravel(null);
    setSelectedLeg(null);
    const nextSelected = next[Math.min(selectedIndex, next.length - 1)];
    setSelectedId(nextSelected?.id ?? null);
    setDurationDraft(String(nextSelected?.duration ?? 45));
  }

  function restoreStop() {
    if (!removed) return;
    setIsSample(false);
    const next = [...stops];
    next.splice(removed.index, 0, removed.stop);
    setStops(next);
    setTravel(null);
    setSelectedLeg(null);
    setSelectedId(removed.stop.id);
    setDurationDraft(String(removed.stop.duration));
    setRemoved(null);
  }

  function applyDraft(next: TripDraft) {
    setTripId(next.id);
    setTitle(next.title);
    setStartDate(next.startDate);
    setStops(next.stops);
    setSelectedId(next.stops[0]?.id ?? null);
    setDurationDraft(String(next.stops[0]?.duration ?? 45));
    setDeparture(next.departure);
    setDepartures(next.departures);
    setDaysExplicit(next.days);
    setIsSample(next.isSample);
    setPacking(next.packing);
    setWeather(next.weather);
    setManualTravel(next.manualTravel);
    setTravelModes(next.travelModes);
    setTravel(null);
    setSelectedLeg(null);
    setTravelDraft('15');
    setRemoved(null);
    setPlaceName('');
    setDraggedId(null);
    setSelectedDay(1);
    resizing.current = null;
    setPendingPlan(null);
    setPlanRevision((revision) => revision + 1);
    setTrips(loadTrips(next));
    if (timelineScroll.current) timelineScroll.current.scrollLeft = 0;
  }

  function replacePlan(kind: 'new' | 'sample') {
    if (kind === 'sample') {
      const base = emptyTrip();
      applyDraft({ ...base, id: SAMPLE_ID, stops: SAMPLE, isSample: true });
    } else {
      applyDraft(emptyTrip());
    }
  }

  function requestPlan(kind: 'new' | 'sample') {
    if (stops.length || removed || departure !== '09:00' || packing.destination || packing.purpose || packing.activities.length || packing.items.length || placeName.trim()) {
      setPendingPlan(kind);
    } else replacePlan(kind);
  }

  function refreshTrips(active: TripDraft) {
    setTrips(loadTrips(active));
  }

  function switchTrip(id: string) {
    const all = loadTrips(currentDraft());
    const target = all.find((trip) => trip.id === id);
    if (!target || id === tripId) return;
    applyDraft(target);
    refreshTrips(target);
  }

  function deleteTrip() {
    const all = loadTrips(currentDraft()).filter((trip) => trip.id !== tripId);
    saveTrips(all);
    if (all.length) {
      applyDraft(all[0]);
      refreshTrips(all[0]);
    } else {
      const fresh = emptyTrip();
      saveTrips([fresh]);
      applyDraft(fresh);
      setTrips([fresh]);
    }
  }

  async function copyShareLink() {
    const url = tripShareUrl(currentDraft(), window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('共有リンクをコピーしました。開くと、この旅程が新しい旅として読み込まれます。');
    } catch {
      setShareNotice('コピーできませんでした。アドレスバーのURLは共有されません。');
    }
  }

  function exportJson() {
    downloadTextFile('tabi-no-yohaku.json', JSON.stringify(currentDraft(), null, 2), 'application/json');
    setShareNotice('旅程をJSONファイルに書き出しました。');
  }

  function exportIcs() {
    if (!startDate) return;
    const events: IcsEvent[] = [];
    dayTimelines.forEach(({ entries, date, day }) => {
      entries.forEach(({ stop, arrival }) => {
        events.push({
          uid: `${tripId}-${stop.id}`,
          title: stop.name,
          date,
          startMinutes: arrival,
          endMinutes: arrival + stop.duration,
          location: stop.address !== stop.name ? stop.address : undefined,
          description: [stop.memo, stop.cost !== undefined ? `費用目安: ${stop.cost}円` : '', `${day}日目・旅の余白で作成`].filter(Boolean).join('\n'),
        });
      });
    });
    downloadTextFile('tabi-no-yohaku.ics', buildIcs(events, title || '旅の余白'), 'text/calendar');
    setShareNotice('カレンダー用ファイル（.ics）を書き出しました。Googleカレンダーなどに読み込めます。');
  }

  async function fetchTripWeather() {
    const located = stops.find(hasCoordinates);
    const lat = located?.lat;
    const lng = located?.lng;
    if (lat === undefined || lng === undefined || !startDate) return;
    setWeatherStatus('天気予報を取得中…');
    try {
      const days = await fetchWeather(lat, lng, startDate, dayCount);
      setWeather(days);
      setWeatherStatus(days.length ? '天気予報を取得しました。' : 'その期間の予報はまだ発表されていません。');
    } catch {
      setWeatherStatus('天気予報を取得できませんでした。通信環境を確認して、もう一度お試しください。');
    }
  }

  function resizeStart(event: PointerEvent<HTMLSpanElement>, stop: Stop) {
    event.preventDefault();
    event.stopPropagation();
    selectStop(stop.id);
    resizing.current = { id: stop.id, x: event.clientX, duration: stop.duration };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function warningFor(stop: Stop, date: string, arrival: number): string | null {
    return openingHoursWarning(stop.openingHours, date, arrival, stop.duration);
  }

  function renderDayTimeline(dayTimeline: (typeof dayTimelines)[number]) {
    const { day, entries, dayStart, date } = dayTimeline;
    const dayTotal = entries.reduce((sum, entry) => sum + entry.stop.duration + (entry.leg?.minutes ?? 0), 0);
    const axisMinutes = Math.max(480, Math.ceil((dayTotal + 60) / 60) * 60);
    return (
      <div key={day} className="tp-day-block">
        {dayCount > 1 && <div className="tp-day-heading"><h3>{day}日目{date && <span>{date.slice(5).replace('-', '/')}</span>}</h3>{day > 1 && <label className="tp-departure"><Clock3 size={16} aria-hidden="true" />出発時刻<input type="time" aria-label={`${day}日目の出発時刻`} value={departureForDay({ departure, departures }, day)} onChange={(event) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) { setDepartures((current) => ({ ...current, [String(day)]: event.target.value })); setIsSample(false); } }} /></label>}</div>}
        <div ref={day === 1 ? timelineScroll : undefined} className="tp-timeline-scroll" tabIndex={0} aria-label={`${day}日目の旅程タイムライン。横にスクロールできます`}>
          <div className="tp-timeline" style={{ width: axisMinutes * PIXELS_PER_MINUTE }}>
            <div className="tp-ruler" aria-hidden="true">{Array.from({ length: axisMinutes / 60 + 1 }, (_, index) => <span key={index} style={{ left: index * 60 * PIXELS_PER_MINUTE }}>{timeLabel(dayStart + index * 60)}</span>)}</div>
            <div className="tp-grid" aria-hidden="true" />
            <ol className="tp-bars" aria-label={`${day}日目の予定の順番`}>
              {entries.map(({ stop, arrival, leg }, index) => {
                const warning = warningFor(stop, date, arrival);
                const LegIcon = leg ? modeIcon(leg.mode) : Footprints;
                return (
                <li key={stop.id} className={`tp-stop tp-color-${stop.color}${stop.id === selectedId ? ' is-selected' : ''}${draggedId === stop.id ? ' is-dragging' : ''}`} data-testid={`trip-stop-${stop.id}`} style={{ width: stop.duration * PIXELS_PER_MINUTE, marginRight: (leg?.minutes ?? 0) * PIXELS_PER_MINUTE } as CSSProperties} draggable onDragStart={(event) => { setDraggedId(stop.id); event.dataTransfer.setData('text/plain', stop.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); const globalTarget = stops.findIndex((item) => item.id === stop.id); moveStopToIndex(id, globalTarget); setDraggedId(null); }}>
                  <button className="tp-bar-content" aria-label={`${stop.name}、滞在${stop.duration}分`} aria-pressed={stop.id === selectedId} onClick={() => selectStop(stop.id)} title={`${stop.name}・${hasTravel ? '' : '未入力の移動時間を除く目安 '}${timeLabel(arrival)}〜${timeLabel(arrival + stop.duration)}${warning ? `・${warning}` : ''}`}>
                    <span className="tp-bar-number">{String(stops.findIndex((item) => item.id === stop.id) + 1).padStart(2, '0')}<GripVertical size={12} aria-hidden="true" /></span><strong>{stop.name}</strong><span>{stop.duration}<small>分</small></span>{warning && <span aria-label={warning}>⚠</span>}
                  </button>
                  <span className="tp-resize" role="slider" tabIndex={0} aria-label={`${stop.name}の滞在時間`} aria-valuemin={15} aria-valuemax={240} aria-valuenow={stop.duration} aria-valuetext={`${stop.duration}分`} aria-orientation="horizontal" onPointerDown={(event) => resizeStart(event, stop)} onPointerMove={(event) => { const active = resizing.current; if (active?.id === stop.id) changeDuration(stop.id, active.duration + (event.clientX - active.x) / PIXELS_PER_MINUTE); }} onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }} onKeyDown={(event) => { const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 15 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -15 : 0; if (delta) { event.preventDefault(); selectStop(stop.id); changeDuration(stop.id, stop.duration + delta); } }} />
                  {(leg?.minutes ?? 0) > 0 && <span className="tp-walk" style={{ width: (leg?.minutes ?? 0) * PIXELS_PER_MINUTE }} title={`${travelModeLabel(leg!.mode)} ${leg!.minutes}分`} aria-label={`次の場所まで${travelModeLabel(leg!.mode)}${leg!.minutes}分`}><LegIcon size={13} aria-hidden="true" />{(leg?.minutes ?? 0) >= 15 && <small>{leg?.minutes}分</small>}</span>}
                  {leg && (
                    <button
                      className={`tp-leg-control${selectedLeg === leg.key ? ' is-active' : ''}`}
                      style={{ left: `calc(100% + ${(leg.minutes ?? 0) * PIXELS_PER_MINUTE / 2}px)` }}
                      aria-label={`${leg.from.name}から${leg.to.name}への移動時間${leg.minutes === null ? 'を追加' : `${leg.minutes}分を編集`}`}
                      aria-expanded={selectedLeg === leg.key}
                      aria-controls="tp-travel-editor"
                      onClick={() => {
                        setSelectedLeg(leg.key);
                        setTravelDraft(String(leg.minutes ?? 15));
                        if (leg.minutes === null) changeTravel(leg.key, 15);
                      }}
                    >
                      {leg.minutes === null ? <><Plus size={12} aria-hidden="true" />移動</> : <><LegIcon size={12} aria-hidden="true" />{leg.minutes}分</>}
                    </button>
                  )}
                  <span hidden>{index}</span>
                </li>
                );
              })}
              <li className="tp-open-time">{entries.length ? <><span className="tp-open-dot" />この先は、気ままに。</> : '場所を追加して、旅をはじめよう。'}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  const selectedWarning = selected
    ? (() => {
      const timelineDay = dayTimelines.find((item) => item.day === stopDay(selected));
      const entry = timelineDay?.entries.find((item) => item.stop.id === selected.id);
      return entry && timelineDay ? warningFor(selected, timelineDay.date, entry.arrival) : null;
    })()
    : null;
  const locatedStop = stops.find(hasCoordinates);

  return (
    <main className="tp-root">
      <div className="tp-shell" hidden={bookletOpen}>
        <header className="tp-header">
          <Link href="/" className="tp-back"><ArrowLeft size={15} aria-hidden="true" /> あそびば</Link>
          <div className="tp-brand"><Route size={22} strokeWidth={1.8} aria-hidden="true" />旅の余白<span>TRIP CANVAS</span></div>
          <span className="tp-header-note">予定を、さわって整える。</span>
        </header>

        <section className="tp-intro">
          <div><p className="tp-eyebrow">A LITTLE ROOM TO WANDER</p><h1>旅の時間を、<span>自分のペースに。</span></h1><p className="tp-description">棒をのばす。順番を変える。ひとつ、外してみる。<br />行きたい場所を並べて、心地よい一日をつくろう。</p></div>
          <div className="tp-intro-stamp" aria-hidden="true"><Footprints size={34} strokeWidth={1.2} /><span>TAKE YOUR TIME</span><span>ゆっくり、いこう。</span></div>
        </section>

        <section className="tp-plan" aria-labelledby="tp-plan-title">
          <div className="tp-plan-heading"><div><p className="tp-eyebrow">YOUR DAY, AT A GLANCE</p><h2 id="tp-plan-title">{title.trim() || '今日の旅程'} {isSample && <span className="tp-sample-label">サンプル：金沢</span>}</h2></div><label className="tp-departure"><Clock3 size={16} aria-hidden="true" />出発時刻<input type="time" aria-label="出発時刻" value={departure} onChange={(event) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) { setDeparture(event.target.value); setIsSample(false); } }} /></label></div>

          <div className="tp-trip-settings">
            <label>旅の名前<input type="text" aria-label="旅の名前" maxLength={100} value={title} placeholder="例：金沢2泊3日" onChange={(event) => { setTitle(event.target.value); setIsSample(false); }} /></label>
            <label>出発日<input type="date" aria-label="出発日" value={startDate} onChange={(event) => { setStartDate(event.target.value); setIsSample(false); setWeather(undefined); }} /></label>
          </div>

          <div className="tp-plan-actions"><button className="tp-primary" onClick={() => requestPlan('new')}><Plus size={16} aria-hidden="true" />新しい旅程を作る</button><button className="tp-secondary" onClick={() => requestPlan('sample')}>金沢のサンプルを見る</button><button ref={bookletButton} className="tp-secondary" onClick={() => setBookletOpen(true)} disabled={!stops.length && !packing.items.length}><BookOpen size={16} aria-hidden="true" />しおり</button><button className="tp-secondary" onClick={exportIcs} disabled={!startDate || !stops.length}><CalendarDays size={16} aria-hidden="true" />カレンダー（.ics）</button></div>

          <div className="tp-trip-manager">
            <label>保存した旅<select aria-label="保存した旅" value={tripId} onChange={(event) => switchTrip(event.target.value)}>{trips.map((trip) => { const shown = trip.id === tripId ? currentDraft() : trip; return <option key={trip.id} value={trip.id}>{`${tripLabel(shown)}（${shown.stops.length}スポット${tripDayCount(shown) > 1 ? `・${tripDayCount(shown)}日間` : ''}）`}</option>; })}</select></label>
            <button className="tp-secondary" onClick={deleteTrip}>この旅を削除</button>
            <button className="tp-secondary" onClick={copyShareLink}><Link2 size={15} aria-hidden="true" />共有リンクをコピー</button>
            <button className="tp-secondary" onClick={exportJson}>JSONを書き出す</button>
            <button className="tp-secondary" onClick={() => importInput.current?.click()}>JSONを読み込む</button>
            <input ref={importInput} type="file" aria-label="旅程のJSONを読み込む" accept="application/json,.json" hidden onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              void file.text().then((text) => {
                const imported = parseTripJson(text);
                if (imported) { applyDraft(imported); setShareNotice('旅程を読み込みました。'); }
                else setShareNotice('そのファイルは旅程として読み込めませんでした。');
              });
            }} />
          </div>
          {shareNotice && <p className="tp-share-notice" role="status">{shareNotice}</p>}
          {pendingPlan && <div className="tp-plan-confirm" role="group" aria-label="旅程の切り替え確認"><p>現在の旅程は「保存した旅」に残したまま、新しい旅程へ切り替えます。</p><div><button className="tp-primary" onClick={() => replacePlan(pendingPlan)}>{pendingPlan === 'new' ? '空の旅程に切り替える' : 'サンプルに切り替える'}</button><button className="tp-secondary" onClick={() => setPendingPlan(null)}>キャンセル</button></div></div>}
          <div className="tp-plan-start">
            {stops.length === 0 && <div className="tp-empty-plan"><h3>まずは、行きたい場所をひとつ。</h3><p>場所を追加して、自分だけの旅程を作れます。操作を試すなら金沢のサンプルもどうぞ。</p></div>}
            <PlaceSearch key={planRevision} label={stops.length ? '次に行きたい場所は？' : '最初に行きたい場所は？'} value={placeName} inputRef={placeInput} autoFocus={planRevision > 0} onChange={setPlaceName} onAdd={addPlace} />
          </div>

          {dayCount > 1 || stops.length > 0 ? <div className="tp-day-tabs" role="group" aria-label="予定を追加する日">
            {daysList.map((day) => <button key={day} type="button" aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)}>{day}日目に追加</button>)}
            <button type="button" onClick={() => { const next = dayCount + 1; setDaysExplicit(next); setSelectedDay(next); setIsSample(false); }}><Plus size={14} aria-hidden="true" />日を追加</button>
          </div> : null}

          <div className="tp-summary" data-testid="trip-summary" aria-live="polite" aria-atomic="true">
            <div><span>立ち寄り</span><strong>{stops.length}<small>スポット</small></strong></div>
            <div><span>滞在時間</span><strong>{durationLabel(stayMinutes)}</strong></div>
            <div><span><Footprints size={13} aria-hidden="true" />{allWalking ? '徒歩移動' : '移動時間'}</span><strong>{hasTravel || hasKnownTravel ? durationLabel(travelMinutes) : '未入力'}{hasKnownTravel && !hasTravel && <small>＋未入力{missingTravel}区間</small>}</strong></div>
            {hasCost && <div><span>費用目安</span><strong>¥{totalCost.toLocaleString('ja-JP')}</strong></div>}
            <div className="tp-finish"><span>{hasTravel ? '終了予定' : hasKnownTravel ? '終了目安（一部未入力）' : '滞在のみの終了'}</span><strong>{dayCount === 1 && !startDate ? timeLabel(start + summaryTotal) : finishLabel}</strong></div>
          </div>

          {dayTimelines.map((dayTimeline) => renderDayTimeline(dayTimeline))}

          <div className="tp-plan-foot"><p><span className="tp-legend-stay" />滞在<span className="tp-legend-walk" />移動</p><span><GripVertical size={13} aria-hidden="true" />棒をドラッグで並べ替え · 右端を動かして時間を調整</span></div>
          <p className="tp-travel-hint">予定の間の「＋移動」で15分追加。分数を押すと、移動手段と一緒に調整できます。</p>
          {activeLeg && (
            <div className="tp-travel-editor" id="tp-travel-editor" role="group" aria-label={`${activeLeg.from.name}から${activeLeg.to.name}への移動時間`}>
              <div className="tp-travel-editor-heading">
                <span><Footprints size={15} aria-hidden="true" />{activeLeg.from.name}<ArrowRight size={13} aria-hidden="true" />{activeLeg.to.name}</span>
                <button onClick={() => setSelectedLeg(null)}>閉じる</button>
              </div>
              <div className="tp-travel-modes" role="group" aria-label="移動手段">
                {TRAVEL_MODES.map((mode) => {
                  const Icon = modeIcon(mode.id);
                  return <button key={mode.id} type="button" aria-pressed={activeLeg.mode === mode.id} onClick={() => changeMode(activeLeg.key, mode.id)}><Icon size={14} aria-hidden="true" />{mode.label}</button>;
                })}
              </div>
              <div className="tp-travel-options">
                {[5, 10, 15, 30].map((minutes) => (
                  <button key={minutes} aria-pressed={activeLeg.minutes === minutes} onClick={() => changeTravel(activeLeg.key, minutes)}>{minutes}分</button>
                ))}
                <label>
                  <input
                    autoFocus
                    type="number"
                    aria-label="移動時間（分）"
                    min={0}
                    max={240}
                    step={1}
                    value={travelDraft}
                    onChange={(event) => {
                      const value = event.target.value;
                      setTravelDraft(value);
                      const minutes = Number(value);
                      if (value && Number.isInteger(minutes) && minutes >= 0 && minutes <= 240) changeTravel(activeLeg.key, minutes);
                    }}
                    onBlur={() => {
                      const draft = travelDraft.trim() && Number.isFinite(Number(travelDraft)) ? Number(travelDraft) : activeLeg.minutes ?? 15;
                      const minutes = Math.max(0, Math.min(240, Math.round(draft)));
                      setTravelDraft(String(minutes));
                      if (minutes !== activeLeg.minutes) changeTravel(activeLeg.key, minutes);
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                  />分
                </label>
                <span>{manualTravel[activeLeg.key] === undefined ? 'Google Mapsの目安' : '手入力'}</span>
                {manualTravel[activeLeg.key] !== undefined && (
                  <button className="tp-travel-reset" onClick={() => {
                    setManualTravel((current) => {
                      const next = { ...current };
                      delete next[activeLeg.key];
                      return next;
                    });
                    setSelectedLeg(null);
                  }}>入力を解除</button>
                )}
              </div>
            </div>
          )}
          {!hasTravel && stops.length > 0 && <p className="tp-time-note">{hasKnownTravel ? `あと${missingTravel}区間の移動時間が未入力です。表示時刻には、入力・取得済みの移動時間だけを含みます。` : '移動時間は未入力です。表示時刻は滞在時間だけの目安です。'}</p>}
        </section>

        {removed && <div className="tp-undo" role="status"><span>「{removed.stop.name}」を予定から外しました</span><button onClick={restoreStop}><Undo2 size={15} aria-hidden="true" />元に戻す</button></div>}

        <div className="tp-workspace">
          <section className="tp-map-panel" aria-labelledby="tp-map-title"><div className="tp-section-heading"><div><p className="tp-eyebrow">CONNECT THE DOTS</p><h2 id="tp-map-title"><MapPin size={19} aria-hidden="true" />旅のつながり</h2></div><span>{allWalking ? '移動は、徒歩で。' : '移動は、徒歩・電車・車で。'}</span></div><TripMap key={planRevision} stops={stops} selectedId={selectedId} travelModes={travelModes} onSelect={selectStop} onRoute={setTravel} /></section>

          <aside className="tp-editor" aria-labelledby="tp-editor-title"><p className="tp-eyebrow">MAKE IT YOURS</p><h2 id="tp-editor-title">この場所で、どのくらい？</h2>{selected ? <><div className={`tp-selected-place tp-color-${selected.color}`}><span>{String(selectedIndex + 1).padStart(2, '0')}</span><div><h3>{selected.name}</h3><p>{selected.address}</p></div></div>
            <form key={`${planRevision}:${selected.id}`} className="tp-rename-form" onSubmit={(event) => {
              event.preventDefault();
              const input = event.currentTarget.querySelector('input');
              if (!input) return;
              const name = input.value.trim();
              input.setCustomValidity(name && name.length <= 150 ? '' : '場所名は空白以外の文字を含む1〜150文字で入力してください。');
              if (!input.reportValidity()) return;
              renameStop(selected.id, name);
              input.value = name;
            }}>
              <label htmlFor="tp-stop-name">場所名</label>
              <div><input id="tp-stop-name" defaultValue={selected.name} maxLength={150} required onChange={(event) => event.currentTarget.setCustomValidity('')} /><button type="submit">名前を変更</button></div>
            </form>
            <label className="tp-duration-label" htmlFor="tp-duration">滞在時間（分）</label><div className="tp-duration-controls"><button aria-label="滞在時間を15分短くする" disabled={selected.duration <= 15} onClick={() => changeDuration(selected.id, selected.duration - 15)}>−</button><input id="tp-duration" type="number" min={15} max={240} step={15} value={durationDraft} onChange={(event) => { const value = event.target.value; setDurationDraft(value); const minutes = Number(value); if (value && minutes >= 15 && minutes <= 240 && minutes % 15 === 0) changeDuration(selected.id, minutes); }} onBlur={() => changeDuration(selected.id, durationDraft.trim() && Number.isFinite(Number(durationDraft)) ? Number(durationDraft) : selected.duration)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>分</span><button aria-label="滞在時間を15分長くする" disabled={selected.duration >= 240} onClick={() => changeDuration(selected.id, selected.duration + 15)}>＋</button></div><p className="tp-editor-hint">15分ずつ、気持ちのいい長さに。</p>
            {dayCount > 1 && <div className="tp-editor-field"><label htmlFor="tp-stop-day">予定の日</label><select id="tp-stop-day" aria-label="予定の日" value={stopDay(selected)} onChange={(event) => moveStopToDay(selected.id, Number(event.target.value))}>{daysList.map((day) => <option key={day} value={day}>{day}日目</option>)}</select></div>}
            <div className="tp-editor-field"><label htmlFor="tp-stop-memo">メモ・予約情報</label><textarea id="tp-stop-memo" aria-label="メモ・予約情報" maxLength={1000} rows={3} placeholder="例：10:30の回を予約済み、予約番号…" value={selected.memo ?? ''} onChange={(event) => updateStop(selected.id, { memo: event.target.value || undefined })} /></div>
            <div className="tp-editor-field"><label htmlFor="tp-stop-cost">費用（円）</label><input id="tp-stop-cost" aria-label="費用（円）" type="number" min={0} max={100000000} step={100} placeholder="例：1200" value={selected.cost ?? ''} onChange={(event) => { const value = event.target.value; updateStop(selected.id, { cost: value === '' ? undefined : Math.max(0, Math.min(100000000, Math.round(Number(value) || 0))) }); }} /></div>
            {selected.openingHours?.weekdayDescriptions && <div className="tp-opening-hours"><h3>営業時間</h3><ul>{selected.openingHours.weekdayDescriptions.map((line) => <li key={line}>{line}</li>)}</ul></div>}
            {selectedWarning && <p className="tp-opening-warning" role="alert">⚠ {selectedWarning}（営業時間はGoogle Placesの情報です）</p>}
            <div className="tp-order-controls"><button disabled={selectedIndex === 0 || stopDay(selected) !== stopDay(stops[selectedIndex - 1])} onClick={() => { const group = stops.filter((item) => stopDay(item) === stopDay(selected)); moveStopWithinDay(selected.id, group.findIndex((item) => item.id === selected.id) - 1); }}><ArrowLeft size={15} aria-hidden="true" />ひとつ前へ</button><button disabled={selectedIndex === stops.length - 1 || stopDay(selected) !== stopDay(stops[selectedIndex + 1])} onClick={() => { const group = stops.filter((item) => stopDay(item) === stopDay(selected)); moveStopWithinDay(selected.id, group.findIndex((item) => item.id === selected.id) + 1); }}>ひとつ後ろへ<ArrowRight size={15} aria-hidden="true" /></button></div><div className="tp-editor-links"><a href={placeUrl(selected)} target="_blank" rel="noreferrer">Google Mapsで見る<ArrowUpRight size={15} aria-hidden="true" /></a><button onClick={removeStop}><Trash2 size={14} aria-hidden="true" />予定から外す</button></div></> : <p className="tp-empty-editor">場所を追加すると、ここで滞在時間を調整できます。</p>}
          </aside>
        </div>

        <section className="tp-weather" aria-labelledby="tp-weather-title">
          <div className="tp-section-heading"><div><p className="tp-eyebrow">WEATHER FOR YOUR TRIP</p><h2 id="tp-weather-title"><CloudSun size={19} aria-hidden="true" />旅の天気</h2></div></div>
          <p className="tp-weather-description">出発日と最初の地点の予報（Open-Meteo）を取得して、持ち物提案に活かせます。予報は出発の約16日前から取得できます。</p>
          <button className="tp-secondary" onClick={fetchTripWeather} disabled={!startDate || !locatedStop}>天気予報を取得</button>
          {!startDate && <span> 先に出発日を設定してください。</span>}
          {startDate && !locatedStop && <span> 座標のある地点（候補検索で追加した場所）が必要です。</span>}
          {weatherStatus && <p role="status">{weatherStatus}</p>}
          {weather && weather.length > 0 && <><ul className="tp-weather-list">{weather.map((day) => <li key={day.date}>{weatherSummaryLine(day)}</li>)}</ul><button className="tp-primary" onClick={() => setPacking(suggestPacking(packing, weatherSuggestions(weather)))}>天気に合わせた持ち物を提案</button></>}
        </section>

        <PackingChecklist key={planRevision} value={packing} onChange={setPacking} stopNames={stops.map((stop) => stop.name)} />

        <footer className="tp-footer"><span>旅の余白 <span>—</span> 詰め込みすぎない、一日のために。</span><span role={saveFailed ? 'alert' : undefined}>{saveFailed ? 'このブラウザーに保存できません。ページを閉じると編集内容が失われます。' : '旅程と持ち物はこのブラウザーに自動保存されます。'}</span></footer>
      </div>
      <TripBooklet key={planRevision} open={bookletOpen} onClose={() => {
        setBookletOpen(false);
        window.requestAnimationFrame(() => bookletButton.current?.focus());
      }}>
        <header className="tp-booklet-heading">
          <p>旅の余白 · TRIP CANVAS</p>
          <h1 id="tp-booklet-title">{title.trim() ? `${title.trim()}のしおり` : '旅のしおり'}</h1>
          {startDate && <p>{startDate}{dayCount > 1 ? ` 〜 ${dateForDay({ startDate }, dayCount)}（${dayCount}日間）` : ''}</p>}
          {packing.destination && <p>{packing.destination}</p>}
          {packing.purpose && <p>{packing.purpose}</p>}
        </header>
        {stops.length > 0 && <>
          <dl className="tp-booklet-summary">
            <div><dt>出発</dt><dd>{departure}</dd></div>
            <div><dt>{hasTravel ? '終了予定' : '終了目安'}</dt><dd>{finishLabel}</dd></div>
            <div><dt>立ち寄り</dt><dd>{stops.length}スポット</dd></div>
            <div><dt>滞在</dt><dd>{durationLabel(stayMinutes)}</dd></div>
            <div><dt>移動</dt><dd>{hasTravel || hasKnownTravel ? durationLabel(travelMinutes) : '未入力'}</dd></div>
            {hasCost && <div><dt>費用目安</dt><dd>¥{totalCost.toLocaleString('ja-JP')}</dd></div>}
          </dl>
          {!hasTravel && <p className="tp-booklet-note">{missingTravel}区間の移動時間が未入力です。時刻は未入力の移動時間を含まない目安です。</p>}
          {weather && weather.length > 0 && <p className="tp-booklet-note">天気予報：{weather.map((day) => weatherSummaryLine(day)).join(' / ')}</p>}
          {dayTimelines.filter((item) => item.entries.length > 0).map(({ day, entries, date }) => (
            <section key={day} aria-labelledby={`tp-booklet-day-${day}`}>
              <h2 id={`tp-booklet-day-${day}`}>{dayCount > 1 ? `${day}日目の旅程${date ? `（${date.slice(5).replace('-', '/')}）` : ''}` : '一日の旅程'}</h2>
              <ol className="tp-booklet-itinerary">
                {entries.map(({ stop, arrival, leg }) => {
                  const warning = warningFor(stop, date, arrival);
                  return <li key={stop.id}>
                    <div className="tp-booklet-stop">
                      <span className="tp-booklet-number">{String(stops.findIndex((item) => item.id === stop.id) + 1).padStart(2, '0')}</span>
                      <div><p className="tp-booklet-time">{timeLabel(arrival)} — {timeLabel(arrival + stop.duration)} · 滞在{durationLabel(stop.duration)}</p><h3>{stop.name}</h3>{stop.address && stop.address !== stop.name && <p className="tp-booklet-address">{stop.address}</p>}{stop.memo && <p className="tp-booklet-memo">{stop.memo}</p>}{stop.cost !== undefined && <p className="tp-booklet-cost">費用目安 ¥{stop.cost.toLocaleString('ja-JP')}</p>}{warning && <p className="tp-booklet-warning">⚠ {warning}</p>}</div>
                    </div>
                    {leg && <p className="tp-booklet-travel">次の場所まで{travelModeLabel(leg.mode)}：{leg.minutes === null ? '未入力' : durationLabel(leg.minutes)}</p>}
                  </li>;
                })}
              </ol>
            </section>
          ))}
        </>}
        {packing.items.length > 0 && <section className="tp-booklet-packing" aria-labelledby="tp-booklet-packing-title">
          <h2 id="tp-booklet-packing-title">持ち物チェックリスト</h2>
          <ul>{packing.items.map((item) => <li key={item.id}><span aria-label={item.checked ? '準備済み' : '未準備'}>{item.checked ? '☑' : '☐'}</span><span>{item.name}</span></li>)}</ul>
        </section>}
      </TripBooklet>
    </main>
  );
}
