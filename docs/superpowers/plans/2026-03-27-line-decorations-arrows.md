# Line Decorations: Arrow Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add declarative arrow decorations along LineString geometries, configured as part of `FeatureDescriptor.decorations`.

**Architecture:** New `ArrowDecoration` types added to `types.ts`. A standalone `ArrowDecorationManager` class creates an internal OL VectorLayer, subscribes to parent model changes and `moveend`, and regenerates arrow features on each trigger. `LayerManager` detects `decorations.arrows` and wires the manager automatically. The demo's manual `ROUTE_ARROWS` layer is replaced by the new declarative config.

**Tech Stack:** Angular 19, OpenLayers 10, TypeScript 5.7, Jasmine + Karma

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `projects/lib/src/lib/map-framework/public/types.ts` | Add `ArrowDecoration`, `LineDecorations`, extend `FeatureDescriptor` |
| Create | `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts` | Arrow generation, internal layer management, subscriptions |
| Create | `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts` | Unit tests for ArrowDecorationManager |
| Modify | `projects/lib/src/lib/map-framework/runtime/layer-manager.ts` | Detect `decorations.arrows`, instantiate ArrowDecorationManager, cleanup on dispose |
| Modify | `projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts` | Integration test for decoration wiring |
| Modify | `projects/demo/src/app/map-route-drag/route-drag.schema.ts` | Replace `ROUTE_ARROWS` layer with `decorations.arrows` |
| Modify | `projects/demo/src/app/map-route-drag/route-drag.models.ts` | Remove `RouteArrow`, remove `ROUTE_ARROWS` from `LAYER_ID` |
| Modify | `projects/demo/src/app/map-route-drag/map-route-drag.component.ts` | Remove manual arrow layer management |

---

### Task 1: Add Types

**Files:**
- Modify: `projects/lib/src/lib/map-framework/public/types.ts`

- [ ] **Step 1: Add `ArrowDecoration` and `LineDecorations` types**

Add before the `FeatureDescriptor` interface (before line 522):

```typescript
/**
 * Конфигурация стрелок направления вдоль LineString.
 */
export type ArrowDecoration = {
  /**
   * Расстояние между стрелками в метрах.
   * Функция — для адаптации интервала к масштабу.
   *
   * @example
   * interval: (view) => Math.max(100, view.resolution * 80)
   */
  interval: MaybeFn<number, [view: StyleView]>;

  /**
   * Стиль стрелки.
   * Получает rotation (радианы, по часовой от севера — конвенция OL)
   * и текущий вид карты.
   */
  style: (args: { rotation: number; view: StyleView }) => Style | Style[];

  /**
   * Смещение первой стрелки от начала линии как доля интервала (0–1).
   * По умолчанию: 0.5.
   */
  offsetRatio?: number;
};

/**
 * Декоративные элементы вдоль LineString-геометрий.
 */
export type LineDecorations = {
  /** Стрелки направления вдоль линии. */
  arrows?: ArrowDecoration;
};
```

- [ ] **Step 2: Add `decorations` field to `FeatureDescriptor`**

In the `FeatureDescriptor` interface, add after the `popup` field (after line 731):

```typescript
  /**
   * Декоративные элементы вдоль LineString-геометрий.
   * Игнорируется для не-LineString геометрий.
   */
  decorations?: LineDecorations;
```

- [ ] **Step 3: Verify types compile**

Run: `npx ng build lib 2>&1 | head -5`
Expected: Build succeeds (no type errors).

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/public/types.ts
git commit -m "feat(map-framework): add ArrowDecoration and LineDecorations types"
```

---

### Task 2: Implement ArrowDecorationManager

**Files:**
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts`

- [ ] **Step 1: Create the ArrowDecorationManager class**

