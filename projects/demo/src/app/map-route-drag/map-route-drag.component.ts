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
import {
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { RouteWaypoint, RouteLine, RouteArrow, LAYER_ID } from './route-drag.models';
import { computeOrderIndexForClick, generateRouteArrows } from './geometry.utils';
import { fetchOsrmRoute } from './osrm.service';
import RegularShape from 'ol/style/RegularShape';

// --- Style ---

type LineStyleOpts = { color: string; width: number };

type PointStyleOpts = {
  color: string;
  radius: number;
  strokeColor: string;
  label: string;
};

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
  private arrowLayerApi?: VectorLayerApi<RouteArrow, Geometry>;
  private unsubscribes: (() => void)[] = [];
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
    this.arrowLayerApi = ctx.layers[LAYER_ID.ROUTE_ARROWS] as VectorLayerApi<RouteArrow, Geometry> | undefined;

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
    this.arrowLayerApi?.clear();
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
    this.intermediateLabels.clear();
    let lastPrimaryIndex = 0;
    let counter = 0;
    for (const wp of this.sortedWaypoints) {
      if (wp.type === 'primary') {
        lastPrimaryIndex = wp.orderIndex;
        counter = 0;
      } else {
        counter++;
        this.intermediateLabels.set(wp.id, `${lastPrimaryIndex}.${counter}`);
      }
    }
    // Force style refresh
    this.intermediateLayerApi?.setModels(this.intermediatePoints);
  }

  private async fetchRoute(): Promise<void> {
    if (this.sortedWaypoints.length < 2) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.zone.run(() => (this.loading = true));
    try {
      const result = await fetchOsrmRoute(this.sortedWaypoints, this.abortController.signal);
      if (!result) return;

      this.lastRouteCoords3857 = result.coords3857;
      this.lineLayerApi?.setModels([{ id: 'route', coordinates: result.coordsLonLat }]);
      this.arrowLayerApi?.setModels(generateRouteArrows(result.coords3857));
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
    } finally {
      this.zone.run(() => (this.loading = false));
    }
  }

  private addPrimaryPoint(lon: number, lat: number): void {
    const wp: RouteWaypoint = {
      id: this.nextId('primary'),
      lat, lng: lon,
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
      lat, lng: lon,
      orderIndex: computeOrderIndexForClick(clickCoord3857, this.sortedWaypoints, this.lastRouteCoords3857),
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
            id: LAYER_ID.ROUTE_ARROWS,
            zIndex: 2,
            feature: {
              id: (m: RouteArrow) => m.id,
              geometry: {
                fromModel: (m: RouteArrow) => new Point(fromLonLat([m.lng, m.lat])),
                applyGeometryToModel: (prev: RouteArrow) => prev,
              },
              style: {
                base: (m: RouteArrow) => ({ rotation: m.rotation }),
                render: (opts: { rotation: number }) => new Style({
                  image: new RegularShape({
                    points: 3,
                    radius: 6,
                    rotation: opts.rotation,
                    fill: new Fill({ color: '#2563eb' }),
                    stroke: new Stroke({ color: '#ffffff', width: 1 }),
                  }),
                }),
              },
            },
          },
          {
            id: LAYER_ID.INTERMEDIATE_POINTS,
            zIndex: 3,
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
                  color: '#10b981', radius: 10, strokeColor: '#ffffff',
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
                  cursor: 'grab', hitTolerance: 6, state: 'DRAG',
                  onEnd: () => { this.fetchRoute(); return true; },
                },
              },
            },
          },
          {
            id: LAYER_ID.PRIMARY_POINTS,
            zIndex: 4,
            feature: {
              id: (m: RouteWaypoint) => m.id,
              geometry: {
                fromModel: (m: RouteWaypoint) => new Point(fromLonLat([m.lng, m.lat])),
                applyGeometryToModel: (prev: RouteWaypoint) => prev,
              },
              style: {
                base: (m: RouteWaypoint): PointStyleOpts => ({
                  color: '#2563eb', radius: 14, strokeColor: '#ffffff',
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
