export type Place = {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lng?: number;
};

type Coordinate = { lat: number; lng: number };
type Bounds = { extend(point: Coordinate): void };
export type MapInstance = {
  fitBounds(bounds: Bounds, padding?: number): void;
  panTo(point: Coordinate): void;
};
export type MapMarker = { map: MapInstance | null };
export type MapPolyline = { setMap(map: MapInstance | null): void };
type GooglePlace = {
  id: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat(): number; lng(): number };
  fetchFields(request: { fields: string[] }): Promise<unknown>;
};
export type PlaceSelectEvent = Event & {
  placePrediction: { toPlace(): GooglePlace };
};
export type GoogleMaps = {
  importLibrary(name: string): Promise<unknown>;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  LatLngBounds: new () => Bounds;
  marker: {
    AdvancedMarkerElement: new (options: Record<string, unknown>) => MapMarker;
  };
  places: { PlaceAutocompleteElement: new () => HTMLElement & { value: string } };
  routes: {
    Route: {
      computeRoutes(request: Record<string, unknown>): Promise<{
        routes?: {
          legs?: { durationMillis?: number }[];
          warnings?: string[];
          createPolylines(options: Record<string, unknown>): MapPolyline[];
        }[];
      }>;
    };
  };
};

let mapsPromise: Promise<GoogleMaps> | undefined;

export function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  const host = window as unknown as {
    google?: { maps: GoogleMaps };
    tripPlannerMapsReady?: () => void;
  };
  if (host.google?.maps.importLibrary) return Promise.resolve(host.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('Map loading timed out')), 20000);
    host.tripPlannerMapsReady = () => {
      window.clearTimeout(timeout);
      if (host.google?.maps) resolve(host.google.maps);
      else reject(new Error('Maps unavailable'));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Maps unavailable'));
    };
    const params = new URLSearchParams({ key, v: 'weekly', loading: 'async', language: 'ja', callback: 'tripPlannerMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    document.head.append(script);
  });
  return mapsPromise;
}

export function placeUrl(place: Place): string {
  const query = hasCoordinates(place) ? `${place.lat},${place.lng}` : `${place.name} ${place.address}`;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`;
}

export function hasCoordinates(place: Place): place is Place & Coordinate {
  return typeof place.lat === 'number' && Number.isFinite(place.lat) && typeof place.lng === 'number' && Number.isFinite(place.lng);
}

export function walkingUrl(from: Place, to: Place): string {
  const location = (place: Place) => hasCoordinates(place) ? `${place.lat},${place.lng}` : place.address || place.name;
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', origin: location(from), destination: location(to), travelmode: 'walking' })}`;
}
