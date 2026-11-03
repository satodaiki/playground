import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  hasCoordinates, importMapsLibrary, loadGoogleMaps, MAPS_TIMEOUT_MS, MapsIntegrationError,
  mapsErrorMessage, placeUrl, walkingUrl, watchMapsAuthorization,
} from './maps';
import type { GoogleMaps, MapInstance, MapMarker, MapPolyline, Place } from './maps';
import { computeWalkingRoutes } from './routes';

type Props = {
  stops: Place[];
  selectedId: string | null;
  onSelect(id: string): void;
  onRoute(durations: number[] | null): void;
};
type Runtime = { sdk: GoogleMaps; map: MapInstance; LatLngBounds: typeof google.maps.LatLngBounds };
type MapState = { phase: 'loading' } | { phase: 'ready'; runtime: Runtime } | { phase: 'error'; error: unknown };
type RouteState = { phase: 'idle' | 'loading' | 'ready' | 'error'; message: string; warnings: string[] };
type Viewport = { kind: 'point'; point: google.maps.LatLngLiteral } | { kind: 'bounds'; bounds: google.maps.LatLngBounds };
type Pin = { id: string; marker: MapMarker; element: HTMLElement; click: () => void };

function fitViewport(map: MapInstance, viewport: Viewport | null) {
  if (!viewport) return;
  if (viewport.kind === 'bounds') map.fitBounds(viewport.bounds, 48);
  else { map.setCenter(viewport.point); map.setZoom(14); }
}

