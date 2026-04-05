import Feature from 'ol/Feature';
import { LineString, MultiLineString, Polygon } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type OlMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';

import type { BufferDecoration, Unsubscribe, VectorLayerApi } from '../../public/types';
import { generateBufferPolygon } from './generate-buffer-polygon';

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

export type BufferDecorationManagerOptions = {
  map: OlMap;
  parentLayer: VectorLayer;
  parentApi: VectorLayerApi<any, any>;
  config: BufferDecoration;
};

export class BufferDecorationManager {
  private readonly source = new VectorSource<Polygon>();
  private readonly layer: VectorLayer;
  private readonly config: BufferDecoration;
  private readonly map: OlMap;
  private readonly parentLayer: VectorLayer;
  private readonly parentApi: VectorLayerApi<any, any>;
  private readonly moveEndKey: EventsKey;
  private readonly unsubCollection: Unsubscribe;
  private readonly unsubChanges: Unsubscribe | undefined;
  private rafId: number | null = null;

  constructor(options: BufferDecorationManagerOptions) {
    this.config = options.config;
    this.map = options.map;
    this.parentLayer = options.parentLayer;
    this.parentApi = options.parentApi;

    const parentZ = this.parentLayer.getZIndex() ?? 0;
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: parentZ,
    });
    this.layer.set('id', '__decoration_buffer');
    this.map.addLayer(this.layer);

    this.syncVisibility();
    this.syncOpacity();

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

    const parentSource = this.parentLayer.getSource() as VectorSource<Geometry> | null;
    if (!parentSource) {
      this.source.clear();
      return;
    }

    const cap = this.config.cap ?? 'round';
    const style = this.config.style;
    const allFeatures: Feature<Polygon>[] = [];

    parentSource.getFeatures().forEach((feature) => {
      const geom = feature.getGeometry();
      if (!geom) return;
      const lines = extractLineCoords(geom);
      for (const coords of lines) {
        const ring = generateBufferPolygon(coords, this.config.distance, cap);
        if (ring.length === 0) continue;
        const f = new Feature<Polygon>({ geometry: new Polygon([ring]) });
        f.setStyle(Array.isArray(style) ? style : [style]);
        allFeatures.push(f);
      }
    });

    this.source.clear();
    if (allFeatures.length > 0) {
      this.source.addFeatures(allFeatures);
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
    this.unsubCollection();
    this.unsubChanges?.();
    this.map.removeLayer(this.layer);
  }
}
