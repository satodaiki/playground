import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Clock3, Footprints, GripVertical, MapPin, Plus, Route, Trash2, Undo2 } from 'lucide-react';
import { Link } from 'wouter';

import TripMap from './trip-planner/TripMap';
import type { Place } from './trip-planner/maps';
import './TripPlanner.css';

type Stop = Place & { duration: number; color: number };
const PIXELS_PER_MINUTE = 2;
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

export default function TripPlanner() {
  const [stops, setStops] = useState<Stop[]>(SAMPLE);
  const [selectedId, setSelectedId] = useState<string | null>(SAMPLE[0].id);
  const [durationDraft, setDurationDraft] = useState('45');
  const [departure, setDeparture] = useState('09:00');
  const [travel, setTravel] = useState<number[] | null>(null);
  const [manualTravel, setManualTravel] = useState<Record<string, number>>({});
  const [selectedLeg, setSelectedLeg] = useState<string | null>(null);
  const [travelDraft, setTravelDraft] = useState('15');
  // shortcut: 削除の取り消しは直前の1件のみ。複数段階の取り消しが必要になったら履歴を持つ。
  const [removed, setRemoved] = useState<{ stop: Stop; index: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const resizing = useRef<{ id: string; x: number; duration: number } | null>(null);
  const selected = stops.find((stop) => stop.id === selectedId);
  const selectedIndex = stops.findIndex((stop) => stop.id === selectedId);
  const start = Number(departure.slice(0, 2)) * 60 + Number(departure.slice(3));
  const stayMinutes = stops.reduce((sum, stop) => sum + stop.duration, 0);
  const legs = stops.slice(0, -1).map((from, index) => {
    const to = stops[index + 1];
    const key = JSON.stringify([from.id, to.id]);
    const automatic = travel?.length === stops.length - 1 ? travel[index] : null;
    return { from, to, key, minutes: manualTravel[key] ?? automatic };
  });
  const missingTravel = legs.filter((leg) => leg.minutes === null).length;
  const hasTravel = missingTravel === 0;
  const hasKnownTravel = legs.some((leg) => leg.minutes !== null);
  const travelMinutes = legs.reduce((sum, leg) => sum + (leg.minutes ?? 0), 0);
  const activeLeg = legs.find((leg) => leg.key === selectedLeg);
  const total = stayMinutes + travelMinutes;
  const axisMinutes = Math.max(480, Math.ceil((total + 60) / 60) * 60);
  let elapsed = 0;
  const timeline = stops.map((stop, index) => {
    const arrival = start + elapsed;
    const leg = legs[index];
    const walk = leg?.minutes ?? 0;
    elapsed += stop.duration + walk;
    return { stop, arrival, walk, leg };
  });

  function changeTravel(key: string, minutes: number) {
    const value = Math.max(0, Math.min(240, Math.round(minutes)));
    setManualTravel((current) => ({ ...current, [key]: value }));
    setTravelDraft(String(value));
  }

  function selectStop(id: string) {
    const stop = stops.find((item) => item.id === id);
    if (!stop) return;
    setSelectedId(id);
    setDurationDraft(String(stop.duration));
  }

  function changeDuration(id: string, minutes: number) {
    const value = Math.max(15, Math.min(240, Math.round(minutes / 15) * 15));
    setStops((current) => current.map((stop) => stop.id === id ? { ...stop, duration: value } : stop));
    setDurationDraft(String(value));
  }

  function moveStop(id: string, target: number) {
    const index = stops.findIndex((stop) => stop.id === id);
    if (index < 0 || target < 0 || target >= stops.length || target === index) return;
    const next = [...stops];
    next.splice(target, 0, next.splice(index, 1)[0]);
    setTravel(null);
    setSelectedLeg(null);
    setStops(next);
    selectStop(id);
  }

  function addPlace(place: Place) {
    const id = stops.some((stop) => stop.id === place.id) || removed?.stop.id === place.id ? crypto.randomUUID() : place.id;
    setStops((current) => [...current, { ...place, id, duration: 45, color: current.length % 5 }]);
    setTravel(null);
    setSelectedLeg(null);
    setSelectedId(id);
    setDurationDraft('45');
  }

  function removeStop() {
    if (!selected) return;
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
    const next = [...stops];
    next.splice(removed.index, 0, removed.stop);
    setStops(next);
    setTravel(null);
    setSelectedLeg(null);
    setSelectedId(removed.stop.id);
    setDurationDraft(String(removed.stop.duration));
    setRemoved(null);
  }

  function resizeStart(event: PointerEvent<HTMLSpanElement>, stop: Stop) {
    event.preventDefault();
    event.stopPropagation();
    selectStop(stop.id);
    resizing.current = { id: stop.id, x: event.clientX, duration: stop.duration };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <main className="tp-root">
      <div className="tp-shell">
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
          <div className="tp-plan-heading"><div><p className="tp-eyebrow">YOUR DAY, AT A GLANCE</p><h2 id="tp-plan-title">今日の旅程 <span className="tp-sample-label">サンプル：金沢</span></h2></div><label className="tp-departure"><Clock3 size={16} aria-hidden="true" />出発時刻<input type="time" aria-label="出発時刻" value={departure} onChange={(event) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) setDeparture(event.target.value); }} /></label></div>

          <div className="tp-summary" data-testid="trip-summary" aria-live="polite" aria-atomic="true">
            <div><span>立ち寄り</span><strong>{stops.length}<small>スポット</small></strong></div>
            <div><span>滞在時間</span><strong>{durationLabel(stayMinutes)}</strong></div>
            <div><span><Footprints size={13} aria-hidden="true" />徒歩移動</span><strong>{hasTravel || hasKnownTravel ? durationLabel(travelMinutes) : '未入力'}{hasKnownTravel && !hasTravel && <small>＋未入力{missingTravel}区間</small>}</strong></div>
            <div className="tp-finish"><span>{hasTravel ? '終了予定' : hasKnownTravel ? '終了目安（一部未入力）' : '滞在のみの終了'}</span><strong>{timeLabel(start + total)}</strong></div>
          </div>

          <div className="tp-timeline-scroll" tabIndex={0} aria-label="旅程タイムライン。横にスクロールできます">
            <div className="tp-timeline" style={{ width: axisMinutes * PIXELS_PER_MINUTE }}>
              <div className="tp-ruler" aria-hidden="true">{Array.from({ length: axisMinutes / 60 + 1 }, (_, index) => <span key={index} style={{ left: index * 60 * PIXELS_PER_MINUTE }}>{timeLabel(start + index * 60)}</span>)}</div>
              <div className="tp-grid" aria-hidden="true" />
              <ol className="tp-bars" aria-label="予定の順番">
                {timeline.map(({ stop, arrival, walk, leg }, index) => (
                  <li key={stop.id} className={`tp-stop tp-color-${stop.color}${stop.id === selectedId ? ' is-selected' : ''}${draggedId === stop.id ? ' is-dragging' : ''}`} data-testid={`trip-stop-${stop.id}`} style={{ width: stop.duration * PIXELS_PER_MINUTE, marginRight: walk * PIXELS_PER_MINUTE } as CSSProperties} draggable onDragStart={(event) => { setDraggedId(stop.id); event.dataTransfer.setData('text/plain', stop.id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); moveStop(id, index); setDraggedId(null); }}>
                    <button className="tp-bar-content" aria-label={`${stop.name}、滞在${stop.duration}分`} aria-pressed={stop.id === selectedId} onClick={() => selectStop(stop.id)} title={`${stop.name}・${hasTravel ? '' : '未入力の移動時間を除く目安 '}${timeLabel(arrival)}〜${timeLabel(arrival + stop.duration)}`}>
                      <span className="tp-bar-number">{String(index + 1).padStart(2, '0')}<GripVertical size={12} aria-hidden="true" /></span><strong>{stop.name}</strong><span>{stop.duration}<small>分</small></span>
                    </button>
                    <span className="tp-resize" role="slider" tabIndex={0} aria-label={`${stop.name}の滞在時間`} aria-valuemin={15} aria-valuemax={240} aria-valuenow={stop.duration} aria-valuetext={`${stop.duration}分`} aria-orientation="horizontal" onPointerDown={(event) => resizeStart(event, stop)} onPointerMove={(event) => { const active = resizing.current; if (active?.id === stop.id) changeDuration(stop.id, active.duration + (event.clientX - active.x) / PIXELS_PER_MINUTE); }} onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }} onKeyDown={(event) => { const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 15 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -15 : 0; if (delta) { event.preventDefault(); selectStop(stop.id); changeDuration(stop.id, stop.duration + delta); } }} />
                    {walk > 0 && <span className="tp-walk" style={{ width: walk * PIXELS_PER_MINUTE }} title={`徒歩 ${walk}分`} aria-label={`次の場所まで徒歩${walk}分`}><Footprints size={13} aria-hidden="true" />{walk >= 15 && <small>{walk}分</small>}</span>}
                    {leg && (
                      <button
                        className={`tp-leg-control${selectedLeg === leg.key ? ' is-active' : ''}`}
                        style={{ left: `calc(100% + ${walk * PIXELS_PER_MINUTE / 2}px)` }}
                        aria-label={`${leg.from.name}から${leg.to.name}への移動時間${leg.minutes === null ? 'を追加' : `${leg.minutes}分を編集`}`}
                        aria-expanded={selectedLeg === leg.key}
                        aria-controls="tp-travel-editor"
                        onClick={() => {
                          setSelectedLeg(leg.key);
                          setTravelDraft(String(leg.minutes ?? 15));
                          if (leg.minutes === null) changeTravel(leg.key, 15);
                        }}
                      >
                        {leg.minutes === null ? <><Plus size={12} aria-hidden="true" />移動</> : <><Footprints size={12} aria-hidden="true" />{leg.minutes}分</>}
                      </button>
                    )}
                  </li>
                ))}
                <li className="tp-open-time">{stops.length ? <><span className="tp-open-dot" />この先は、気ままに。</> : '場所を追加して、旅をはじめよう。'}</li>
              </ol>
            </div>
          </div>

          <div className="tp-plan-foot"><p><span className="tp-legend-stay" />滞在<span className="tp-legend-walk" />徒歩移動</p><span><GripVertical size={13} aria-hidden="true" />棒をドラッグで並べ替え · 右端を動かして時間を調整</span></div>
          <p className="tp-travel-hint">予定の間の「＋移動」で15分追加。分数を押すと、すぐに調整できます。</p>
          {activeLeg && (
            <div className="tp-travel-editor" id="tp-travel-editor" role="group" aria-label={`${activeLeg.from.name}から${activeLeg.to.name}への移動時間`}>
              <div className="tp-travel-editor-heading">
                <span><Footprints size={15} aria-hidden="true" />{activeLeg.from.name}<ArrowRight size={13} aria-hidden="true" />{activeLeg.to.name}</span>
                <button onClick={() => setSelectedLeg(null)}>閉じる</button>
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
          {!hasTravel && <p className="tp-time-note">{hasKnownTravel ? `あと${missingTravel}区間の移動時間が未入力です。表示時刻には、入力・取得済みの移動時間だけを含みます。` : '移動時間は未入力です。表示時刻は滞在時間だけの目安です。'}</p>}
        </section>

        {removed && <div className="tp-undo" role="status"><span>「{removed.stop.name}」を予定から外しました</span><button onClick={restoreStop}><Undo2 size={15} aria-hidden="true" />元に戻す</button></div>}

        <div className="tp-workspace">
          <section className="tp-map-panel" aria-labelledby="tp-map-title"><div className="tp-section-heading"><div><p className="tp-eyebrow">CONNECT THE DOTS</p><h2 id="tp-map-title"><MapPin size={19} aria-hidden="true" />旅のつながり</h2></div><span>移動は、徒歩で。</span></div><TripMap stops={stops} selectedId={selectedId} onSelect={selectStop} onAdd={addPlace} onRoute={setTravel} /></section>

          <aside className="tp-editor" aria-labelledby="tp-editor-title"><p className="tp-eyebrow">MAKE IT YOURS</p><h2 id="tp-editor-title">この場所で、どのくらい？</h2>{selected ? <><div className={`tp-selected-place tp-color-${selected.color}`}><span>{String(selectedIndex + 1).padStart(2, '0')}</span><div><h3>{selected.name}</h3><p>{selected.address}</p></div></div><label className="tp-duration-label" htmlFor="tp-duration">滞在時間（分）</label><div className="tp-duration-controls"><button aria-label="滞在時間を15分短くする" disabled={selected.duration <= 15} onClick={() => changeDuration(selected.id, selected.duration - 15)}>−</button><input id="tp-duration" type="number" min={15} max={240} step={15} value={durationDraft} onChange={(event) => { const value = event.target.value; setDurationDraft(value); const minutes = Number(value); if (value && minutes >= 15 && minutes <= 240 && minutes % 15 === 0) changeDuration(selected.id, minutes); }} onBlur={() => changeDuration(selected.id, durationDraft.trim() && Number.isFinite(Number(durationDraft)) ? Number(durationDraft) : selected.duration)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>分</span><button aria-label="滞在時間を15分長くする" disabled={selected.duration >= 240} onClick={() => changeDuration(selected.id, selected.duration + 15)}>＋</button></div><p className="tp-editor-hint">15分ずつ、気持ちのいい長さに。</p><div className="tp-order-controls"><button disabled={selectedIndex === 0} onClick={() => moveStop(selected.id, selectedIndex - 1)}><ArrowLeft size={15} aria-hidden="true" />ひとつ前へ</button><button disabled={selectedIndex === stops.length - 1} onClick={() => moveStop(selected.id, selectedIndex + 1)}>ひとつ後ろへ<ArrowRight size={15} aria-hidden="true" /></button></div><div className="tp-editor-links"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.name} ${selected.address}`)}`} target="_blank" rel="noreferrer">Google Mapsで見る<ArrowUpRight size={15} aria-hidden="true" /></a><button onClick={removeStop}><Trash2 size={14} aria-hidden="true" />予定から外す</button></div></> : <p className="tp-empty-editor">場所を追加すると、ここで滞在時間を調整できます。</p>}

            {!import.meta.env.VITE_GOOGLE_MAPS_API_KEY && <form className="tp-add-form" onSubmit={(event) => { event.preventDefault(); const name = placeName.trim(); if (name) { addPlace({ id: crypto.randomUUID(), name, address: name }); setPlaceName(''); } }}><label htmlFor="tp-add-place">次に行きたい場所は？</label><div><input id="tp-add-place" value={placeName} maxLength={150} onChange={(event) => setPlaceName(event.target.value)} placeholder="例：金沢駅" required /><button type="submit" aria-label="場所を追加" disabled={!placeName.trim()}><Plus size={18} aria-hidden="true" /></button></div><p>都市名も入れると、地図で見つけやすくなります。</p></form>}
          </aside>
        </div>

        <footer className="tp-footer"><span>旅の余白 <span>—</span> 詰め込みすぎない、一日のために。</span><span>この試作の予定は、ページを閉じるとリセットされます。</span></footer>
      </div>
    </main>
  );
}
