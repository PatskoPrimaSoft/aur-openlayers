import Map from 'ol/Map';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import View from 'ol/View';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';

import type { MapSchema, VectorLayerDescriptor } from '../public/types';
import { LayerManager } from './layer-manager';

type Model = { id: string; coords: [number, number] };

const createMap = () =>
  new Map({
    target: document.createElement('div'),
    view: new View({ center: [0, 0], zoom: 2 }),
    layers: [],
  });

describe('LayerManager', () => {
  it('defers invalidate to RAF when scheduler policy is raf', () => {
    const callbacks: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    spyOn(window, 'cancelAnimationFrame').and.stub();

    const schema: MapSchema<readonly VectorLayerDescriptor<any, any, any, any>[]> = {
      options: {
        scheduler: { policy: 'raf' },
      },
      layers: [
        {
          id: 'points',
          feature: {
            id: (model: Model) => model.id,
            geometry: {
              fromModel: (model) => new Point(model.coords),
              applyGeometryToModel: (prev) => prev,
            },
            style: {
              base: () => ({ color: 'red' }),
              render: () => new Style(),
            },
          },
        },
      ],
    };

    const manager = LayerManager.create(createMap(), schema);
    const layer = manager.getLayer('points');
    const api = manager.getApi('points');

    expect(layer).toBeDefined();
    expect(api).toBeDefined();

    const initialCallbacks = callbacks.length;
    const changedSpy = spyOn(layer!, 'changed').and.callThrough();
    api!.invalidate();

    expect(changedSpy).not.toHaveBeenCalled();
    expect(callbacks.length).toBe(initialCallbacks + 1);
    callbacks[callbacks.length - 1](0);
    expect(changedSpy).toHaveBeenCalledTimes(1);
  });

  it('creates decoration layer when descriptor has decorations.arrows', () => {
    const callbacks: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    spyOn(window, 'cancelAnimationFrame').and.stub();

    const schema: MapSchema<readonly VectorLayerDescriptor<any, any, any, any>[]> = {
      layers: [
        {
          id: 'route',
          zIndex: 1,
          feature: {
            id: (model: { id: string; coords: number[][] }) => model.id,
            geometry: {
              fromModel: (model: { coords: number[][] }) =>
                new LineString(model.coords),
              applyGeometryToModel: (prev: any) => prev,
            },
            style: {
              base: () => ({ w: 1 }),
              render: () => new Style(),
            },
            decorations: {
              arrows: {
                interval: 50,
                style: () => new Style(),
              },
            },
          },
        },
      ],
    };

    const map = createMap();
    const initialLayers = map.getLayers().getLength();
    const manager = LayerManager.create(map, schema);

    // LayerManager adds 1 user layer + 1 decoration layer
    expect(map.getLayers().getLength()).toBe(initialLayers + 2);

    // Decoration layer is not in the public API
    expect(manager.getApi('route')).toBeDefined();

    // Set models and flush RAF to trigger arrow generation
    manager.getApi('route')!.setModels([{ id: 'r1', coords: [[0, 0], [200, 0]] }]);
    while (callbacks.length > 0) {
      callbacks.shift()!(0);
    }

    // Cleanup
    manager.dispose();
    expect(map.getLayers().getLength()).toBe(initialLayers);
  });

  it('creates both buffer and arrow decoration layers when both are configured', () => {
    const callbacks: FrameRequestCallback[] = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    spyOn(window, 'cancelAnimationFrame').and.stub();

    const schema: MapSchema<readonly VectorLayerDescriptor<any, any, any, any>[]> = {
      layers: [
        {
          id: 'route',
          zIndex: 1,
          feature: {
            id: (model: { id: string; coords: number[][] }) => model.id,
            geometry: {
              fromModel: (model: { coords: number[][] }) =>
                new LineString(model.coords),
              applyGeometryToModel: (prev: any) => prev,
            },
            style: {
              base: () => ({ w: 1 }),
              render: () => new Style(),
            },
            decorations: {
              arrows: {
                interval: 50,
                style: () => new Style(),
              },
              buffer: {
                distance: 100,
                style: new Style({ fill: new Fill({ color: 'rgba(0,0,255,0.2)' }) }),
              },
            },
          },
        },
      ],
    };

    const map = createMap();
    const initialLayers = map.getLayers().getLength();
    const manager = LayerManager.create(map, schema);

    // 1 user layer + 1 arrow layer + 1 buffer layer = 3
    expect(map.getLayers().getLength()).toBe(initialLayers + 3);

    // Verify z-index ordering: buffer(1) < parent(2) < arrows(4)
    const layers = map.getLayers().getArray();
    const bufferLayer = layers.find((l) => l.get('id') === '__decoration_buffer');
    const arrowLayer = layers.find((l) => l.get('id') === '__decoration_arrows');
    const routeLayer = layers.find((l) => l.get('id') === 'route');
    expect(bufferLayer).toBeDefined();
    expect(arrowLayer).toBeDefined();
    expect(bufferLayer!.getZIndex()).toBe(1);   // original parentZIndex
    expect(routeLayer!.getZIndex()).toBe(2);    // parentZIndex + 1 (bumped for buffer)
    expect(arrowLayer!.getZIndex()).toBe(4);    // parentZIndex + 1 + 2 (bumped parent + 2)

    // Set models and flush to trigger generation
    manager.getApi('route')!.setModels([{ id: 'r1', coords: [[0, 0], [1000, 0]] }]);
    while (callbacks.length > 0) {
      callbacks.shift()!(0);
    }

    // Cleanup
    manager.dispose();
    expect(map.getLayers().getLength()).toBe(initialLayers);
  });
});
