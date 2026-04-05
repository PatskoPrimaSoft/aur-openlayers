import VectorLayer from 'ol/layer/Vector';
import ClusterSource from 'ol/source/Cluster';
import VectorSource from 'ol/source/Vector';
import type OlMap from 'ol/Map';

import type {
  MapContext,
  MapSchema,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../public/types';
import { createMapContext } from './map-context';
import { InteractionManager } from './interaction-manager';
import { ClusteredVectorLayer } from './clustered-layer';
import { PlainVectorLayer } from './plain-layer';
import { PopupHost } from './popup-host';
import { FlushScheduler } from './scheduler';
import { ArrowDecorationManager } from './decorations/arrow-decoration-manager';
import { BufferDecorationManager } from './decorations/buffer-decoration-manager';

export class LayerManager<Layers extends readonly VectorLayerDescriptor<any, any, any, any>[]> {
  private readonly layers: Record<string, VectorLayer> = {};
  private readonly apis: Record<string, VectorLayerApi<any, any>> = {};
  private readonly interactions: InteractionManager<Layers>;
  private readonly scheduler: FlushScheduler;
  private readonly popupHost: PopupHost | undefined;
  private readonly ctx: MapContext;
  private readonly decorationManagers: (ArrowDecorationManager | BufferDecorationManager)[] = [];

  private constructor(private readonly map: OlMap, schema: MapSchema<Layers>) {
    const popupHost = schema.options?.popupHost ? new PopupHost(schema.options.popupHost) : undefined;
    const scheduler = new FlushScheduler(schema.options?.scheduler?.policy ?? 'microtask');
    this.scheduler = scheduler;
    this.popupHost = popupHost;
    const ctx = createMapContext(this.map, this.apis, popupHost, scheduler);
    this.ctx = ctx;

    schema.layers.forEach((descriptor) => {
      const source = new VectorSource<any>();
      const clusterSource = descriptor.clustering
        ? new ClusterSource({
            source,
            distance: descriptor.clustering.distance,
          })
        : null;
      const layer = new VectorLayer({ source });
      if (descriptor.zIndex !== undefined) {
        layer.setZIndex(descriptor.zIndex);
      }
      if (descriptor.visibleByDefault !== undefined) {
        layer.setVisible(descriptor.visibleByDefault);
      }
      if (descriptor.title) {
        layer.set('title', descriptor.title);
      }
      layer.set('id', descriptor.id);

      const scheduleInvalidate = () => scheduler.schedule(layer, () => layer.changed());
      const api = descriptor.clustering
        ? new ClusteredVectorLayer({
            descriptor,
            layer,
            source,
            clusterSource: clusterSource!,
            ctx,
            scheduleInvalidate,
          })
        : new PlainVectorLayer({
            descriptor,
            layer,
            source,
            ctx,
            scheduleInvalidate,
          });

      this.layers[descriptor.id] = layer;
      this.apis[descriptor.id] = api;
      this.map.addLayer(layer);

      if (descriptor.feature.decorations?.buffer) {
        const bufferManager = new BufferDecorationManager({
          map: this.map,
          parentLayer: layer,
          parentApi: api,
          config: descriptor.feature.decorations.buffer,
        });
        this.decorationManagers.push(bufferManager);
        layer.setZIndex((descriptor.zIndex ?? 0) + 1);
      }

      if (descriptor.feature.decorations?.arrows) {
        const decorationManager = new ArrowDecorationManager({
          map: this.map,
          parentLayer: layer,
          parentApi: api,
          config: descriptor.feature.decorations.arrows,
        });
        this.decorationManagers.push(decorationManager);
      }
    });

    this.interactions = new InteractionManager({
      ctx,
      map: this.map,
      schema,
      layers: this.layers,
      apis: this.apis,
    });
  }

  static create<Layers extends readonly VectorLayerDescriptor<any, any, any, any>[]>(
    map: OlMap,
    schema: MapSchema<Layers>,
  ): LayerManager<Layers> {
    return new LayerManager(map, schema);
  }

  getLayer(id: string): VectorLayer | undefined {
    return this.layers[id];
  }

  getApi(id: string): VectorLayerApi<any, any> | undefined {
    return this.apis[id];
  }

  getApis(): Record<string, VectorLayerApi<any, any>> {
    return { ...this.apis };
  }

  getContext(): MapContext {
    return this.ctx;
  }

  refreshEnabled(): void {
    this.interactions.refreshEnabled();
  }

  dispose(): void {
    this.interactions.dispose();
    this.popupHost?.dispose();
    this.scheduler.dispose();
    this.decorationManagers.forEach((dm) => dm.dispose());
    Object.values(this.layers).forEach((layer) => this.map.removeLayer(layer));
  }
}