export default function TripMap({ stops, selectedId, onSelect, onRoute }: Props) {
  const key = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined)?.trim() || 'DEMO_MAP_ID';
  const canvas = useRef<HTMLDivElement>(null);
  const pins = useRef<Pin[]>([]);
  const viewport = useRef<Viewport | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [routeAttempt, setRouteAttempt] = useState(0);
  const [mapState, setMapState] = useState<MapState>({ phase: 'loading' });
  const [routeState, setRouteState] = useState<RouteState>({ phase: 'idle', message: '', warnings: [] });
  const [pinError, setPinError] = useState(false);
  const runtime = key && mapState.phase === 'ready' ? mapState.runtime : null;
  const select = useEffectEvent(onSelect);
  const updateRoute = useEffectEvent(onRoute);
  const readStops = useEffectEvent(() => stops);
  const readSelected = useEffectEvent(() => selectedId);
  const locations = JSON.stringify(stops.map(({ id, name, address, lat, lng }) => ({ id, name, address, lat, lng })));
  const routeLocations = JSON.stringify(stops.map((stop) => ({
    id: stop.id, location: hasCoordinates(stop) ? { lat: stop.lat, lng: stop.lng } : stop.address || stop.name,
  })));

  useEffect(() => {
    if (!key || !canvas.current) return;
    const element = canvas.current;
    let cancelled = false;
    let failed = false;
    let instance: MapInstance | undefined;
    let sdk: GoogleMaps | undefined;
    let readyListener: google.maps.MapsEventListener | undefined;
    let tileTimeout: number | undefined;
    const fail = (error: unknown) => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(tileTimeout);
      setMapState({ phase: 'error', error });
      updateRoute(null);
    };
    const unsubscribe = watchMapsAuthorization(fail);
    void (async () => {
      try {
        sdk = await loadGoogleMaps(key);
        if (cancelled || failed) return;
        const [{ Map }, { LatLngBounds }] = await Promise.all([
          importMapsLibrary(sdk, 'maps'), importMapsLibrary(sdk, 'core'),
        ]);
        if (cancelled || failed) return;
        const first = readStops().find(hasCoordinates);
        instance = new Map(element, {
          center: first ? { lat: first.lat, lng: first.lng } : { lat: 36.2, lng: 138.2 },
          zoom: first ? 14 : 5, mapId, mapTypeControl: false, streetViewControl: false,
          fullscreenControl: true, gestureHandling: 'cooperative',
        });
        const loaded = { sdk, map: instance, LatLngBounds };
        tileTimeout = window.setTimeout(() => fail(new MapsIntegrationError('timeout')), MAPS_TIMEOUT_MS);
        readyListener = instance.addListener('tilesloaded', () => {
          if (cancelled || failed) return;
          window.clearTimeout(tileTimeout);
          readyListener?.remove();
          setMapState({ phase: 'ready', runtime: loaded });
        });
      } catch (error) { fail(error); }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(tileTimeout);
      readyListener?.remove();
      if (instance) { sdk?.event.clearInstanceListeners(instance); instance.unbindAll(); }
      element.replaceChildren();
    };
  }, [key, mapId, attempt]);

  // Pin failures must not prevent either the base map or walking routes from loading.
  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    const created: Pin[] = [];
    void (async () => {
      try {
        const known = readStops().filter(hasCoordinates);
        if (known.length === 1) viewport.current = { kind: 'point', point: { lat: known[0].lat, lng: known[0].lng } };
        else if (known.length > 1) {
          const bounds = new runtime.LatLngBounds();
          known.forEach((point) => bounds.extend(point));
          viewport.current = { kind: 'bounds', bounds };
        } else viewport.current = null;
        fitViewport(runtime.map, viewport.current);
        await Promise.resolve();
        if (!known.length || cancelled) { if (!cancelled) setPinError(false); return; }
        const { AdvancedMarkerElement } = await importMapsLibrary(runtime.sdk, 'marker');
        if (cancelled) return;
        readStops().forEach((point, index) => {
          if (!hasCoordinates(point)) return;
          const element = document.createElement('span');
          element.className = 'tp-map-pin';
          element.textContent = String(index + 1);
          element.setAttribute('aria-hidden', 'true');
          const marker = new AdvancedMarkerElement({
            position: { lat: point.lat, lng: point.lng }, map: runtime.map,
            title: `${index + 1} ${point.name}を選択`, gmpClickable: true,
          });
          marker.append(element);
          const selected = point.id === readSelected();
          element.classList.toggle('is-selected', selected);
          marker.setAttribute('aria-pressed', String(selected));
          const click = () => select(point.id);
          marker.addEventListener('gmp-click', click);
          created.push({ id: point.id, marker, element, click });
        });
        pins.current = created;
        setPinError(false);
      } catch {
        created.forEach(({ marker, click }) => { marker.removeEventListener('gmp-click', click); marker.map = null; marker.remove(); });
        if (!cancelled) setPinError(true);
      }
    })();
    return () => {
      cancelled = true;
      created.forEach(({ marker, click }) => { marker.removeEventListener('gmp-click', click); marker.map = null; marker.remove(); });
      if (pins.current === created) pins.current = [];
    };
  }, [runtime, routeLocations]);

  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    const polylines: MapPolyline[] = [];
    updateRoute(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        const points = readStops();
        if (points.length < 2) {
          updateRoute([]);
          setRouteState({ phase: 'idle', message: '', warnings: [] });
          return;
        }
        setRouteState({ phase: 'loading', message: '徒歩経路を計算中…', warnings: [] });
        try {
          const { Route } = await importMapsLibrary(runtime.sdk, 'routes');
          if (cancelled) return;
          const result = await computeWalkingRoutes(Route, points, () => !cancelled);
          if (cancelled) return;
          const bounds = new runtime.LatLngBounds();
          result.routes.forEach((route) => {
            const lines = route.createPolylines({ polylineOptions: { strokeColor: '#276953', strokeOpacity: 0.85, strokeWeight: 5 } });
            polylines.push(...lines);
            lines.forEach((line) => line.setMap(runtime.map));
            if (route.viewport) bounds.union(route.viewport);
            else route.path?.forEach((point) => bounds.extend(point));
          });
          if (!bounds.isEmpty()) {
            viewport.current = { kind: 'bounds', bounds };
            fitViewport(runtime.map, viewport.current);
          }
          updateRoute(result.minutes);
          setRouteState({ phase: 'ready', message: '徒歩ルート・移動時間は Google Maps の目安です。', warnings: result.warnings });
        } catch (error) {
          polylines.forEach((line) => line.setMap(null));
          if (!cancelled) {
            updateRoute(null);
            setRouteState({ phase: 'error', message: mapsErrorMessage(error, 'route'), warnings: [] });
          }
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      polylines.forEach((line) => line.setMap(null));
    };
  }, [runtime, routeLocations, routeAttempt]);

  useEffect(() => {
    const points = JSON.parse(locations) as Place[];
    pins.current.forEach(({ id, marker, element }) => {
      const index = points.findIndex((point) => point.id === id);
      if (index >= 0) marker.title = `${index + 1} ${points[index].name}を選択`;
      element.classList.toggle('is-selected', id === selectedId);
      marker.setAttribute('aria-pressed', String(id === selectedId));
      marker.zIndex = id === selectedId ? 1000 : index;
    });
    const selected = points.find((point) => point.id === selectedId);
    if (selected && hasCoordinates(selected)) runtime?.map.panTo(selected);
  }, [selectedId, locations, runtime]);

  useEffect(() => {
    if (!runtime || !canvas.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.contentRect.width > 0 && entry.contentRect.height > 0)) fitViewport(runtime.map, viewport.current);
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [runtime]);

  const fallback = !key || mapState.phase === 'error';
  const error = mapState.phase === 'error' ? mapState.error : undefined;
  const mustReload = error instanceof MapsIntegrationError && ['authorization', 'key-changed'].includes(error.code);
  const notice = !key ? 'Google Mapsは未接続です。下の図は地図ではなく、地点の位置関係を示しています。'
    : mapState.phase === 'error' ? mapsErrorMessage(error, 'map')
      : mapState.phase === 'loading' ? 'Google Mapsの地図を読み込み中…' : 'Google Mapsの地図を表示しています。';
  const unlocated = stops.filter((point) => !hasCoordinates(point)).length;

  return <div className="tp-map">
    <p className="tp-map-notice" role="status" aria-label="地図の状態">{notice}</p>
    <div ref={canvas} className="tp-map-canvas" role="region" aria-label="Google Mapsの地図" aria-busy={mapState.phase === 'loading' && Boolean(key)} hidden={fallback} />
    {fallback && <MapFallback stops={stops} selectedId={selectedId} onSelect={onSelect} />}
    {key && mapState.phase === 'error' && <div className="tp-map-toolbar"><button type="button" className="tp-secondary" onClick={() => {
      if (mustReload) window.location.reload();
      else { setMapState({ phase: 'loading' }); setAttempt((current) => current + 1); }
    }}>{mustReload ? 'ページを再読み込み' : '地図を再読み込み'}</button></div>}
    {runtime && <>
      <div className="tp-map-toolbar"><button type="button" className="tp-secondary" onClick={() => fitViewport(runtime.map, viewport.current)}>旅程全体を表示</button></div>
      {pinError && <p className="tp-map-notice">場所のピンを表示できませんでした。地図と下の場所リンクは利用できます。</p>}
      {unlocated > 0 && <p className="tp-map-notice">{unlocated}地点に位置情報がありません。検索候補から選んだ場所は、地図にピンを表示できます。</p>}
      {routeState.phase !== 'idle' && <p className="tp-map-notice" role="status" aria-label="徒歩経路の状態">{routeState.message}</p>}
      {routeState.phase === 'error' && <div className="tp-map-toolbar"><button type="button" className="tp-secondary" onClick={() => setRouteAttempt((current) => current + 1)}>徒歩経路を再取得</button></div>}
      {routeState.warnings.map((warning, index) => <p className="tp-map-notice" key={index}>{warning}</p>)}
    </>}
    <div className="tp-map-links">{stops.map((stop, index) => <span key={stop.id}>
      <a href={placeUrl(stop)} target="_blank" rel="noreferrer">{index + 1}. {stop.name} ↗</a>
      {index > 0 && <a href={walkingUrl(stops[index - 1], stop)} target="_blank" rel="noreferrer">{index} → {index + 1} の徒歩経路 ↗</a>}
    </span>)}</div>
  </div>;
}

