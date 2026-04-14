import Feature from 'ol/Feature';
import { LineString, MultiLineString, Point } from 'ol/geom';
import Map from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';

import type { MapContext, VectorLayerDescriptor } from '../../public/types';
import { createMapContext } from '../map-context';
import { PlainVectorLayer } from '../plain-layer';
import { ArrowDecorationManager } from './arrow-decoration-manager';

type LineModel = { id: string; coords: number[][] };

const createTestSetup = () => {
  const map = new Map({
    target: document.createElement('div'),
    view: new View({ center: [0, 0], zoom: 10, resolution: 10 }),
    layers: [],
  });

  const source = new VectorSource<LineString>();
  const parentLayer = new VectorLayer({ source, zIndex: 5 });
  map.addLayer(parentLayer);

  const descriptor: VectorLayerDescriptor<LineModel, LineString, { w: number }> = {
    id: 'lines',
    zIndex: 5,
    feature: {
      id: (m) => m.id,
      geometry: {
        fromModel: (m) => new LineString(m.coords),
        applyGeometryToModel: (prev) => prev,
      },
      style: {
        base: () => ({ w: 1 }),
        render: () => new Style(),
      },
    },
  };

  const ctx = createMapContext(map, {});
  const api = new PlainVectorLayer({ descriptor, layer: parentLayer, source, ctx, scheduleInvalidate: () => {} });

  return { map, parentLayer, source, api, ctx };
};

const dummyStyle = () =>
  new Style({ image: new CircleStyle({ radius: 3, fill: new Fill({ color: 'red' }) }) });

describe('ArrowDecorationManager', () => {
  let callbacks: FrameRequestCallback[];

  beforeEach(() => {
    callbacks = [];
    spyOn(window, 'requestAnimationFrame').and.callFake((cb) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    spyOn(window, 'cancelAnimationFrame').and.stub();
  });

  const flushRAF = () => {
    while (callbacks.length > 0) {
      callbacks.shift()!(0);
    }
  };

  it('creates an internal layer with zIndex = parent + 2', () => {
    const { map, parentLayer, api } = createTestSetup();
    const initialLayerCount = map.getLayers().getLength();

    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 100,
        style: () => dummyStyle(),
      },
    });

    expect(map.getLayers().getLength()).toBe(initialLayerCount + 1);
    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    expect(arrowLayer.getZIndex()).toBe(7);

    manager.dispose();
  });

  it('generates arrows along a LineString when models are set', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 50,
        style: ({ rotation }) => dummyStyle(),
        offsetRatio: 0,
      },
    });

    // A horizontal line 200 meters long (in EPSG:3857 units ≈ meters near equator)
    api.setModels([{ id: 'line1', coords: [[0, 0], [200, 0]] }]);
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const arrowSource = arrowLayer.getSource() as VectorSource<Point>;
    const arrowFeatures = arrowSource.getFeatures();

    // 200m line with 50m interval and 0 offset: arrows at 0, 50, 100, 150, 200 => 5 arrows
    expect(arrowFeatures.length).toBe(5);

    manager.dispose();
  });

  it('clears arrows when parent layer has no features', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 50,
        style: () => dummyStyle(),
        offsetRatio: 0,
      },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [200, 0]] }]);
    flushRAF();

    api.clear();
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const arrowSource = arrowLayer.getSource() as VectorSource<Point>;
    expect(arrowSource.getFeatures().length).toBe(0);

    manager.dispose();
  });

  it('supports interval as a function of view', () => {
    const { map, parentLayer, api } = createTestSetup();
    const intervalSpy = jasmine.createSpy('interval').and.callFake(
      (view: { resolution: number }) => view.resolution * 10,
    );

    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: intervalSpy,
        style: () => dummyStyle(),
      },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [1000, 0]] }]);
    flushRAF();

    expect(intervalSpy).toHaveBeenCalled();
    const arg = intervalSpy.calls.mostRecent().args[0];
    expect(arg.resolution).toBeDefined();
    expect(arg.zoom).toBeDefined();

    manager.dispose();
  });

  it('syncs visibility with parent layer', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 100,
        style: () => dummyStyle(),
      },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [500, 0]] }]);
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;

    parentLayer.setVisible(false);
    expect(arrowLayer.getVisible()).toBe(false);

    parentLayer.setVisible(true);
    expect(arrowLayer.getVisible()).toBe(true);

    manager.dispose();
  });

  it('handles MultiLineString geometry', () => {
    const { map, parentLayer, source } = createTestSetup();
    const ctx = createMapContext(map, {});

    const multiDescriptor: VectorLayerDescriptor<LineModel, MultiLineString, { w: number }> = {
      id: 'multi',
      zIndex: 5,
      feature: {
        id: (m) => m.id,
        geometry: {
          fromModel: (m) => new MultiLineString([m.coords, m.coords.map(c => [c[0] + 500, c[1]])]),
          applyGeometryToModel: (prev) => prev,
        },
        style: { base: () => ({ w: 1 }), render: () => new Style() },
      },
    };

    const multiSource = new VectorSource<MultiLineString>();
    const multiParent = new VectorLayer({ source: multiSource, zIndex: 5 });
    map.addLayer(multiParent);
    const multiApi = new PlainVectorLayer({
      descriptor: multiDescriptor as any,
      layer: multiParent,
      source: multiSource as any,
      ctx,
      scheduleInvalidate: () => {},
    });

    const manager = new ArrowDecorationManager({
      map,
      parentLayer: multiParent,
      parentApi: multiApi,
      config: {
        interval: 50,
        style: () => dummyStyle(),
        offsetRatio: 0,
      },
    });

    multiApi.setModels([{ id: 'ml1', coords: [[0, 0], [200, 0]] }]);
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const arrowSource = arrowLayer.getSource() as VectorSource<Point>;
    // Two sub-lines of 200m each, 50m interval, offset 0 => 5 arrows each => 10 total
    expect(arrowSource.getFeatures().length).toBe(10);

    manager.dispose();
  });

  it('removes internal layer on dispose', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 100,
        style: () => dummyStyle(),
      },
    });

    const layerCount = map.getLayers().getLength();
    manager.dispose();
    expect(map.getLayers().getLength()).toBe(layerCount - 1);
  });

  it('does not generate arrows for lines shorter than interval', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new ArrowDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: {
        interval: 500,
        style: () => dummyStyle(),
        offsetRatio: 0.5,
      },
    });

    // Line is 100m, interval is 500m => first arrow at 250m, no arrows
    api.setModels([{ id: 'short', coords: [[0, 0], [100, 0]] }]);
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const arrowSource = arrowLayer.getSource() as VectorSource<Point>;
    expect(arrowSource.getFeatures().length).toBe(0);

    manager.dispose();
  });
});
