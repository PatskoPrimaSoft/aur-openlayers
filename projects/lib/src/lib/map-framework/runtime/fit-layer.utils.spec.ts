import {toOlFitOptions, collectLayersExtent} from './fit-layer.utils';
import type {VectorLayerApi} from '../public/types';

describe('toOlFitOptions', () => {
  it('returns defaults when opts is undefined', () => {
    expect(toOlFitOptions()).toEqual({
      padding: [64, 64, 64, 64],
      duration: 500,
    });
  });

  it('uses default padding when padding is not provided', () => {
    expect(toOlFitOptions({ duration: 123 })).toEqual({
      padding: [64, 64, 64, 64],
      duration: 123,
    });
  });

  it('converts padding {all} to [t,r,b,l]', () => {
    expect(toOlFitOptions({ padding: { all: 10 } })).toEqual({
      padding: [10, 10, 10, 10],
      duration: 500,
    });
  });

  it('converts padding {vertical,horizontal} to [t,r,b,l]', () => {
    expect(toOlFitOptions({ padding: { vertical: 12, horizontal: 7 } })).toEqual({
      padding: [12, 7, 12, 7],
      duration: 500,
    });
  });

  it('converts padding {top,right,bottom,left} to [t,r,b,l]', () => {
    expect(
      toOlFitOptions({ padding: { top: 1, right: 2, bottom: 3, left: 4 } }),
    ).toEqual({
      padding: [1, 2, 3, 4],
      duration: 500,
    });
  });

  it('passes maxZoom when provided', () => {
    expect(toOlFitOptions({ maxZoom: 16 })).toEqual({
      padding: [64, 64, 64, 64],
      duration: 500,
      maxZoom: 16,
    });
  });

  it('does not include maxZoom when it is null/undefined', () => {
    expect(toOlFitOptions({ maxZoom: undefined })).toEqual({
      padding: [64, 64, 64, 64],
      duration: 500,
    });

    // as any to simulate a runtime null (TS type is number | undefined)
    expect(toOlFitOptions({ maxZoom: null } as any)).toEqual({
      padding: [64, 64, 64, 64],
      duration: 500,
    });
  });

  it('allows duration=0 (no animation)', () => {
    expect(toOlFitOptions({ duration: 0 })).toEqual({
      padding: [64, 64, 64, 64],
      duration: 0,
    });
  });
});

describe('collectLayersExtent', () => {
  type Extent4 = [number, number, number, number];
  const mockLayer = (visible: boolean, extent: Extent4 | null): Pick<VectorLayerApi<any, any>, 'isVisible' | 'getExtent'> => ({
    isVisible: () => visible,
    getExtent: () => extent,
  });
  const asLayers = (obj: Record<string, Pick<VectorLayerApi<any, any>, 'isVisible' | 'getExtent'>>) =>
    obj as unknown as Record<string, VectorLayerApi<any, any>>;

  it('aggregates extents from multiple visible layers', () => {
    const layers = asLayers({
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(true, [20, 20, 30, 30]),
    });

    expect(collectLayersExtent(layers)).toEqual([0, 0, 30, 30]);
  });

  it('skips hidden layers', () => {
    const layers = asLayers({
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(false, [100, 100, 200, 200]),
    });

    expect(collectLayersExtent(layers)).toEqual([0, 0, 10, 10]);
  });

  it('ignores non-existent layerIds', () => {
    const layers = asLayers({
      a: mockLayer(true, [0, 0, 10, 10]),
    });

    expect(collectLayersExtent(layers, ['a', 'missing'])).toEqual([0, 0, 10, 10]);
  });

  it('returns null for empty layerIds array', () => {
    const layers = asLayers({
      a: mockLayer(true, [0, 0, 10, 10]),
    });

    expect(collectLayersExtent(layers, [])).toBeNull();
  });

  it('returns null when all layers have no features', () => {
    const layers = asLayers({
      a: mockLayer(true, null),
      b: mockLayer(true, null),
    });

    expect(collectLayersExtent(layers)).toBeNull();
  });

  it('returns null when all layers are hidden', () => {
    const layers = asLayers({
      a: mockLayer(false, [0, 0, 10, 10]),
    });

    expect(collectLayersExtent(layers)).toBeNull();
  });

  it('uses only specified layerIds when provided', () => {
    const layers = asLayers({
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(true, [50, 50, 60, 60]),
    });

    expect(collectLayersExtent(layers, ['b'])).toEqual([50, 50, 60, 60]);
  });
});
