import Map from 'ol/Map';
import View from 'ol/View';

import type { VectorLayerApi } from '../public/types';
import { createMapContext } from './map-context';

describe('createMapContext', () => {
  const mockLayer = (
    visible: boolean,
    extent: number[] | null,
  ): VectorLayerApi<any, any> =>
    ({
      isVisible: () => visible,
      getExtent: () => extent,
    }) as unknown as VectorLayerApi<any, any>;

  const createMap = () => {
    const view = new View({ center: [0, 0], zoom: 2 });
    const fitSpy = spyOn(view, 'fit');
    const map = new Map({
      target: document.createElement('div'),
      view,
      layers: [],
    });
    return { map, view, fitSpy };
  };

  describe('centerOnAllLayers', () => {
    it('fits view to combined extent of all visible layers', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, [0, 0, 10, 10]),
        b: mockLayer(true, [20, 20, 30, 30]),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnAllLayers();

      expect(fitSpy).toHaveBeenCalledTimes(1);
      const [extent] = fitSpy.calls.mostRecent().args;
      expect(extent).toEqual([0, 0, 30, 30]);
    });

    it('is no-op when no features exist', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, null),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnAllLayers();

      expect(fitSpy).not.toHaveBeenCalled();
    });

    it('forwards ViewFitOptions', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, [0, 0, 10, 10]),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnAllLayers({ maxZoom: 12, duration: 300, padding: { all: 20 } });

      expect(fitSpy).toHaveBeenCalledTimes(1);
      const [, opts] = fitSpy.calls.mostRecent().args;
      expect(opts).toEqual({
        padding: [20, 20, 20, 20],
        duration: 300,
        maxZoom: 12,
      });
    });
  });

  describe('centerOnLayers', () => {
    it('fits view to combined extent of specified layers', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, [0, 0, 10, 10]),
        b: mockLayer(true, [50, 50, 60, 60]),
        c: mockLayer(true, [100, 100, 200, 200]),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnLayers(['a', 'b']);

      expect(fitSpy).toHaveBeenCalledTimes(1);
      const [extent] = fitSpy.calls.mostRecent().args;
      expect(extent).toEqual([0, 0, 60, 60]);
    });

    it('skips hidden layers in the selection', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, [0, 0, 10, 10]),
        b: mockLayer(false, [100, 100, 200, 200]),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnLayers(['a', 'b']);

      expect(fitSpy).toHaveBeenCalledTimes(1);
      const [extent] = fitSpy.calls.mostRecent().args;
      expect(extent).toEqual([0, 0, 10, 10]);
    });

    it('is no-op for empty layerIds array', () => {
      const { map, fitSpy } = createMap();
      const layers = {
        a: mockLayer(true, [0, 0, 10, 10]),
      };
      const ctx = createMapContext(map, layers);

      ctx.centerOnLayers([]);

      expect(fitSpy).not.toHaveBeenCalled();
    });
  });
});