```typescript
import Feature from 'ol/Feature';
import { LineString, MultiLineString, Point } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type OlMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';

import type {
  ArrowDecoration,
  MaybeFn,
  StyleView,
  Unsubscribe,
  VectorLayerApi,
} from '../../public/types';

type ArrowPoint = {
  coordinate: [number, number];
  rotation: number;
};

const resolveMaybeFn = <T, A extends any[]>(value: MaybeFn<T, A>, args: A): T =>
  typeof value === 'function' ? (value as (...a: A) => T)(...args) : value;

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

/**
 * Generate arrow points along a polyline at a given interval (meters in EPSG:3857).
 */
function generateArrowPoints(
  coords: number[][],
  intervalMeters: number,
  offsetRatio: number,
): ArrowPoint[] {
  if (coords.length < 2 || intervalMeters <= 0) return [];

  const arrows: ArrowPoint[] = [];
  let accumulated = intervalMeters * offsetRatio;

  for (let i = 0; i < coords.length - 1; i++) {
    const ax = coords[i][0], ay = coords[i][1];
    const bx = coords[i + 1][0], by = coords[i + 1][1];
    const segLen = Math.hypot(bx - ax, by - ay);
    const rotation = Math.atan2(bx - ax, by - ay);

    while (accumulated <= segLen) {
      const t = accumulated / segLen;
      arrows.push({
        coordinate: [ax + t * (bx - ax), ay + t * (by - ay)],
        rotation,
      });
      accumulated += intervalMeters;
    }
    accumulated -= segLen;
  }

  return arrows;
}

export type ArrowDecorationManagerOptions = {
  map: OlMap;
  parentLayer: VectorLayer;
  parentApi: VectorLayerApi<any, any>;
  config: ArrowDecoration;
};

export class ArrowDecorationManager {
  private readonly source = new VectorSource<Point>();
  private readonly layer: VectorLayer;
  private readonly config: ArrowDecoration;
  private readonly map: OlMap;
  private readonly parentLayer: VectorLayer;
  private readonly parentApi: VectorLayerApi<any, any>;
  private readonly moveEndKey: EventsKey;
  private readonly unsubCollection: Unsubscribe;
  private readonly unsubChanges: Unsubscribe | undefined;
  private rafId: number | null = null;

  constructor(options: ArrowDecorationManagerOptions) {
    this.config = options.config;
    this.map = options.map;
    this.parentLayer = options.parentLayer;
    this.parentApi = options.parentApi;

    const parentZ = this.parentLayer.getZIndex() ?? 0;
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: parentZ + 1,
    });
    this.layer.set('id', `__decoration_arrows`);
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

    const view = this.map.getView();
    const resolution = view.getResolution() ?? 1;
    const styleView: StyleView = { resolution, zoom: view.getZoom() };
    const interval = resolveMaybeFn(this.config.interval, [styleView]);
    const offsetRatio = this.config.offsetRatio ?? 0.5;

    const parentSource = this.parentLayer.getSource() as VectorSource<Geometry> | null;
    if (!parentSource) {
      this.source.clear();
      return;
    }

    const allArrows: ArrowPoint[] = [];
    parentSource.getFeatures().forEach((feature) => {
      const geom = feature.getGeometry();
      if (!geom) return;
      const lines = extractLineCoords(geom);
      for (const coords of lines) {
        const arrows = generateArrowPoints(coords, interval, offsetRatio);
        allArrows.push(...arrows);
      }
    });

    const features = allArrows.map((arrow, i) => {
      const f = new Feature<Point>({ geometry: new Point(arrow.coordinate) });
      f.setId(`__arrow_${i}`);
      const styleResult = this.config.style({ rotation: arrow.rotation, view: styleView });
      f.setStyle(Array.isArray(styleResult) ? styleResult : [styleResult]);
      return f;
    });

    this.source.clear();
    if (features.length > 0) {
      this.source.addFeatures(features);
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx ng build lib 2>&1 | head -5`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts
git commit -m "feat(map-framework): implement ArrowDecorationManager"
```

---

### Task 3: Unit Tests for ArrowDecorationManager

**Files:**
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
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

  it('creates an internal layer with zIndex = parent + 1', () => {
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
    expect(arrowLayer.getZIndex()).toBe(6);

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

    // 200m line with 50m interval and 0 offset: arrows at 0, 50, 100, 150, 200 => 4 arrows (at 50, 100, 150, 200 — but accumulated starts at 0 so at 0, 50, 100, 150)
    expect(arrowFeatures.length).toBe(4);

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

    parentLayer.setVisible(false);
    // Trigger rebuild to sync
    api.setModels([{ id: 'line1', coords: [[0, 0], [500, 0]] }]);
    flushRAF();

    const arrowLayer = map.getLayers().item(map.getLayers().getLength() - 1) as VectorLayer;
    expect(arrowLayer.getVisible()).toBe(false);

    const arrowSource = arrowLayer.getSource() as VectorSource<Point>;
    expect(arrowSource.getFeatures().length).toBe(0);

    manager.dispose();
  });

  it('handles MultiLineString geometry', () => {
    const { map, parentLayer, source } = createTestSetup();
    // Manually add a MultiLineString feature to the source
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
    // Two sub-lines of 200m each, 50m interval, offset 0 => 4 arrows each => 8 total
    expect(arrowSource.getFeatures().length).toBe(8);

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
```

