import { LineString } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import Polyline from 'ol/format/Polyline';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export interface OsrmRouteResult {
  coordsLonLat: [number, number][];
  coords3857: number[][];
}

const polylineFormat = new Polyline();

export async function fetchOsrmRoute(
  waypoints: { lng: number; lat: number }[],
  signal?: AbortSignal,
): Promise<OsrmRouteResult | null> {
  const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=polyline`;

  const res = await fetch(url, { signal });
  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes?.[0]) {
    console.error('OSRM error:', data);
    return null;
  }

  const lineGeom = polylineFormat.readGeometry(data.routes[0].geometry, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  }) as LineString;
  const coords3857 = lineGeom.getCoordinates();

  return {
    coords3857,
    coordsLonLat: coords3857.map(c => toLonLat(c) as [number, number]),
  };
}
