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
  coordinates: [number, number][]; // [lng, lat]
}

// --- Constants ---

const LAYER_ID = {
  ROUTE_LINE: 'route-line',
  PRIMARY_POINTS: 'primary-points',
  INTERMEDIATE_POINTS: 'intermediate-points',
} as const;

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// --- Style types ---

type LineStyleOpts = {
  color: string;
  width: number;
};

type PrimaryPointStyleOpts = {
  color: string;
  radius: number;
  label: string;
  strokeColor: string;
};

type IntermediatePointStyleOpts = {
  color: string;
  radius: number;
  strokeColor: string;
  label: string;
};

// --- Helpers ---

let waypointCounter = 0;

function nextWaypointId(type: 'primary' | 'intermediate'): string {
  return `${type}-${++waypointCounter}`;
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

  private abortController: AbortController | null = null;
  private primaryLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private intermediateLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private lineLayerApi?: VectorLayerApi<RouteLine, LineString>;
  private unsubscribes: (() => void)[] = [];
  private polylineFormat = new Polyline();
  private lastRouteCoords3857: number[][] = [];

  readonly mapConfig: MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]>;

  private intermediateLabels = new Map<string, string>();

  get allWaypointsSorted(): RouteWaypoint[] {
    return [...this.primaryPoints, ...this.intermediatePoints]
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  getIntermediateLabel(id: string): string {
    return this.intermediateLabels.get(id) ?? '·';
  }

  private recalcIntermediateLabels(): void {
    const sorted = this.allWaypointsSorted;
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
    // Trigger style refresh on intermediate layer
    this.intermediateLayerApi?.setModels(this.intermediatePoints);
  }

  constructor(private readonly zone: NgZone) {
    this.mapConfig = this.buildMapConfig();
  }

  // --- Public methods (called from template) ---

  onReady(ctx: MapContext): void {
    this.primaryLayerApi = ctx.layers[LAYER_ID.PRIMARY_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.intermediateLayerApi = ctx.layers[LAYER_ID.INTERMEDIATE_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.lineLayerApi = ctx.layers[LAYER_ID.ROUTE_LINE] as VectorLayerApi<RouteLine, LineString> | undefined;

    const unsub = this.intermediateLayerApi?.onModelsChanged?.((changes) => {
      this.zone.run(() => {
        changes.forEach(({ next }) => {
          const idx = this.intermediatePoints.findIndex((p) => p.id === next.id);
          if (idx !== -1) {
            this.intermediatePoints = [
              ...this.intermediatePoints.slice(0, idx),
              next,
              ...this.intermediatePoints.slice(idx + 1),
            ];
          }
        });
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
    this.intermediateLayerApi?.clear();
    this.lineLayerApi?.clear();
  }

  removePoint(id: string): void {
    const primary = this.primaryPoints.find((p) => p.id === id);
    if (primary) {
      this.primaryPoints = this.primaryPoints.filter((p) => p.id !== id);
      this.primaryPoints = this.primaryPoints.map((p, i) => ({ ...p, orderIndex: i + 1 }));
      this.primaryLayerApi?.setModels(this.primaryPoints);
    } else {
      this.intermediatePoints = this.intermediatePoints.filter((p) => p.id !== id);
      this.intermediateLayerApi?.removeModelsById([id]);
    }

    const totalRemaining = this.primaryPoints.length + this.intermediatePoints.length;
    if (this.phase === 'routed') {
      if (totalRemaining >= 2) {
        this.recalcIntermediateLabels();
        this.fetchRoute();
      } else {
        this.resetRoute();
      }
    } else {
      // In placing phase, no intermediate labels to recalc
    }
  }

  ngOnDestroy(): void {
    this.unsubscribes.forEach((fn) => fn());
    this.abortController?.abort();
  }

  // --- OSRM ---

  private async fetchRoute(): Promise<void> {
    const waypoints = this.allWaypointsSorted;
    if (waypoints.length < 2) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    const coords = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(';');
    const url = `${OSRM_BASE}/${coords}?overview=full&geometries=polyline`;

    this.zone.run(() => (this.loading = true));

    try {
      const res = await fetch(url, { signal: this.abortController.signal });
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        console.error('OSRM error:', data);
        this.zone.run(() => (this.loading = false));
        return;
      }

      const encodedPolyline = data.routes[0].geometry;
      const lineGeom = this.polylineFormat.readGeometry(encodedPolyline, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as LineString;
      const coords3857 = lineGeom.getCoordinates();
      const coordsLonLat = coords3857.map((c) => toLonLat(c) as [number, number]);

      this.lastRouteCoords3857 = coords3857;

      this.zone.run(() => (this.loading = false));

      this.lineLayerApi?.setModels([{
        id: 'route',
        coordinates: coordsLonLat,
      }]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
      this.zone.run(() => (this.loading = false));
    }
  }

  // --- Nearest segment calculation ---

  private computeOrderIndexForClick(clickCoord3857: number[]): number {
    const waypoints = this.allWaypointsSorted;
    if (waypoints.length < 2) return waypoints.length > 0 ? waypoints[waypoints.length - 1].orderIndex + 0.5 : 0.5;

    const route = this.lastRouteCoords3857;
    if (route.length < 2) return waypoints[waypoints.length - 1].orderIndex + 0.5;

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

    const lower = waypoints[lowerIdx].orderIndex;
    const upper = waypoints[upperIdx].orderIndex;
    return (lower + upper) / 2;
  }

  private distToSegment(p: number[], a: number[], b: number[]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a[0] + t * dx;
    const projY = a[1] + t * dy;
    return Math.hypot(p[0] - projX, p[1] - projY);
  }

  // --- Point management ---

  private addPrimaryPoint(lon: number, lat: number): void {
    const nextIndex = this.primaryPoints.length + 1;
    const wp: RouteWaypoint = {
      id: nextWaypointId('primary'),
      lat,
      lng: lon,
      orderIndex: nextIndex,
      type: 'primary',
    };
    this.primaryPoints = [...this.primaryPoints, wp];
    this.primaryLayerApi?.addModel(wp);
  }

  private addIntermediatePoint(lon: number, lat: number, clickCoord3857: number[]): void {
    const orderIndex = this.computeOrderIndexForClick(clickCoord3857);
    const wp: RouteWaypoint = {
      id: nextWaypointId('intermediate'),
      lat,
      lng: lon,
      orderIndex,
      type: 'intermediate',
    };
    this.intermediatePoints = [...this.intermediatePoints, wp];
    this.intermediateLayerApi?.addModel(wp);
    this.recalcIntermediateLabels();
    this.fetchRoute();
  }

  // --- Schema builder ---

  private buildMapConfig(): MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]> {
    return {
      schema: {
        layers: [
          // Layer 1: Route line (no interactions)
          {
            id: LAYER_ID.ROUTE_LINE,
            zIndex: 1,
            feature: {
              id: (model: RouteLine) => model.id,
              geometry: {
                fromModel: (model: RouteLine) =>
                  new LineString(model.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
                applyGeometryToModel: (prev: RouteLine) => prev,
              },
              style: {
                base: () => ({
                  color: '#2563eb',
                  width: 4,
                }),
                render: (opts: LineStyleOpts) =>
                  new Style({
                    stroke: new Stroke({
                      color: opts.color,
                      width: opts.width,
                    }),
                  }),
              },
            },
          },

          // Layer 2: Intermediate points (click to add, translate to move)
          {
            id: LAYER_ID.INTERMEDIATE_POINTS,
            zIndex: 2,
            feature: {
              id: (model: RouteWaypoint) => model.id,
              geometry: {
                fromModel: (model: RouteWaypoint) =>
                  new Point(fromLonLat([model.lng, model.lat])),
                applyGeometryToModel: (prev: RouteWaypoint, geom: Geometry): RouteWaypoint => {
                  if (!(geom instanceof Point)) return prev;
                  const [lng, lat] = toLonLat(geom.getCoordinates());
                  return { ...prev, lng, lat };
                },
              },
              style: {
                base: (model: RouteWaypoint) => ({
                  color: '#10b981',
                  radius: 10,
                  strokeColor: '#ffffff',
                  label: this.intermediateLabels.get(model.id) ?? '',
                }),
                states: {
                  DRAG: () => ({
                    color: '#f97316',
                    radius: 11,
                  }),
                  HOVER: () => ({
                    strokeColor: '#f97316',
                  }),
                },
                render: (opts: IntermediatePointStyleOpts) => [
                  new Style({
                    image: new CircleStyle({
                      radius: opts.radius,
                      fill: new Fill({ color: opts.color }),
                      stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
                    }),
                    text: opts.label ? new Text({
                      text: opts.label,
                      fill: new Fill({ color: '#ffffff' }),
                      stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.45)', width: 2 }),
                      font: '600 9px "Inter", sans-serif',
                      textAlign: 'center',
                      textBaseline: 'middle',
                    }) : undefined,
                  }),
                ],
              },
              interactions: {
                hover: {
                  cursor: 'pointer',
                  state: 'HOVER',
                },
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
                  onEnd: () => {
                    this.fetchRoute();
                    return true;
                  },
                },
              },
            },
          },

          // Layer 3: Primary points (click to add in placing phase)
          {
            id: LAYER_ID.PRIMARY_POINTS,
            zIndex: 3,
            feature: {
              id: (model: RouteWaypoint) => model.id,
              geometry: {
                fromModel: (model: RouteWaypoint) =>
                  new Point(fromLonLat([model.lng, model.lat])),
                applyGeometryToModel: (prev: RouteWaypoint) => prev,
              },
              style: {
                base: (model: RouteWaypoint) => ({
                  color: '#2563eb',
                  radius: 14,
                  label: String(model.orderIndex),
                  strokeColor: '#ffffff',
                }),
                states: {
                  HOVER: () => ({
                    strokeColor: '#f97316',
                  }),
                },
                render: (opts: PrimaryPointStyleOpts) => [
                  new Style({
                    image: new CircleStyle({
                      radius: opts.radius,
                      fill: new Fill({ color: opts.color }),
                      stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
                    }),
                    text: new Text({
                      text: opts.label,
                      fill: new Fill({ color: '#ffffff' }),
                      stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.45)', width: 2 }),
                      font: '700 12px "Inter", sans-serif',
                      textAlign: 'center',
                      textBaseline: 'middle',
                    }),
                  }),
                ],
              },
              interactions: {
                hover: {
                  cursor: 'pointer',
                  state: 'HOVER',
                },
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
      view: {
        centerLonLat: [27.5619, 53.9023],
        zoom: 11,
      },
      osm: true,
    };
  }
}
