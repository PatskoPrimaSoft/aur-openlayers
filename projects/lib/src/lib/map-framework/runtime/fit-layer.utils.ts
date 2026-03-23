import {createEmpty, extend, isEmpty} from 'ol/extent';
import type {VectorLayerApi, ViewFitOptions, ViewFitPadding} from '../public/types';

/**
 * Default padding for View#fit in pixels.
 * Order: [top, right, bottom, left]
 */
const DEFAULT_OL_PADDING: [number, number, number, number] = [64, 64, 64, 64];
const DEFAULT_FIT_DURATION = 500;

export function toOlPadding(
  p?: ViewFitPadding,
  fallback: [number, number, number, number] | undefined = DEFAULT_OL_PADDING,
): [number, number, number, number] | undefined {
  if (!p) {
    return fallback;
  }

  if ('all' in p) {
    const a = p.all;
    return [a, a, a, a];
  }

  if ('vertical' in p && 'horizontal' in p) {
    return [p.vertical, p.horizontal, p.vertical, p.horizontal];
  }

  return [p.top, p.right, p.bottom, p.left];
}

export function toOlFitOptions(opts?: ViewFitOptions) {
  const padding = toOlPadding(opts?.padding) ?? DEFAULT_OL_PADDING;
  const duration = opts?.duration ?? DEFAULT_FIT_DURATION;

  // OL View#fit options are a plain object; keep it minimal & typed-friendly
  const fitOpts: any = {padding, duration};
  if (opts?.maxZoom != null) {
    fitOpts.maxZoom = opts.maxZoom;
  }
  return fitOpts;
}

export function collectLayersExtent(
  layers: Record<string, VectorLayerApi<any, any>>,
  layerIds?: ReadonlyArray<string>,
): import('ol/extent').Extent | null {
  const extent = createEmpty();
  const ids = layerIds ?? Object.keys(layers);

  for (const id of ids) {
    const layer = layers[id];
    if (!layer || !layer.isVisible()) continue;
    const layerExtent = layer.getExtent();
    if (layerExtent) {
      extend(extent, layerExtent);
    }
  }

  return isEmpty(extent) ? null : extent;
}
