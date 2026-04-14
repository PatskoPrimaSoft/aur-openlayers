import Feature from 'ol/Feature';
import { LineString, MultiLineString, Point } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type OlMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';

import type {
  ArrowDecoration,
  MaybeFn,
  StyleView,
  Unsubscribe,
  VectorLayerApi,
} from '../../public/types';

type ArrowPoint = {
  coordinate: [number, number];
  rotation: number;
};

const resolveMaybeFn = <T, A extends any[]>(value: MaybeFn<T, A>, args: A): T =>
  typeof value === 'function' ? (value as (...a: A) => T)(...args) : value;

/**
 * Extracts flat coordinate arrays from a feature's geometry.
 * Supports LineString and MultiLineString; returns empty array for others.
 */
function extractLineCoords(geometry: Geometry): number[][][] {
  if (geometry instanceof LineString) {
    return [geometry.getCoordinates()];
  }
  if (geometry instanceof MultiLineString) {
    return geometry.getCoordinates();
  }
  return [];
}

/**
 * Generate arrow points along a polyline at a given interval (meters in EPSG:3857).
 */
function generateArrowPoints(
  coords: number[][],
  intervalMeters: number,
  offsetRatio: number,
): ArrowPoint[] {
  if (coords.length < 2 || intervalMeters <= 0) return [];

  const arrows: ArrowPoint[] = [];
  let accumulated = intervalMeters * offsetRatio;

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0], ay = coords[i][1];
    const bx = coords[i + 1][0], by = coords[i + 1][1];
    const segLen = Math.hypot(bx - ax, by - ay);
    const rotation = Math.atan2(bx - ax, by - ay);

    while (accumulated <= segLen) {
      const t = accumulated / segLen;
      arrows.push({
        coordinate: [ax + t * (bx - ax), ay + t * (by - ay)],
        rotation,
      });
      accumulated += intervalMeters;
    }
    accumulated -= segLen;
  }

  return arrows;
}

export type ArrowDecorationManagerOptions = {
  map: OlMap;
  parentLayer: VectorLayer;
  parentApi: VectorLayerApi<any, any>;
  config: ArrowDecoration;
};

export class ArrowDecorationManager {
  private readonly source = new VectorSource<Point>();
  private readonly layer: VectorLayer;
  private readonly config: ArrowDecoration;
  private readonly map: OlMap;
  private readonly parentLayer: VectorLayer;
  private readonly parentApi: VectorLayerApi<any, any>;
  private readonly moveEndKey: EventsKey;
  private readonly visibilityKey: EventsKey;
  private readonly unsubCollection: Unsubscribe;
  private readonly unsubChanges: Unsubscribe | undefined;
  private rafId: number | null = null;

  constructor(options: ArrowDecorationManagerOptions) {
    this.config = options.config;
    this.map = options.map;
    this.parentLayer = options.parentLayer;
    this.parentApi = options.parentApi;

    const parentZ = this.parentLayer.getZIndex() ?? 0;
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: parentZ + 2,
    });
    this.layer.set('id', `__decoration_arrows`);
    this.map.addLayer(this.layer);

    this.syncVisibility();
    this.syncOpacity();

    this.visibilityKey = this.parentLayer.on('change:visible', () => this.syncVisibility());
    this.moveEndKey = this.map.on('moveend', () => this.scheduleUpdate());

    this.unsubCollection = this.parentApi.onModelsCollectionChanged(() => this.scheduleUpdate());
    this.unsubChanges = this.parentApi.onModelsChanged?.(() => this.scheduleUpdate());
  }

  private scheduleUpdate(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.rebuild();
    });
  }

  private rebuild(): void {
    this.syncVisibility();
    this.syncOpacity();

    if (!this.parentLayer.getVisible()) {
      this.source.clear();
      return;
    }

    const view = this.map.getView();
    const resolution = view.getResolution() ?? 1;
    const styleView: StyleView = { resolution, zoom: view.getZoom() };
    const interval = resolveMaybeFn(this.config.interval, [styleView]);
    const offsetRatio = this.config.offsetRatio ?? 0.5;

    const parentSource = this.parentLayer.getSource() as VectorSource<Geometry> | null;
    if (!parentSource) {
      this.source.clear();
      return;
    }

    const allArrows: ArrowPoint[] = [];
    parentSource.getFeatures().forEach((feature) => {
      const geom = feature.getGeometry();
      if (!geom) return;
      const lines = extractLineCoords(geom);
      for (const coords of lines) {
        const arrows = generateArrowPoints(coords, interval, offsetRatio);
        allArrows.push(...arrows);
      }
    });

    const features = allArrows.map((arrow, i) => {
      const f = new Feature<Point>({ geometry: new Point(arrow.coordinate) });
      f.setId(`__arrow_${i}`);
      const styleResult = this.config.style({ rotation: arrow.rotation, view: styleView });
      f.setStyle(Array.isArray(styleResult) ? styleResult : [styleResult]);
      return f;
    });

    this.source.clear();
    if (features.length > 0) {
      this.source.addFeatures(features);
    }
  }

  private syncVisibility(): void {
    this.layer.setVisible(this.parentLayer.getVisible());
  }

  private syncOpacity(): void {
    this.layer.setOpacity(this.parentLayer.getOpacity());
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    unByKey(this.moveEndKey);
    unByKey(this.visibilityKey);
    this.unsubCollection();
    this.unsubChanges?.();
    this.map.removeLayer(this.layer);
  }
}
