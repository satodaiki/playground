import { hasCoordinates, MapsIntegrationError, withMapsTimeout } from './maps';
import type { Place, TravelMode } from './maps';

export const MAX_ROUTE_STOPS = 27;

const location = (point: Place) => hasCoordinates(point) ? { lat: point.lat, lng: point.lng } : point.address || point.name;

async function computeRoutesWithMode(
  Route: typeof google.maps.routes.Route,
  stops: Place[],
  mode: TravelMode,
  isCurrent: () => boolean,
): Promise<{ routes: google.maps.routes.Route[]; minutes: number[]; warnings: string[] }> {
  const routes: google.maps.routes.Route[] = [];
  const minutes: number[] = [];
  const warnings = new Set<string>();
  if (mode === 'TRANSIT') {
    // 電車は中間地点つき一括取得が安定しないため、区間ごとに取得する。
    for (let index = 0; index < stops.length - 1 && isCurrent(); index += 1) {
      const response = await withMapsTimeout(Route.computeRoutes({
        origin: location(stops[index]), destination: location(stops[index + 1]),
        travelMode: mode, fields: ['path', 'legs', 'warnings', 'viewport'],
        language: 'ja', region: 'jp',
      }));
      if (!isCurrent()) break;
      const route = response.routes?.[0];
      if (!route?.legs || route.legs.length !== 1
        || !Number.isFinite(route.legs[0].durationMillis) || (route.legs[0].durationMillis ?? -1) < 0) {
        throw new MapsIntegrationError('no-route');
      }
      routes.push(route);
      minutes.push(Math.ceil(route.legs[0].durationMillis! / 60000));
      route.warnings?.forEach((warning) => warnings.add(warning));
    }
    return { routes, minutes, warnings: [...warnings] };
  }
  // A request accepts at most 25 intermediate stops. Adjacent batches share one endpoint.
  for (let offset = 0; offset < stops.length - 1 && isCurrent(); offset += MAX_ROUTE_STOPS - 1) {
    const batch = stops.slice(offset, offset + MAX_ROUTE_STOPS);
    const response = await withMapsTimeout(Route.computeRoutes({
      origin: location(batch[0]), destination: location(batch[batch.length - 1]),
      intermediates: batch.slice(1, -1).map((point) => ({ location: location(point) })),
      travelMode: mode, fields: ['path', 'legs', 'warnings', 'viewport'],
      language: 'ja', region: 'jp',
    }));
    if (!isCurrent()) break;
    const route = response.routes?.[0];
    if (!route?.legs || route.legs.length !== batch.length - 1
      || route.legs.some((leg) => !Number.isFinite(leg.durationMillis) || (leg.durationMillis ?? -1) < 0)) {
      throw new MapsIntegrationError('no-route');
    }
    routes.push(route);
    minutes.push(...route.legs.map((leg) => Math.ceil(leg.durationMillis! / 60000)));
    route.warnings?.forEach((warning) => warnings.add(warning));
  }
  return { routes, minutes, warnings: [...warnings] };
}

export async function computeWalkingRoutes(
  Route: typeof google.maps.routes.Route,
  stops: Place[],
  isCurrent: () => boolean = () => true,
): Promise<{ routes: google.maps.routes.Route[]; minutes: number[]; warnings: string[] }> {
  return computeRoutesWithMode(Route, stops, 'WALKING', isCurrent);
}

export type RouteLeg = { from: Place; to: Place; mode: TravelMode };

/**
 * 区間の並び（移動手段つき）に対する経路と所要分を返す。
 * minutes は legs と同じ順番・同じ長さになる。
 * 連続した同手段の区間はまとめて取得し、手段が変わる境界で分割する。
 */
export async function computeTripRoutes(
  Route: typeof google.maps.routes.Route,
  legs: RouteLeg[],
  isCurrent: () => boolean = () => true,
): Promise<{ routes: google.maps.routes.Route[]; minutes: number[]; warnings: string[] }> {
  const routes: google.maps.routes.Route[] = [];
  const minutes: number[] = [];
  const warnings = new Set<string>();
  let index = 0;
  while (index < legs.length && isCurrent()) {
    let end = index;
    while (end + 1 < legs.length && legs[end + 1].mode === legs[index].mode && legs[end].to === legs[end + 1].from) end += 1;
    const run = legs.slice(index, end + 1);
    const runStops = [run[0].from, ...run.map((leg) => leg.to)];
    const result = await computeRoutesWithMode(Route, runStops, run[0].mode, isCurrent);
    if (!isCurrent()) break;
    routes.push(...result.routes);
    minutes.push(...result.minutes);
    result.warnings.forEach((warning) => warnings.add(warning));
    index = end + 1;
  }
  return { routes, minutes, warnings: [...warnings] };
}