- [ ] **Step 2: Run tests**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All ArrowDecorationManager tests pass.

- [ ] **Step 3: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts
git commit -m "test(map-framework): add ArrowDecorationManager unit tests"
```

---

### Task 4: Wire ArrowDecorationManager into LayerManager

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/layer-manager.ts`

- [ ] **Step 1: Import ArrowDecorationManager**

Add import at the top of `layer-manager.ts`:

```typescript
import { ArrowDecorationManager } from './decorations/arrow-decoration-manager';
```

- [ ] **Step 2: Add decorations field and wiring logic**

Add a private field after the existing private fields (after line 24):

```typescript
  private readonly decorationManagers: ArrowDecorationManager[] = [];
```

In the constructor, after the `schema.layers.forEach` loop (after line 76, after `this.map.addLayer(layer);`), add decoration detection inside the same loop — specifically, insert at the end of the `forEach` body, before the closing `});`:

```typescript
      if (descriptor.feature.decorations?.arrows) {
        const decorationManager = new ArrowDecorationManager({
          map: this.map,
          parentLayer: layer,
          parentApi: api,
          config: descriptor.feature.decorations.arrows,
        });
        this.decorationManagers.push(decorationManager);
      }
```

In the `dispose()` method, add cleanup before existing cleanup (before line 118, before `Object.values(this.layers)...`):

```typescript
    this.decorationManagers.forEach((dm) => dm.dispose());
```

- [ ] **Step 3: Verify build**

Run: `npx ng build lib 2>&1 | head -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/layer-manager.ts
git commit -m "feat(map-framework): wire ArrowDecorationManager into LayerManager"
```

---

### Task 5: Integration Test for LayerManager with Decorations

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts`

- [ ] **Step 1: Add integration test**

Add the following test to the existing `describe('LayerManager', ...)` block:

```typescript
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
                new (require('ol/geom/LineString').default)(model.coords),
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
```

- [ ] **Step 2: Add LineString import**

Add at the top of `layer-manager.spec.ts`:

```typescript
import LineString from 'ol/geom/LineString';
```

And update the test to use it directly instead of `require`:

```typescript
            geometry: {
              fromModel: (model: { coords: number[][] }) =>
                new LineString(model.coords),
              applyGeometryToModel: (prev: any) => prev,
            },
```

- [ ] **Step 3: Run all tests**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts
git commit -m "test(map-framework): add LayerManager decoration integration test"
```

---

### Task 6: Refactor Demo to Use Declarative Decorations

**Files:**
- Modify: `projects/demo/src/app/map-route-drag/route-drag.models.ts`
- Modify: `projects/demo/src/app/map-route-drag/route-drag.schema.ts`
- Modify: `projects/demo/src/app/map-route-drag/map-route-drag.component.ts`

- [ ] **Step 1: Remove RouteArrow model and ROUTE_ARROWS layer id**

In `route-drag.models.ts`, remove the `RouteArrow` interface (lines 14-19) and remove `ROUTE_ARROWS` from `LAYER_ID`:

```typescript
export interface RouteWaypoint {
  id: string;
  lat: number;
  lng: number;
  orderIndex: number;
  type: 'primary' | 'intermediate';
}

export interface RouteLine {
  id: string;
  coordinates: [number, number][];
}

export const LAYER_ID = {
  ROUTE_LINE: 'route-line',
  PRIMARY_POINTS: 'primary-points',
  INTERMEDIATE_POINTS: 'intermediate-points',
} as const;
```

- [ ] **Step 2: Replace ROUTE_ARROWS layer with decorations.arrows in schema**

In `route-drag.schema.ts`:

Remove the `RouteArrow` import from `route-drag.models` (line 12). Remove the `RegularShape` import (line 7) from `ol/style/RegularShape`.

Add imports at the top:

```typescript
import RegularShape from 'ol/style/RegularShape';
```

Wait — `RegularShape` is already imported. Just remove `RouteArrow` from the import on line 12:

```typescript
import { RouteWaypoint, RouteLine, LAYER_ID } from './route-drag.models';
```

Replace the `ROUTE_LINE` layer descriptor (lines 55-71) to add `decorations`:

