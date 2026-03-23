import { Component, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type Geometry from 'ol/geom/Geometry';
import type OlMap from 'ol/Map';
import { LineString } from 'ol/geom';
import {
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { RouteWaypoint, RouteLine, RouteArrow, LAYER_ID } from './route-drag.models';
import { computeOrderIndexForClick, generateRouteArrows } from './geometry.utils';
import { fetchOsrmRoute } from './osrm.service';
import { buildMapConfig } from './route-drag.schema';

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

  readonly mapConfig: MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]>;

  private waypointCounter = 0;
  private abortController: AbortController | null = null;
  private primaryLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private intermediateLayerApi?: VectorLayerApi<RouteWaypoint, Geometry>;
  private lineLayerApi?: VectorLayerApi<RouteLine, LineString>;
  private arrowLayerApi?: VectorLayerApi<RouteArrow, Geometry>;
  private unsubscribes: (() => void)[] = [];
  private lastRouteCoords3857: number[][] = [];
  private map?: OlMap;

  constructor(private readonly zone: NgZone) {
    this.mapConfig = buildMapConfig({
      getPhase: () => this.phase,
      getIntermediateLabel: (id) => this.getIntermediateLabel(id),
      onClickMap: (lon, lat) => this.zone.run(() => this.addPrimaryPoint(lon, lat)),
      onClickMapIntermediate: (lon, lat, c) => this.zone.run(() => this.addIntermediatePoint(lon, lat, c)),
      onTranslateEnd: () => this.fetchRoute(),
    });
  }

  getIntermediateLabel(id: string): string {
    let lastPrimaryIndex = 0;
    let counter = 0;
    for (const wp of this.sortedWaypoints) {
      if (wp.type === 'primary') {
        lastPrimaryIndex = wp.orderIndex;
        counter = 0;
      } else {
        counter++;
        if (wp.id === id) return `${lastPrimaryIndex}.${counter}`;
      }
    }
    return '';
  }

  onReady(ctx: MapContext): void {
    this.primaryLayerApi = ctx.layers[LAYER_ID.PRIMARY_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.intermediateLayerApi = ctx.layers[LAYER_ID.INTERMEDIATE_POINTS] as VectorLayerApi<RouteWaypoint, Geometry> | undefined;
    this.lineLayerApi = ctx.layers[LAYER_ID.ROUTE_LINE] as VectorLayerApi<RouteLine, LineString> | undefined;
    this.arrowLayerApi = ctx.layers[LAYER_ID.ROUTE_ARROWS] as VectorLayerApi<RouteArrow, Geometry> | undefined;
    this.map = ctx.map;

    ctx.map.on('moveend', () => this.updateArrows());

    const syncPoints = (
      list: () => RouteWaypoint[],
      set: (pts: RouteWaypoint[]) => void,
    ) => (changes: { next: RouteWaypoint }[]) => {
      this.zone.run(() => {
        let pts = list();
        changes.forEach(({ next }) => { pts = pts.map(p => p.id === next.id ? next : p); });
        set(pts);
        this.rebuildSorted();
      });
    };

    const unsub1 = this.primaryLayerApi?.onModelsChanged?.(
      syncPoints(() => this.primaryPoints, pts => this.primaryPoints = pts),
    );
    const unsub2 = this.intermediateLayerApi?.onModelsChanged?.(
      syncPoints(() => this.intermediatePoints, pts => this.intermediatePoints = pts),
    );
    if (unsub1) this.unsubscribes.push(unsub1);
    if (unsub2) this.unsubscribes.push(unsub2);
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
    this.arrowLayerApi?.clear();
    this.rebuildSorted();
  }

  removePoint(id: string): void {
    if (this.primaryPoints.some(p => p.id === id)) {
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
      this.primaryPoints.length + this.intermediatePoints.length >= 2
        ? this.fetchRoute()
        : this.resetRoute();
    }
  }

  ngOnDestroy(): void {
    this.unsubscribes.forEach(fn => fn());
    this.abortController?.abort();
  }

  // --- Private ---

  private rebuildSorted(): void {
    this.sortedWaypoints = [...this.primaryPoints, ...this.intermediatePoints]
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  private updateArrows(): void {
    if (this.lastRouteCoords3857.length < 2) return;
    const resolution = this.map?.getView().getResolution() ?? 1;
    this.arrowLayerApi?.setModels(generateRouteArrows(this.lastRouteCoords3857, Math.max(100, resolution * 80)));
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
      this.updateArrows();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
    } finally {
      this.zone.run(() => (this.loading = false));
    }
  }

  private addPrimaryPoint(lon: number, lat: number): void {
    const wp: RouteWaypoint = {
      id: `primary-${++this.waypointCounter}`,
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
      id: `intermediate-${++this.waypointCounter}`,
      lat, lng: lon,
      orderIndex: computeOrderIndexForClick(clickCoord3857, this.sortedWaypoints, this.lastRouteCoords3857),
      type: 'intermediate',
    };
    this.intermediatePoints = [...this.intermediatePoints, wp];
    this.intermediateLayerApi?.addModel(wp);
    this.rebuildSorted();
    this.fetchRoute();
  }
}
