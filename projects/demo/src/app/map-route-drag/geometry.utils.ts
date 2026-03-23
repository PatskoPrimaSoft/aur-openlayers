import { toLonLat } from 'ol/proj';
import type { RouteArrow, RouteWaypoint } from './route-drag.models';

export function distToSegment(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function computeOrderIndexForClick(
  clickCoord3857: number[],
  waypoints: RouteWaypoint[],
  routeCoords3857: number[][],
): number {
  if (waypoints.length < 2 || routeCoords3857.length < 2) {
    return (waypoints[waypoints.length - 1]?.orderIndex ?? 0) + 0.5;
  }

  let minDist = Infinity;
  let nearestSegIdx = 0;
  for (let i = 0; i < routeCoords3857.length - 1; i++) {
    const d = distToSegment(clickCoord3857, routeCoords3857[i], routeCoords3857[i + 1]);
    if (d < minDist) {
      minDist = d;
      nearestSegIdx = i;
    }
  }

  const fraction = nearestSegIdx / (routeCoords3857.length - 1);
  const approxIdx = fraction * (waypoints.length - 1);
  const lowerIdx = Math.floor(approxIdx);
  const upperIdx = Math.min(lowerIdx + 1, waypoints.length - 1);
  return (waypoints[lowerIdx].orderIndex + waypoints[upperIdx].orderIndex) / 2;
}

/**
 * Generate arrow markers along a route at a given pixel interval.
 * Coordinates are in EPSG:3857; arrows are placed by accumulating
 * segment lengths and emitting a marker every `intervalMeters` meters.
 */
export function generateRouteArrows(
  coords3857: number[][],
  intervalMeters: number = 150,
): RouteArrow[] {
  if (coords3857.length < 2) return [];

  const arrows: RouteArrow[] = [];
  let accumulated = intervalMeters / 2; // start offset so first arrow isn't at the very beginning
  let arrowId = 0;

  for (let i = 0; i < coords3857.length - 1; i++) {
    const ax = coords3857[i][0], ay = coords3857[i][1];
    const bx = coords3857[i + 1][0], by = coords3857[i + 1][1];
    const segLen = Math.hypot(bx - ax, by - ay);
    // Direction: angle from north, clockwise (OL rotation convention)
    const rotation = Math.atan2(bx - ax, by - ay);

    while (accumulated <= segLen) {
      const t = accumulated / segLen;
      const px = ax + t * (bx - ax);
      const py = ay + t * (by - ay);
      const [lng, lat] = toLonLat([px, py]) as [number, number];
      arrows.push({ id: `arrow-${arrowId++}`, lng, lat, rotation });
      accumulated += intervalMeters;
    }
    accumulated -= segLen;
  }

  return arrows;
}