```typescript
        {
          id: LAYER_ID.ROUTE_LINE,
          zIndex: 1,
          feature: {
            id: (m: RouteLine) => m.id,
            geometry: {
              fromModel: (m: RouteLine) =>
                new LineString(m.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
              applyGeometryToModel: (prev: RouteLine) => prev,
            },
            style: {
              base: (): LineStyleOpts => ({ color: '#2563eb', width: 4 }),
              render: (opts: LineStyleOpts) =>
                new Style({ stroke: new Stroke({ color: opts.color, width: opts.width }) }),
            },
            decorations: {
              arrows: {
                interval: (view) => Math.max(100, view.resolution * 80),
                style: ({ rotation }) => new Style({
                  image: new RegularShape({
                    points: 3, radius: 6, rotation,
                    fill: new Fill({ color: '#2563eb' }),
                    stroke: new Stroke({ color: '#ffffff', width: 1 }),
                  }),
                }),
              },
            },
          },
        },
```

Remove the entire `ROUTE_ARROWS` layer descriptor block (the second layer, lines 72-91).

- [ ] **Step 3: Remove arrow management from component**

In `map-route-drag.component.ts`:

Remove imports: `RouteArrow` from line 13, `generateRouteArrows` from line 14.

Remove the field `arrowLayerApi` (line 39):
```typescript
  // DELETE: private arrowLayerApi?: VectorLayerApi<RouteArrow, Geometry>;
```

Remove the field `lastRouteCoords3857` (line 41):
```typescript
  // DELETE: private lastRouteCoords3857: number[][] = [];
```

Remove from `onReady` (line 73):
```typescript
  // DELETE: this.arrowLayerApi = ctx.layers[LAYER_ID.ROUTE_ARROWS] as ...;
```

Remove from `onReady` (line 76):
```typescript
  // DELETE: ctx.map.on('moveend', () => this.updateArrows());
```

Remove the `updateArrows` method entirely (lines 146-150).

In `resetRoute`, remove arrow-related lines:
```typescript
  resetRoute(): void {
    this.phase = 'placing';
    this.intermediatePoints = [];
    this.intermediateLayerApi?.clear();
    this.lineLayerApi?.clear();
    this.rebuildSorted();
  }
```

In `fetchRoute`, remove `lastRouteCoords3857` storage and `updateArrows` call:
```typescript
  private async fetchRoute(): Promise<void> {
    if (this.sortedWaypoints.length < 2) return;

    this.abortController?.abort();
    this.abortController = new AbortController();

    this.zone.run(() => (this.loading = true));
    try {
      const result = await fetchOsrmRoute(this.sortedWaypoints, this.abortController.signal);
      if (!result) return;

      this.lineLayerApi?.setModels([{ id: 'route', coordinates: result.coordsLonLat }]);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Fetch error:', err);
    } finally {
      this.zone.run(() => (this.loading = false));
    }
  }
```

- [ ] **Step 4: Remove unused geometry.utils function (optional)**

In `geometry.utils.ts`, remove `generateRouteArrows` function (lines 44-73) since it's now handled by the library. Keep `distToSegment` and `computeOrderIndexForClick`.

Update the import in `map-route-drag.component.ts` to only import what's needed:

```typescript
import { computeOrderIndexForClick } from './geometry.utils';
```

- [ ] **Step 5: Verify build and run**

Run: `npx ng build lib && npx ng build demo 2>&1 | tail -10`
Expected: Both lib and demo build successfully.

- [ ] **Step 6: Run all tests**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add projects/demo/src/app/map-route-drag/route-drag.models.ts \
  projects/demo/src/app/map-route-drag/route-drag.schema.ts \
  projects/demo/src/app/map-route-drag/map-route-drag.component.ts \
  projects/demo/src/app/map-route-drag/geometry.utils.ts
git commit -m "refactor(demo): replace manual ROUTE_ARROWS layer with decorations.arrows"
```

---

## Self-Review Checklist

- **Spec coverage:** All spec requirements covered — types (Task 1), internal layer + moveend + collection subscriptions (Task 2), throttling via RAF (Task 2), visibility/opacity sync (Task 2), MultiLineString support (Task 3 test), lifecycle/dispose (Task 2/4), demo refactor (Task 6).
- **Placeholder scan:** No TBD/TODO. All code blocks complete.
- **Type consistency:** `ArrowDecoration`, `LineDecorations`, `ArrowDecorationManager`, `ArrowDecorationManagerOptions` — names consistent across all tasks. `interval`, `style`, `offsetRatio` field names match between types.ts definition (Task 1) and usage in ArrowDecorationManager (Task 2) and demo (Task 6).
