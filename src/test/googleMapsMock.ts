import { vi } from 'vitest';
import type { GoogleMaps } from '@/components/pages/trip-planner/maps';

export function createGoogleMapsMock(options: { autoTiles?: boolean } = {}) {
  class Bounds {
    points: unknown[] = [];
    extend(point: unknown) { this.points.push(point); return this; }
    union(bounds: Bounds) { this.points.push(...bounds.points); return this; }
    isEmpty() { return this.points.length === 0; }
  }
  const createMap = (element: HTMLElement, mapOptions: google.maps.MapOptions) => {
    const listeners = new Map<string, Set<() => void>>();
    return {
      element, options: mapOptions, fitBounds: vi.fn(), panTo: vi.fn(), setCenter: vi.fn(), setZoom: vi.fn(), unbindAll: vi.fn(),
      addListener: vi.fn((event: string, callback: () => void) => {
        const callbacks = listeners.get(event) || new Set<() => void>();
        listeners.set(event, callbacks);
        callbacks.add(callback);
        if (event === 'tilesloaded' && options.autoTiles !== false) queueMicrotask(() => { if (callbacks.has(callback)) callback(); });
        return { remove: vi.fn(() => callbacks.delete(callback)) };
      }),
      emit(event: string) { listeners.get(event)?.forEach((callback) => callback()); },
      clear() { listeners.clear(); },
    };
  };
  const instances: ReturnType<typeof createMap>[] = [];
  const MapConstructor = vi.fn(function (element: HTMLElement, mapOptions: google.maps.MapOptions) {
    const map = createMap(element, mapOptions);
    instances.push(map);
    return map;
  });
  const markers: (HTMLElement & { map: unknown; position: unknown; zIndex: number })[] = [];
  const MarkerConstructor = vi.fn(function (markerOptions: { map: ReturnType<typeof createMap>; position: unknown; title: string }) {
    const marker = document.createElement('gmp-advanced-marker') as typeof markers[number];
    marker.map = markerOptions.map;
    marker.position = markerOptions.position;
    marker.title = markerOptions.title;
    marker.setAttribute('role', 'button');
    marker.setAttribute('aria-label', markerOptions.title);
    markerOptions.map.element.append(marker);
    markers.push(marker);
    return marker;
  });
  const setMap = vi.fn();
  const createPolylines = vi.fn(() => [{ setMap }]);
  const computeRoutes = vi.fn().mockResolvedValue({ routes: [{
    legs: [{ durationMillis: 75000 }], warnings: ['歩道を確認してください'], createPolylines,
  }] });
  const errors: Record<string, unknown> = {};
  const libraries = {
    core: { LatLngBounds: Bounds }, maps: { Map: MapConstructor },
    marker: { AdvancedMarkerElement: MarkerConstructor }, routes: { Route: { computeRoutes } },
  };
  const sdk = {
    importLibrary: vi.fn(async (name: string) => {
      if (errors[name]) throw errors[name];
      return libraries[name as keyof typeof libraries];
    }),
    event: { clearInstanceListeners: vi.fn((map: ReturnType<typeof createMap>) => map.clear()) },
  };
  return { sdk: sdk as unknown as GoogleMaps, libraries, instances, markers, MapConstructor, MarkerConstructor, computeRoutes, createPolylines, setMap, errors, Bounds };
}
