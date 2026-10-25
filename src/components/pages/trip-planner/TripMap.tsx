import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { hasCoordinates, loadGoogleMaps, placeUrl, walkingUrl } from './maps';
import type { GoogleMaps, MapInstance, MapMarker, MapPolyline, Place, PlaceSelectEvent } from './maps';

type Props = {
  stops: Place[];
  selectedId: string | null;
  onSelect(id: string): void;
  onAdd(place: Place): void;
  onRoute(durations: number[] | null): void;
};

export default function TripMap({ stops, selectedId, onSelect, onAdd, onRoute }: Props) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const canvas = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const pins = useRef<{ id: string; element: HTMLButtonElement }[]>([]);
  const [sdk, setSdk] = useState<GoogleMaps | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState(key ? '地図を読み込み中…' : '地図連携は未接続です。Google Maps で場所と徒歩経路を確認できます。');
  const [warnings, setWarnings] = useState<string[]>([]);
  const select = useEffectEvent(onSelect);
  const add = useEffectEvent(onAdd);
  const updateRoute = useEffectEvent(onRoute);
  const readStops = useEffectEvent(() => stops);
  const locations = JSON.stringify(stops.map(({ id, name, address, lat, lng }) => ({ id, name, address, lat, lng })));
  const routeLocations = JSON.stringify(stops.map((stop) => ({
    id: stop.id,
    location: hasCoordinates(stop) ? { lat: stop.lat, lng: stop.lng } : stop.address || stop.name,
  })));

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    let autocomplete: HTMLElement | undefined;
    let selectPlace: EventListener | undefined;
    let searchError: EventListener | undefined;
    const start = async () => {
      try {
        const google = await loadGoogleMaps(key);
        await Promise.all(['maps', 'marker', 'places', 'routes'].map((library) => google.importLibrary(library)));
        if (cancelled || !canvas.current || !search.current) return;
        map.current = new google.Map(canvas.current, {
          center: { lat: 36.5641, lng: 136.6594 }, zoom: 14,
          // shortcut: Google's demo map ID is sufficient for this prototype; use an owned map ID before production styling.
          mapId: 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false,
          fullscreenControl: false,
        });
        autocomplete = new google.places.PlaceAutocompleteElement();
        autocomplete.setAttribute('aria-label', '行き先を検索して追加');
        search.current.replaceChildren(autocomplete);
        selectPlace = (event) => {
          void (async () => {
            try {
              const place = (event as PlaceSelectEvent).placePrediction.toPlace();
              await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
              if (cancelled) return;
              const lat = place.location?.lat();
              const lng = place.location?.lng();
              if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Missing location');
              add({ id: place.id, name: place.displayName || place.formattedAddress || '追加した場所', address: place.formattedAddress || '', lat, lng });
            } catch {
              if (!cancelled) setNotice('場所を取得できませんでした。別の候補を選ぶか、もう一度お試しください。');
            }
          })();
        };
        searchError = () => setNotice('場所を検索できませんでした。Google Maps で場所を確認できます。');
        autocomplete.addEventListener('gmp-select', selectPlace);
        autocomplete.addEventListener('gmp-error', searchError);
        setSdk(google);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setNotice('地図を読み込めませんでした。Google Maps のリンクから場所と徒歩経路を確認できます。');
          updateRoute(null);
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (selectPlace) autocomplete?.removeEventListener('gmp-select', selectPlace);
      if (searchError) autocomplete?.removeEventListener('gmp-error', searchError);
      autocomplete?.remove();
      map.current = null;
    };
  }, [key]);

  useEffect(() => {
    if (!sdk || !map.current) return;
    const points = readStops();
    let cancelled = false;
    const markers: MapMarker[] = [];
    let polylines: MapPolyline[] = [];
    const bounds = new sdk.LatLngBounds();
    pins.current = points.flatMap((point, index) => {
      if (!hasCoordinates(point)) return [];
      bounds.extend(point);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'tp-map-pin';
      element.textContent = String(index + 1);
      element.setAttribute('aria-label', `${index + 1} ${point.name}を選択`);
      element.onclick = () => select(point.id);
      markers.push(new sdk.marker.AdvancedMarkerElement({ position: point, map: map.current, content: element }));
      return [{ id: point.id, element }];
    });
    if (pins.current.length) map.current.fitBounds(bounds, 48);
    updateRoute(null);
    setWarnings([]);
    if (points.length < 2) {
      updateRoute([]);
      setNotice(points.length ? '場所を追加すると徒歩経路を表示します。' : '行き先を検索して、旅程を始めましょう。');
    } else {
      setNotice('徒歩経路を計算中…');
      const location = (point: Place) => hasCoordinates(point) ? { lat: point.lat, lng: point.lng } : point.address || point.name;
      void sdk.routes.Route.computeRoutes({
        origin: location(points[0]), destination: location(points[points.length - 1]),
        intermediates: points.slice(1, -1).map((point) => ({ location: location(point) })),
        travelMode: 'WALKING', fields: ['path', 'legs', 'warnings'],
      }).then(({ routes }) => {
        if (cancelled || !map.current) return;
        const route = routes?.[0];
        if (!route?.legs || route.legs.length !== points.length - 1 || route.legs.some((leg) => !Number.isFinite(leg.durationMillis) || (leg.durationMillis ?? -1) < 0)) throw new Error('Missing walking times');
        polylines = route.createPolylines({ polylineOptions: { strokeColor: '#276953', strokeOpacity: 0.85, strokeWeight: 5 } });
        polylines.forEach((line) => line.setMap(map.current));
        updateRoute(route.legs.map((leg) => Math.ceil(leg.durationMillis! / 60000)));
        setWarnings(route.warnings || []);
        setNotice('徒歩ルート・移動時間は Google Maps の目安です。');
      }).catch(() => {
        if (!cancelled) {
          updateRoute(null);
          setNotice('徒歩経路を取得できませんでした。移動時間は未計算です。下のリンクから経路を確認できます。');
        }
      });
    }
    return () => {
      cancelled = true;
      markers.forEach((marker) => { marker.map = null; });
      polylines.forEach((line) => line.setMap(null));
      pins.current.forEach(({ element }) => { element.onclick = null; });
    };
  }, [sdk, routeLocations]);

  useEffect(() => {
    const points = JSON.parse(locations) as Place[];
    pins.current.forEach(({ id, element }) => {
      const index = points.findIndex((stop) => stop.id === id);
      if (index >= 0) element.setAttribute('aria-label', `${index + 1} ${points[index].name}を選択`);
      element.classList.toggle('is-selected', id === selectedId);
      element.setAttribute('aria-pressed', String(id === selectedId));
    });
    const selected = points.find((stop) => stop.id === selectedId);
    if (selected && hasCoordinates(selected)) map.current?.panTo(selected);
  }, [selectedId, locations, sdk]);

  const fallback = !key || failed;
  const located = stops.filter(hasCoordinates);
  const latitudes = located.map((stop) => stop.lat);
  const longitudes = located.map((stop) => stop.lng);
  const minLat = Math.min(...latitudes);
  const minLng = Math.min(...longitudes);
  const latRange = Math.max(Math.max(...latitudes) - minLat, 0.004);
  const lngRange = Math.max(Math.max(...longitudes) - minLng, 0.004);

  return (
    <div className="tp-map">
      {key && !failed && <div ref={search} className="tp-place-search" />}
      <p className="tp-map-notice" role="status">{notice}</p>
      <div ref={canvas} className="tp-map-canvas" hidden={fallback} />
      {fallback && (
        <figure className="tp-map-fallback">
          <svg viewBox="0 0 640 300" role="img" aria-label="予定した地点の位置関係">
            <defs><pattern id="tp-map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" opacity="0.08" /></pattern></defs>
            <rect width="640" height="300" fill="url(#tp-map-grid)" />
            {stops.map((stop, index) => {
              if (!hasCoordinates(stop)) return null;
              const x = 65 + ((stop.lng - minLng) / lngRange) * 480;
              const y = 245 - ((stop.lat - minLat) / latRange) * 190;
              return <g key={stop.id} className={`tp-map-point${stop.id === selectedId ? ' is-selected' : ''}`} transform={`translate(${x} ${y})`} tabIndex={0} role="button" aria-label={`${index + 1} ${stop.name}を選択`} onClick={() => onSelect(stop.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(stop.id); } }}>
                <circle r="17" fill="currentColor" /><text textAnchor="middle" y="5" fill="white" fontSize="13" fontWeight="700">{index + 1}</text><text y="34" textAnchor="middle" fontSize="12" fill="currentColor">{stop.name}</text>
              </g>;
            })}
          </svg>
          <figcaption>{!stops.length ? '行きたい場所を追加すると、ここで旅のつながりを確認できます。' : located.length ? '地点の位置関係（経路未取得）' : '地点の位置は未取得です。下のリンクから Google Maps で確認できます。'}</figcaption>
        </figure>
      )}
      {warnings.map((warning, index) => <p className="tp-map-notice" key={index}>{warning}</p>)}
      <div className="tp-map-links">
        {stops.map((stop, index) => <span key={stop.id}>
          <a href={placeUrl(stop)} target="_blank" rel="noreferrer">{index + 1}. {stop.name} ↗</a>
          {index > 0 && <a href={walkingUrl(stops[index - 1], stop)} target="_blank" rel="noreferrer">{index} → {index + 1} の徒歩経路 ↗</a>}
        </span>)}
      </div>
    </div>
  );
}
