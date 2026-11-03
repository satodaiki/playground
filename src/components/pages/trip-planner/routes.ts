import { hasCoordinates, MapsIntegrationError, withMapsTimeout } from './maps';
import type { Place } from './maps';

export const MAX_ROUTE_STOPS = 27;

export async function computeWalkingRoutes(
  Route: typeof google.maps.routes.Route,
  stops: Place[],
  isCurrent: () => boolean = () => true,
): Promise<{ routes: google.maps.routes.Route[]; minutes: number[]; warnings: string[] }> {
  const routes: google.maps.routes.Route[] = [];
  const minutes: number[] = [];
  const warnings = new Set<string>();
  const location = (point: Place) => hasCoordinates(point) ? { lat: point.lat, lng: point.lng } : point.address || point.name;
  // A request accepts at most 25 intermediate stops. Adjacent batches share one endpoint.
  for (let offset = 0; offset < stops.length - 1 && isCurrent(); offset += MAX_ROUTE_STOPS - 1) {
    const batch = stops.slice(offset, offset + MAX_ROUTE_STOPS);
    const response = await withMapsTimeout(Route.computeRoutes({
      origin: location(batch[0]), destination: location(batch[batch.length - 1]),
      intermediates: batch.slice(1, -1).map((point) => ({ location: location(point) })),
      travelMode: 'WALKING', fields: ['path', 'legs', 'warnings', 'viewport'],
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
