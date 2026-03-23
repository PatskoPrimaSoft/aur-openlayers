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
  dash: number[];
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
  routeCoordinates: [number, number][] = [];
  loading = false;

  private abortController: AbortController | null = null;
  private primaryLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private intermediateLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private lineLayerApi?: VectorLayerApi<RouteLine, LineString>;
  private unsubscribes: (() => void)[] = [];
  private polylineFormat = new Polyline();

  readonly mapConfig: MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]>;

  get allWaypointsSorted(): RouteWaypoint[] {
    return [...this.primaryPoints, ...this.intermediatePoints]
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  constructor(private readonly zone: NgZone) {
    this.mapConfig = this.buildMapConfig();
  }

  // --- Public methods (called from template) ---

  onReady(ctx: MapContext): void {
    this.primaryLayerApi = ctx.layers[LAYER_ID.PRIMARY_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.intermediateLayerApi = ctx.layers[LAYER_ID.INTERMEDIATE_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.lineLayerApi = ctx.layers[LAYER_ID.ROUTE_LINE] as VectorLayerApi<RouteLine, LineString> | undefined;

    // Subscribe to model changes for intermediate points (translate)
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
    this.routeCoordinates = [];
    this.intermediateLayerApi?.clear();
    this.lineLayerApi?.clear();
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
        return;
      }

      const encodedPolyline = data.routes[0].geometry;
      const lineGeom = this.polylineFormat.readGeometry(encodedPolyline, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as LineString;
      const coords3857 = lineGeom.getCoordinates();
      const coordsLonLat = coords3857.map((c) => toLonLat(c) as [number, number]);

      this.zone.run(() => {
        this.routeCoordinates = coordsLonLat;
        this.loading = false;
      });

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

  // --- Vertex detection after modify ---

  private findInsertedVertex(newCoords: [number, number][]): { coord: [number, number]; segmentIndex: number } | null {
    const oldCoords = this.routeCoordinates;
    if (newCoords.length <= oldCoords.length) return null;

    // Find the first coordinate that doesn't match the old set
    // The modify interaction inserts exactly one vertex
    for (let i = 0; i < newCoords.length; i++) {
      const oldIdx = i >= oldCoords.length ? -1 : i;
      if (oldIdx === -1 || newCoords[i][0] !== oldCoords[i][0] || newCoords[i][1] !== oldCoords[i][1]) {
        // This is the inserted vertex. The segment index is i (between old[i-1] and old[i])
        return { coord: newCoords[i], segmentIndex: i };
      }
    }
    return null;
  }

  private computeOrderIndexForSegment(segmentIndex: number): number {
    // Find which two waypoints this segment falls between
    // Map the segment index to approximate position along the route
    const waypoints = this.allWaypointsSorted;
    if (waypoints.length < 2) return 0.5;

    const totalRoutePoints = this.routeCoordinates.length;
    if (totalRoutePoints === 0) return waypoints[0].orderIndex + 0.5;

    // Approximate: segment position relative to total route length
    const fraction = segmentIndex / totalRoutePoints;
    const approxWaypointIdx = fraction * (waypoints.length - 1);
    const lowerIdx = Math.floor(approxWaypointIdx);
    const upperIdx = Math.min(lowerIdx + 1, waypoints.length - 1);

    const lower = waypoints[lowerIdx].orderIndex;
    const upper = waypoints[upperIdx].orderIndex;
    return (lower + upper) / 2;
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

  private removePrimaryPoint(id: string): void {
    this.primaryPoints = this.primaryPoints.filter((p) => p.id !== id);
    this.primaryLayerApi?.removeModelsById([id]);

    // Renumber remaining primary points
    this.primaryPoints = this.primaryPoints.map((p, i) => ({ ...p, orderIndex: i + 1 }));
    this.primaryLayerApi?.setModels(this.primaryPoints);
  }

  private addIntermediatePoint(lon: number, lat: number, orderIndex: number): void {
    const wp: RouteWaypoint = {
      id: nextWaypointId('intermediate'),
      lat,
      lng: lon,
      orderIndex,
      type: 'intermediate',
    };
    this.intermediatePoints = [...this.intermediatePoints, wp];
    this.intermediateLayerApi?.addModel(wp);
  }

  private removeIntermediatePoint(id: string): void {
    this.intermediatePoints = this.intermediatePoints.filter((p) => p.id !== id);
    this.intermediateLayerApi?.removeModelsById([id]);
  }

  private removeAnyPoint(id: string): void {
    const primary = this.primaryPoints.find((p) => p.id === id);
    if (primary) {
      this.removePrimaryPoint(id);
    } else {
      this.removeIntermediatePoint(id);
    }

    const totalRemaining = this.primaryPoints.length + this.intermediatePoints.length;
    if (this.phase === 'routed') {
      if (totalRemaining >= 2) {
        this.fetchRoute();
      } else {
        this.resetRoute();
      }
    }
  }

  // --- Schema builder ---

  private buildMapConfig(): MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]> {
    return {
      schema: {
        layers: [
          // Layer 1: Route line
          {
            id: LAYER_ID.ROUTE_LINE,
            zIndex: 1,
            feature: {
              id: (model: RouteLine) => model.id,
              geometry: {
                fromModel: (model: RouteLine) =>
                  new LineString(model.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
                applyGeometryToModel: (prev: RouteLine) => prev, // no-op: geometry managed via OSRM
              },
              style: {
                base: () => ({
                  color: '#2563eb',
                  width: 4,
                  dash: [] as number[],
                }),
                states: {
                  MODIFY: () => ({
                    width: 5,
                    dash: [12, 8],
                  }),
                },
                render: (opts: LineStyleOpts) =>
                  new Style({
                    stroke: new Stroke({
                      color: opts.color,
                      width: opts.width,
                      ...(opts.dash.length ? { lineDash: opts.dash } : {}),
                    }),
                  }),
              },
              interactions: {
                modify: {
                  enabled: () => this.phase === 'routed',
                  cursor: 'grab',
                  hitTolerance: 10,
                  state: 'MODIFY',
                  vertexStyle: new Style({
                    image: new CircleStyle({
                      radius: 6,
                      fill: new Fill({ color: '#ffffff' }),
                      stroke: new Stroke({ color: '#2563eb', width: 2 }),
                    }),
                  }),
                  onEnd: ({ item }) => {
                    const geom = item.feature.getGeometry() as LineString;
                    const newCoords3857 = geom.getCoordinates();
                    const newCoordsLonLat = newCoords3857.map((c) => toLonLat(c) as [number, number]);

                    const inserted = this.findInsertedVertex(newCoordsLonLat);
                    if (inserted) {
                      const orderIndex = this.computeOrderIndexForSegment(inserted.segmentIndex);
                      this.zone.run(() => {
                        this.addIntermediatePoint(inserted.coord[0], inserted.coord[1], orderIndex);
                      });
                      this.fetchRoute();
                    }
                    return true;
                  },
                },
              },
            },
          },

          // Layer 2: Intermediate points
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
                base: () => ({
                  color: '#10b981',
                  radius: 8,
                  strokeColor: '#ffffff',
                }),
                states: {
                  DRAG: () => ({
                    color: '#f97316',
                    radius: 9,
                  }),
                  HOVER: () => ({
                    strokeColor: '#f97316',
                  }),
                },
                render: (opts: IntermediatePointStyleOpts) =>
                  new Style({
                    image: new CircleStyle({
                      radius: opts.radius,
                      fill: new Fill({ color: opts.color }),
                      stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
                    }),
                  }),
              },
              interactions: {
                hover: {
                  cursor: 'pointer',
                  state: 'HOVER',
                },
                doubleClick: {
                  onDoubleClick: ({ items }) => {
                    const model = items[0]?.model;
                    if (model) {
                      this.zone.run(() => this.removeAnyPoint(model.id));
                    }
                    return true;
                  },
                },
                translate: {
                  enabled: () => this.phase === 'routed',
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

          // Layer 3: Primary points
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
                      // Click on empty space — add point
                      const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                      this.zone.run(() => this.addPrimaryPoint(lng, lat));
                    }
                    return true;
                  },
                },
                doubleClick: {
                  onDoubleClick: ({ items }) => {
                    const model = items[0]?.model;
                    if (model) {
                      this.zone.run(() => this.removeAnyPoint(model.id));
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
