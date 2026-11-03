/// <reference types="google.maps" />

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export type Place = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

type Coordinate = google.maps.LatLngLiteral;
export type GoogleMaps = typeof google.maps;
export type MapInstance = google.maps.Map;
export type MapMarker = google.maps.marker.AdvancedMarkerElement;
export type MapPolyline = google.maps.Polyline;
export type PlaceSelectEvent = google.maps.places.PlacePredictionSelectEvent;

type ErrorCode = 'missing-key' | 'key-changed' | 'authorization' | 'network' | 'timeout' | 'no-route';
export class MapsIntegrationError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, cause?: unknown) {
    super(`Google Maps: ${code}`, { cause });
    this.name = 'MapsIntegrationError';
    this.code = code;
  }
}

export const MAPS_TIMEOUT_MS = 15000;
let configuredKey: string | undefined;
let authorizationError: MapsIntegrationError | undefined;
let authHookInstalled = false;
const authListeners = new Set<(error: MapsIntegrationError) => void>();
type AuthWindow = Window & { gm_authFailure?: () => void };

export function watchMapsAuthorization(listener: (error: MapsIntegrationError) => void): () => void {
  if (!authHookInstalled) {
    const host = window as AuthWindow;
    const previous = host.gm_authFailure;
    host.gm_authFailure = () => {
      authorizationError = new MapsIntegrationError('authorization');
      authListeners.forEach((notify) => notify(authorizationError!));
      previous?.();
    };
    authHookInstalled = true;
  }
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}

export function withMapsTimeout<T>(request: Promise<T>, milliseconds = MAPS_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new MapsIntegrationError('timeout')), milliseconds);
    request.then((result) => { window.clearTimeout(timeout); resolve(result); }, (error: unknown) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  });
}

export function importMapsLibrary<K extends keyof google.maps.ImportLibraryMap>(
  sdk: GoogleMaps, name: K,
): Promise<google.maps.ImportLibraryMap[K]> {
  return withMapsTimeout(sdk.importLibrary(name));
}

export function mapsErrorMessage(error: unknown, feature: 'map' | 'search' | 'route'): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'authorization' || code === 'PERMISSION_DENIED' || code === 'REQUEST_DENIED') {
    return '現在、Google Mapsに接続できません。外部のGoogle Mapsから場所や経路を確認できます。';
  }
  if (feature === 'route') return code === 'no-route'
    ? 'この旅程の徒歩経路が見つかりませんでした。移動時間は未計算です。場所や移動方法を外部のGoogle Mapsで確認してください。'
    : '徒歩経路を取得できませんでした。移動時間は未計算です。再取得するか、手入力で続けられます。';
  if (feature === 'search') return 'Google Mapsの候補検索を利用できません。再試行するか、場所名を直接入力して追加できます。';
  return code === 'timeout'
    ? '地図の読み込みに時間がかかっています。通信環境を確認して、もう一度読み込んでください。'
    : '地図を読み込めませんでした。再試行するか、外部のGoogle Mapsで場所と経路を確認できます。';
}

let mapsPromise: Promise<GoogleMaps> | undefined;

export function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  const normalized = key.trim();
  if (!normalized) return Promise.reject(new MapsIntegrationError('missing-key'));
  if (authorizationError) return Promise.reject(authorizationError);
  if (configuredKey && configuredKey !== normalized) return Promise.reject(new MapsIntegrationError('key-changed'));
  if (mapsPromise) return mapsPromise;
  if (!configuredKey) {
    setOptions({ key: normalized, v: 'quarterly', language: 'ja', region: 'JP' });
    configuredKey = normalized;
  }
  let unsubscribe = () => {};
  const loading = withMapsTimeout(new Promise<GoogleMaps>((resolve, reject) => {
    unsubscribe = watchMapsAuthorization(reject);
    importLibrary('core').then(() => {
      if (authorizationError) throw authorizationError;
      return window.google.maps;
    }).then(resolve, reject);
  })).finally(() => unsubscribe());
  mapsPromise = loading.catch((error: unknown) => {
    mapsPromise = undefined;
    throw error instanceof MapsIntegrationError ? error : new MapsIntegrationError('network', error);
  });
  return mapsPromise;
}

export function placeUrl(place: Place): string {
  const query = hasCoordinates(place) ? `${place.lat},${place.lng}` : `${place.name} ${place.address}`;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;
}

export function hasCoordinates(place: Place): place is Place & Coordinate {
  return typeof place.lat === 'number' && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90
    && typeof place.lng === 'number' && Number.isFinite(place.lng) && Math.abs(place.lng) <= 180;
}

export function walkingUrl(from: Place, to: Place): string {
  const location = (place: Place) => hasCoordinates(place) ? `${place.lat},${place.lng}` : place.address || place.name;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: location(from), destination: location(to), travelmode: 'walking' })}`;
}
