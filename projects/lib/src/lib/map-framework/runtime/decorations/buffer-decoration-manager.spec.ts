import Feature from 'ol/Feature';
import { LineString, MultiLineString, Polygon } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import Map from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';

import type { VectorLayerDescriptor } from '../../public/types';
import { createMapContext } from '../map-context';
import { PlainVectorLayer } from '../plain-layer';
import { BufferDecorationManager } from './buffer-decoration-manager';

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

const bufferStyle = new Style({ fill: new Fill({ color: 'rgba(0,0,255,0.2)' }) });

describe('BufferDecorationManager', () => {
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

  it('creates an internal layer with zIndex = parent (below parent)', () => {
    const { map, parentLayer, api } = createTestSetup();
    const initialLayerCount = map.getLayers().getLength();

    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    expect(map.getLayers().getLength()).toBe(initialLayerCount + 1);
    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    expect(bufferLayer.getZIndex()).toBe(5); // same as parent
    expect(bufferLayer.get('id')).toBe('__decoration_buffer');

    manager.dispose();
  });

  it('generates buffer polygons when models are set', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [1000, 0]] }]);
    flushRAF();

    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const bufferSource = bufferLayer.getSource() as VectorSource<Geometry>;
    const features = bufferSource.getFeatures();

    expect(features.length).toBe(1);
    expect(features[0].getGeometry()).toBeInstanceOf(Polygon);

    manager.dispose();
  });

  it('clears buffer when parent has no features', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [1000, 0]] }]);
    flushRAF();

    api.clear();
    flushRAF();

    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const bufferSource = bufferLayer.getSource() as VectorSource<Geometry>;
    expect(bufferSource.getFeatures().length).toBe(0);

    manager.dispose();
  });

  it('syncs visibility with parent layer', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [500, 0]] }]);
    flushRAF();

    parentLayer.setVisible(false);
    api.setModels([{ id: 'line1', coords: [[0, 0], [500, 0]] }]);
    flushRAF();

    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    expect(bufferLayer.getVisible()).toBe(false);

    const bufferSource = bufferLayer.getSource() as VectorSource<Geometry>;
    expect(bufferSource.getFeatures().length).toBe(0);

    manager.dispose();
  });

  it('handles MultiLineString — one polygon per sub-line', () => {
    const { map, parentLayer, source } = createTestSetup();
    const ctx = createMapContext(map, {});

    const multiDescriptor: VectorLayerDescriptor<LineModel, MultiLineString, { w: number }> = {
      id: 'multi',
      zIndex: 5,
      feature: {
        id: (m) => m.id,
        geometry: {
          fromModel: (m) => new MultiLineString([m.coords, m.coords.map((c: number[]) => [c[0] + 500, c[1]])]),
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

    const manager = new BufferDecorationManager({
      map,
      parentLayer: multiParent,
      parentApi: multiApi,
      config: { distance: 100, style: bufferStyle },
    });

    multiApi.setModels([{ id: 'ml1', coords: [[0, 0], [1000, 0]] }]);
    flushRAF();

    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const bufferSource = bufferLayer.getSource() as VectorSource<Geometry>;
    expect(bufferSource.getFeatures().length).toBe(2);

    manager.dispose();
  });

  it('removes internal layer on dispose', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    const layerCount = map.getLayers().getLength();
    manager.dispose();
    expect(map.getLayers().getLength()).toBe(layerCount - 1);
  });

  it('uses round cap by default', () => {
    const { map, parentLayer, api } = createTestSetup();
    const manager = new BufferDecorationManager({
      map,
      parentLayer,
      parentApi: api,
      config: { distance: 100, style: bufferStyle },
    });

    api.setModels([{ id: 'line1', coords: [[0, 0], [1000, 0]] }]);
    flushRAF();

    const bufferLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    const bufferSource = bufferLayer.getSource() as VectorSource<Geometry>;
    const geom = bufferSource.getFeatures()[0].getGeometry() as Polygon;
    const ringCoords = geom.getCoordinates()[0];

    // Round caps produce more vertices than a simple rectangle (4 corners + close = 5)
    expect(ringCoords.length).toBeGreaterThan(5);

    manager.dispose();
  });
});
