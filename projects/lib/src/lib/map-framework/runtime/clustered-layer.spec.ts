import Feature from 'ol/Feature';
import Map from 'ol/Map';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import ClusterSource from 'ol/source/Cluster';
import VectorSource from 'ol/source/Vector';
import Style from 'ol/style/Style';
import View from 'ol/View';

import type { MapContext, ModelsCollectionEvent, VectorLayerDescriptor } from '../public/types';
import { DuplicateModelIdError } from '../public/types';
import { createMapContext } from './map-context';
import { ClusteredVectorLayer } from './clustered-layer';
import { getFeatureStates, setFeatureStates } from './style/feature-states';

type Model = { id: string; coords: [number, number] };

describe('ClusteredVectorLayer', () => {
  const createCtx = (): MapContext => {
    const map = new Map({
      target: document.createElement('div'),
      view: new View({ center: [0, 0], zoom: 2 }),
      layers: [],
    });
    return createMapContext(map, {});
  };

  const createDescriptor = (
    overrides: Partial<VectorLayerDescriptor<Model, Point, { color: string }>> = {},
  ): {
    descriptor: VectorLayerDescriptor<Model, Point, { color: string }>;
    baseSpy: jasmine.Spy;
    renderSpy: jasmine.Spy;
    clusterRenderSpy: jasmine.Spy;
  } => {
    const baseSpy = jasmine.createSpy('base').and.returnValue({ color: 'red' });
    const renderSpy = jasmine.createSpy('render').and.returnValue(new Style());
    const clusterRenderSpy = jasmine.createSpy('clusterRender').and.returnValue(new Style());
    const descriptor: VectorLayerDescriptor<Model, Point, { color: string }> = {
      id: 'points',
      feature: {
        id: (model) => model.id,
        geometry: {
          fromModel: (model) => new Point(model.coords),
          applyGeometryToModel: (prev, geometry) => ({
            ...prev,
            coords: (geometry as Point).getCoordinates() as [number, number],
          }),
        },
        style: {
          base: baseSpy,
          render: renderSpy,
        },
      },
      clustering: {
        distance: 10,
        enabledByDefault: false,
        clusterStyle: {
          render: clusterRenderSpy,
        },
      },
      ...overrides,
    };
    return { descriptor, baseSpy, renderSpy, clusterRenderSpy };
  };

  const createLayerSetup = (
    enabledByDefault: boolean,
    scheduleInvalidate = jasmine.createSpy('scheduleInvalidate'),
  ) => {
    const { descriptor } = createDescriptor({
      clustering: {
        distance: 10,
        enabledByDefault,
        clusterStyle: {
          render: jasmine.createSpy('clusterRender').and.returnValue(new Style()),
        },
      },
    });
    const source = new VectorSource<Point>();
    const clusterSource = new ClusterSource({ source });
    const layer = new VectorLayer({ source });
    const ctx = createCtx();
    const api = new ClusteredVectorLayer({
      descriptor,
      layer,
      source,
      clusterSource,
      ctx,
      scheduleInvalidate,
    });
    return { descriptor, source, clusterSource, layer, api, scheduleInvalidate };
  };

  it('uses enabledByDefault to select initial source', () => {
    const enabled = createLayerSetup(true);
    expect(enabled.layer.getSource()).toBe(enabled.clusterSource);
    expect(enabled.api.isClusteringEnabled?.()).toBeTrue();

    const disabled = createLayerSetup(false);
    expect(disabled.layer.getSource()).toBe(disabled.source);
    expect(disabled.api.isClusteringEnabled?.()).toBeFalse();
  });

  it('switches sources idempotently and invalidates', () => {
    const { api, layer, source, clusterSource, scheduleInvalidate } = createLayerSetup(false);
    const setSourceSpy = spyOn(layer, 'setSource').and.callThrough();

    api.setClusteringEnabled?.(true);
    expect(layer.getSource()).toBe(clusterSource);
    expect(setSourceSpy).toHaveBeenCalledTimes(1);
    expect(scheduleInvalidate).toHaveBeenCalledTimes(1);

    api.setClusteringEnabled?.(true);
    expect(setSourceSpy).toHaveBeenCalledTimes(1);
    expect(scheduleInvalidate).toHaveBeenCalledTimes(1);

    api.setClusteringEnabled?.(false);
    expect(layer.getSource()).toBe(source);
    expect(setSourceSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps features available across switching', () => {
    const { api, source, clusterSource } = createLayerSetup(false);
    const modelA: Model = { id: 'a', coords: [1, 2] };
    api.setModels([modelA]);

    const featureA = source.getFeatureById('a') as Feature<Point>;
    expect(featureA).toBeTruthy();

    api.setClusteringEnabled?.(true);
    const clusteredFeatures = clusterSource.getFeatures();
    const innerIds = clusteredFeatures
      .flatMap((feature) => (feature.get('features') as Feature<Point>[] | undefined) ?? [])
      .map((feature) => feature.getId());
    expect(innerIds).toContain('a');
    expect(clusterSource.getSource()?.getFeatureById('a')).toBe(featureA);
  });


  it('clears feature states by api method', () => {
    const { api, source } = createLayerSetup(false);
    const modelA: Model = { id: 'a', coords: [1, 2] };
    api.setModels([modelA]);

    api.setFeatureStates('a', ['HOVER']);

    const featureA = source.getFeatureById('a') as Feature<Point>;
    expect(getFeatureStates(featureA)).toEqual(['HOVER']);

    api.clearFeatureStates('a');
    expect(getFeatureStates(featureA)).toEqual([]);
  });

  it('clears feature states when switching clustering', () => {
    const { api, source } = createLayerSetup(false);
    const modelA: Model = { id: 'a', coords: [1, 2] };
    api.setModels([modelA]);

    const featureA = source.getFeatureById('a') as Feature<Point>;
    setFeatureStates(featureA, ['HOVER']);
    expect(getFeatureStates(featureA)).toEqual(['HOVER']);

    api.setClusteringEnabled?.(true);
    expect(getFeatureStates(featureA)).toEqual([]);
  });

  describe('setModels contract compliance', () => {
    it('updates getAllModels after setModels', () => {
      const { api } = createLayerSetup(false);
      const modelA: Model = { id: 'a', coords: [1, 2] };
      const modelB: Model = { id: 'b', coords: [3, 4] };

      api.setModels([modelA, modelB]);
      expect(api.getAllModels()).toEqual([modelA, modelB]);

      api.setModels([modelA]);
      expect(api.getAllModels()).toEqual([modelA]);
    });

    it('emits onModelsCollectionChanged with correct payload', () => {
      const { api } = createLayerSetup(false);
      const modelA: Model = { id: 'a', coords: [1, 2] };
      const modelB: Model = { id: 'b', coords: [3, 4] };

      const events: ModelsCollectionEvent<Model>[] = [];
      api.onModelsCollectionChanged((event) => events.push(event));

      api.setModels([modelA]);
      expect(events.length).toBe(1);
      expect(events[0].reason).toBe('set');
      expect(events[0].prev).toEqual([]);
      expect(events[0].next).toEqual([modelA]);

      api.setModels([modelA, modelB]);
      expect(events.length).toBe(2);
      expect(events[1].reason).toBe('set');
      expect(events[1].prev).toEqual([modelA]);
      expect(events[1].next).toEqual([modelA, modelB]);
    });

    it('throws DuplicateModelIdError and preserves state', () => {
      const { api } = createLayerSetup(false);
      const modelA: Model = { id: 'a', coords: [1, 2] };
      const duplicateA: Model = { id: 'a', coords: [9, 9] };

      api.setModels([modelA]);
      const handler = jasmine.createSpy('handler');
      api.onModelsCollectionChanged(handler);

      expect(() => api.setModels([modelA, duplicateA])).toThrowError(DuplicateModelIdError);
      expect(api.getAllModels()).toEqual([modelA]);
      expect(handler).not.toHaveBeenCalled();
    });

    it('supports addModel/removeModelsById/clear after setModels', () => {
      const { api } = createLayerSetup(false);
      const modelA: Model = { id: 'a', coords: [1, 2] };
      const modelB: Model = { id: 'b', coords: [3, 4] };
      const modelC: Model = { id: 'c', coords: [5, 6] };

      api.setModels([modelA]);
      api.addModel(modelB);
      expect(api.getAllModels()).toEqual([modelA, modelB]);

      api.addModels([modelC]);
      expect(api.getAllModels()).toEqual([modelA, modelB, modelC]);

      const removed = api.removeModelsById(['b']);
      expect(removed).toBe(1);
      expect(api.getAllModels()).toEqual([modelA, modelC]);

      api.clear();
      expect(api.getAllModels()).toEqual([]);
    });
  });

  it('uses regular style for single clusters and clusterStyle for size > 1', () => {
    const { descriptor, baseSpy, renderSpy, clusterRenderSpy } = createDescriptor();
    const source = new VectorSource<Point>();
    const clusterSource = new ClusterSource({ source });
    const layer = new VectorLayer({ source });
    const ctx = createCtx();
    const api = new ClusteredVectorLayer({
      descriptor,
      layer,
      source,
      clusterSource,
      ctx,
      scheduleInvalidate: () => undefined,
    });

    const modelA: Model = { id: 'a', coords: [1, 2] };
    api.setModels([modelA]);
    const featureA = source.getFeatureById('a') as Feature<Point>;
    const styleFn = layer.getStyleFunction()!;

    const singleCluster = new Feature({
      features: [featureA],
      geometry: new Point([0, 0]),
    });
    styleFn(singleCluster, 1);
    expect(baseSpy).toHaveBeenCalled();
    expect(renderSpy).toHaveBeenCalled();
    expect(clusterRenderSpy).not.toHaveBeenCalled();

    baseSpy.calls.reset();
    renderSpy.calls.reset();
    clusterRenderSpy.calls.reset();

    const modelB: Model = { id: 'b', coords: [3, 4] };
    api.setModels([modelA, modelB]);
    const featureB = source.getFeatureById('b') as Feature<Point>;

    const multiCluster = new Feature({
      features: [featureA, featureB],
      geometry: new Point([0, 0]),
    });
    styleFn(multiCluster, 1);
    expect(clusterRenderSpy).toHaveBeenCalled();
    expect(baseSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });
});
