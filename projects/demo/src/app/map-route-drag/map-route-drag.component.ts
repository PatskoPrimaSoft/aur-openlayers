import { Component, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type Geometry from 'ol/geom/Geometry';
import { LineString, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import Polyline from 'ol/format/Polyline';
import {
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';

// --- Models ---

interface RouteWaypoint {
  id: string;
  lat: number;
  lng: number;
  orderIndex: number;
  type: 'primary' | 'intermediate';
}

interface RouteLine {
  id: string;
  coordinates: [number, number][];
}

// --- Constants ---

const LAYER_ID = {
  ROUTE_LINE: 'route-line',
  PRIMARY_POINTS: 'primary-points',
  INTERMEDIATE_POINTS: 'intermediate-points',
} as const;

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// --- Style types ---

type LineStyleOpts = { color: string; width: number };

type PointStyleOpts = {
  color: string;
  radius: number;
  strokeColor: string;
  label: string;
};

// --- Style helpers ---

function renderPoint(opts: PointStyleOpts): Style[] {
  return [new Style({
    image: new CircleStyle({
      radius: opts.radius,
      fill: new Fill({ color: opts.color }),
      stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
    }),
    text: opts.label ? new Text({
      text: opts.label,
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.45)', width: 2 }),
      font: opts.radius >= 12 ? '700 12px "Inter", sans-serif' : '600 9px "Inter", sans-serif',
      textAlign: 'center',
      textBaseline: 'middle',
    }) : undefined,
  })];
}

@Component({
  selector: 'app-map-route-drag',
  standalone: true,
  imports: [CommonModule, MapHostComponent],
  templateUrl: './map-route-drag.component.html',
  styleUrl: './map-route-drag.component.scss',
})
export class MapRouteDragComponent implements OnDestroy {
  phase: 'placing' | 'routed' = 'placing';
  primaryPoints: RouteWaypoint[] = [];
  intermediatePoints: RouteWaypoint[] = [];
  loading = false;
  sortedWaypoints: RouteWaypoint[] = [];

  private waypointCounter = 0;
  private abortController: AbortController | null = null;
  private primaryLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private intermediateLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private lineLayerApi?: VectorLayerApi<RouteLine, LineString>;
  private unsubscribes: (() => void)[] = [];
  private polylineFormat = new Polyline();
  private lastRouteCoords3857: number[][] = [];
  private intermediateLabels = new Map<string, string>();

  readonly mapConfig: MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]>;

  getIntermediateLabel(id: string): string {
    return this.intermediateLabels.get(id) ?? '';
  }

  constructor(private readonly zone: NgZone) {
    this.mapConfig = this.buildMapConfig();
  }

  onReady(ctx: MapContext): void {
    this.primaryLayerApi = ctx.layers[LAYER_ID.PRIMARY_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.intermediateLayerApi = ctx.layers[LAYER_ID.INTERMEDIATE_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.lineLayerApi = ctx.layers[LAYER_ID.ROUTE_LINE] as VectorLayerApi<RouteLine, LineString> | undefined;

    const unsub = this.intermediateLayerApi?.onModelsChanged?.((changes) => {
      this.zone.run(() => {
        changes.forEach(({ next }) => {
          this.intermediatePoints = this.intermediatePoints.map(p => p.id === next.id ? next : p);
        });
        this.rebuildSorted();
      });
    });
    if (unsub) this.unsubscribes.push(unsub);
  }

  buildRoute(): void {
    this.phase = 'routed';
    this.fetchRoute();
  }

  resetRoute(): void {
    this.phase = 'placing';
    this.intermediatePoints = [];
    this.lastRouteCoords3857 = [];
    this.intermediateLabels.clear();
    this.intermediateLayerApi?.clear();
    this.lineLayerApi?.clear();
    this.rebuildSorted();
  }

  removePoint(id: string): void {
    const isPrimary = this.primaryPoints.some(p => p.id === id);
    if (isPrimary) {
      this.primaryPoints = this.primaryPoints
        .filter(p => p.id !== id)
        .map((p, i) => ({ ...p, orderIndex: i + 1 }));
      this.primaryLayerApi?.setModels(this.primaryPoints);
    } else {
      this.intermediatePoints = this.intermediatePoints.filter(p => p.id !== id);
      this.intermediateLayerApi?.removeModelsById([id]);
    }

    this.rebuildSorted();
    if (this.phase === 'routed') {
      if (this.primaryPoints.length + this.intermediatePoints.length >= 2) {
        this.recalcIntermediateLabels();
        this.fetchRoute();
      } else {
        this.resetRoute();
      }
    }
  }

  ngOnDestroy(): void {
    this.unsubscribes.forEach(fn => fn());
    this.abortController?.abort();
  }

  // --- Private ---

  private nextId(type: 'primary' | 'intermediate'): string {
    return `${type}-${++this.waypointCounter}`;
  }

  private rebuildSorted(): void {
    this.sortedWaypoints = [...this.primaryPoints, ...this.intermediatePoints]
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  private recalcIntermediateLabels(): void {
    const sorted = this.sortedWaypoints;
    this.intermediateLabels.clear();
    let lastPrimaryIndex = 0;
    let counter = 0;
    for (const wp of sorted) {
      if (wp.type === 'primary') {
        lastPrimaryIndex = wp.orderIndex;
        counter = 0;
      } else {
        counter++;
        this.intermediateLabels.set(wp.id, `${lastPrimaryIndex}.${counter}`);
      }
    }
    // Force style refresh — setModels re-renders all features
    this.intermediateLayerApi?.setModels(this.intermediatePoints);
  }

  private async fetchRoute(): Promise<void> {
    const waypoints = this.sortedWaypoints;
    if (waypoints.length < 2) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    const coords = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `${OSRM_BASE}/${coords}?overview=full&geometries=polyline`;

    this.zone.run(() => (this.loading = true));
    try {
      const res = await fetch(url, { signal: this.abortController.signal });
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        console.error('OSRM error:', data);
        return;
      }

      const lineGeom = this.polylineFormat.readGeometry(data.routes[0].geometry, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as LineString;
      const coords3857 = lineGeom.getCoordinates();

      this.lastRouteCoords3857 = coords3857;
      this.lineLayerApi?.setModels([{
        id: 'route',
        coordinates: coords3857.map(c => toLonLat(c) as [number, number]),
      }]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
    } finally {
      this.zone.run(() => (this.loading = false));
    }
  }

  private computeOrderIndexForClick(clickCoord3857: number[]): number {
    const waypoints = this.sortedWaypoints;
    const route = this.lastRouteCoords3857;

    if (waypoints.length < 2 || route.length < 2) {
      return (waypoints[waypoints.length - 1]?.orderIndex ?? 0) + 0.5;
    }

    let minDist = Infinity;
    let nearestSegIdx = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const d = this.distToSegment(clickCoord3857, route[i], route[i + 1]);
      if (d < minDist) {
        minDist = d;
        nearestSegIdx = i;
      }
    }

    const fraction = nearestSegIdx / (route.length - 1);
    const approxIdx = fraction * (waypoints.length - 1);
    const lowerIdx = Math.floor(approxIdx);
    const upperIdx = Math.min(lowerIdx + 1, waypoints.length - 1);
    return (waypoints[lowerIdx].orderIndex + waypoints[upperIdx].orderIndex) / 2;
  }

  private distToSegment(p: number[], a: number[], b: number[]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  private addPrimaryPoint(lon: number, lat: number): void {
    const wp: RouteWaypoint = {
      id: this.nextId('primary'),
      lat,
      lng: lon,
      orderIndex: this.primaryPoints.length + 1,
      type: 'primary',
    };
    this.primaryPoints = [...this.primaryPoints, wp];
    this.primaryLayerApi?.addModel(wp);
    this.rebuildSorted();
  }

  private addIntermediatePoint(lon: number, lat: number, clickCoord3857: number[]): void {
    const wp: RouteWaypoint = {
      id: this.nextId('intermediate'),
      lat,
      lng: lon,
      orderIndex: this.computeOrderIndexForClick(clickCoord3857),
      type: 'intermediate',
    };
    this.intermediatePoints = [...this.intermediatePoints, wp];
    this.intermediateLayerApi?.addModel(wp);
    this.rebuildSorted();
    this.recalcIntermediateLabels();
    this.fetchRoute();
  }

  // --- Schema ---

  private buildMapConfig(): MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]> {
    return {
      schema: {
        layers: [
          {
            id: LAYER_ID.ROUTE_LINE,
            zIndex: 1,
            feature: {
              id: (m: RouteLine) => m.id,
              geometry: {
                fromModel: (m: RouteLine) =>
                  new LineString(m.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
                applyGeometryToModel: (prev: RouteLine) => prev,
              },
              style: {
                base: (): LineStyleOpts => ({ color: '#2563eb', width: 4 }),
                render: (opts: LineStyleOpts) =>
                  new Style({ stroke: new Stroke({ color: opts.color, width: opts.width }) }),
              },
            },
          },
          {
            id: LAYER_ID.INTERMEDIATE_POINTS,
            zIndex: 2,
            feature: {
              id: (m: RouteWaypoint) => m.id,
              geometry: {
                fromModel: (m: RouteWaypoint) => new Point(fromLonLat([m.lng, m.lat])),
                applyGeometryToModel: (prev: RouteWaypoint, geom: Geometry): RouteWaypoint => {
                  if (!(geom instanceof Point)) return prev;
                  const [lng, lat] = toLonLat(geom.getCoordinates());
                  return { ...prev, lng, lat };
                },
              },
              style: {
                base: (m: RouteWaypoint): PointStyleOpts => ({
                  color: '#10b981',
                  radius: 10,
                  strokeColor: '#ffffff',
                  label: this.intermediateLabels.get(m.id) ?? '',
                }),
                states: {
                  DRAG: (): Partial<PointStyleOpts> => ({ color: '#f97316', radius: 11 }),
                  HOVER: (): Partial<PointStyleOpts> => ({ strokeColor: '#f97316' }),
                },
                render: renderPoint,
              },
              interactions: {
                hover: { cursor: 'pointer', state: 'HOVER' },
                click: {
                  enabled: () => this.phase === 'routed',
                  onClick: ({ items, event }) => {
                    if (items.length === 0) {
                      const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                      this.zone.run(() => this.addIntermediatePoint(lng, lat, event.coordinate as number[]));
                    }
                    return true;
                  },
                },
                translate: {
                  cursor: 'grab',
                  hitTolerance: 6,
                  state: 'DRAG',
                  onEnd: () => { this.fetchRoute(); return true; },
                },
              },
            },
          },
          {
            id: LAYER_ID.PRIMARY_POINTS,
            zIndex: 3,
            feature: {
              id: (m: RouteWaypoint) => m.id,
              geometry: {
                fromModel: (m: RouteWaypoint) => new Point(fromLonLat([m.lng, m.lat])),
                applyGeometryToModel: (prev: RouteWaypoint) => prev,
              },
              style: {
                base: (m: RouteWaypoint): PointStyleOpts => ({
                  color: '#2563eb',
                  radius: 14,
                  strokeColor: '#ffffff',
                  label: String(m.orderIndex),
                }),
                states: {
                  HOVER: (): Partial<PointStyleOpts> => ({ strokeColor: '#f97316' }),
                },
                render: renderPoint,
              },
              interactions: {
                hover: { cursor: 'pointer', state: 'HOVER' },
                click: {
                  enabled: () => this.phase === 'placing',
                  onClick: ({ items, event }) => {
                    if (items.length === 0) {
                      const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                      this.zone.run(() => this.addPrimaryPoint(lng, lat));
                    }
                    return true;
                  },
                },
              },
            },
          },
        ],
      },
      view: { centerLonLat: [27.5619, 53.9023], zoom: 11 },
      osm: true,
    };
  }
}
