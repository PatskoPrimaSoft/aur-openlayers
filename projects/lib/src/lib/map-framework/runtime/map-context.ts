import type OlMap from 'ol/Map';

import type { BatchOptions, MapContext, PopupHostApi, VectorLayerApi, ViewFitOptions } from '../public/types';
import { FlushScheduler } from './scheduler';
import { collectLayersExtent, toOlFitOptions } from './fit-layer.utils';

export const createMapContext = (
  map: OlMap,
  layers: Record<string, VectorLayerApi<any, any>>,
  popupHost?: PopupHostApi,
  scheduler: FlushScheduler = new FlushScheduler(),
): MapContext => {
  return {
    map,
    layers,
    popupHost,
    batch: (fn: () => void, options?: BatchOptions) => scheduler.batch(fn, options),
    centerOnAllLayers: (opts?: ViewFitOptions) => {
      const extent = collectLayersExtent(layers);
      if (extent) map.getView().fit(extent, toOlFitOptions(opts, map));
    },
    centerOnLayers: (layerIds: ReadonlyArray<string>, opts?: ViewFitOptions) => {
      const extent = collectLayersExtent(layers, layerIds);
      if (extent) map.getView().fit(extent, toOlFitOptions(opts, map));
    },
  };
};