function MapFallback({ stops, selectedId, onSelect }: Pick<Props, 'stops' | 'selectedId' | 'onSelect'>) {
  const located = stops.filter(hasCoordinates);
  const latitudes = located.map((stop) => stop.lat);
  const longitudes = located.map((stop) => stop.lng);
  const minLat = located.length ? Math.min(...latitudes) : 0;
  const minLng = located.length ? Math.min(...longitudes) : 0;
  const latRange = Math.max(Math.max(...latitudes) - minLat, 0.004);
  const lngRange = Math.max(Math.max(...longitudes) - minLng, 0.004);
  return <figure className="tp-map-fallback">
    <svg viewBox="0 0 640 300" role="img" aria-label="予定した地点の位置関係（地図ではありません）">
      <defs><pattern id="tp-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" opacity="0.08" /></pattern></defs>
      <rect width="640" height="300" fill="url(#tp-map-grid)" />
      {stops.map((stop, index) => {
        if (!hasCoordinates(stop)) return null;
        const x = 65 + ((stop.lng - minLng) / lngRange) * 480;
        const y = 245 - ((stop.lat - minLat) / latRange) * 190;
        return <g key={stop.id} className={`tp-map-point${stop.id === selectedId ? ' is-selected' : ''}`} transform={`translate(${x} ${y})`} tabIndex={0} role="button" aria-label={`${index + 1} ${stop.name}を選択`} onClick={() => onSelect(stop.id)} onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(stop.id); }
        }}><circle r="17" fill="currentColor" /><text textAnchor="middle" y="5" fill="white" fontSize="13" fontWeight="700">{index + 1}</text><text y="34" textAnchor="middle" fontSize="12" fill="currentColor">{stop.name}</text></g>;
      })}
    </svg>
    <figcaption>{!stops.length ? '行きたい場所を追加すると、ここで旅のつながりを確認できます。' : located.length ? '地点の位置関係（経路未取得）' : '地点の位置は未取得です。下のリンクから Google Maps で確認できます。'}</figcaption>
  </figure>;
}
