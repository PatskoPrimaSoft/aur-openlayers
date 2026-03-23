# Multi-Layer Centering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `centerOnAllLayers` and `centerOnLayers` methods to `MapContext` for fitting the map view to features across multiple layers.

**Architecture:** New `getExtent()` method on each layer returns its base source extent. A utility function `collectLayersExtent` aggregates extents from multiple layers (skipping hidden ones). Two new methods on `MapContext` delegate to this utility and call `view.fit()`.

**Tech Stack:** Angular, OpenLayers, Jasmine

**Spec:** `docs/superpowers/specs/2026-03-23-multi-layer-centering-design.md`

---

### Task 1: Add `getExtent` to `VectorLayerApi` type and implement in `VectorLayerBase`

**Files:**
- Modify: `projects/lib/src/lib/map-framework/public/types.ts:311-416` (VectorLayerApi type)
- Modify: `projects/lib/src/lib/map-framework/runtime/vector-layer-base.ts:248` (after centerOnModels)
- Test: `projects/lib/src/lib/map-framework/runtime/plain-layer.spec.ts`

- [ ] **Step 1: Write the failing test for `getExtent` on a plain layer**

In `plain-layer.spec.ts`, add at the end (before the closing `});`):

```typescript
it('getExtent returns extent of all features', () => {
  const source = new VectorSource<Point>();
  const layer = new VectorLayer({ source });
  const ctx = createCtx();
  const plainLayer = new PlainVectorLayer({
    descriptor,
    layer,
    source,
    ctx,
    scheduleInvalidate: () => undefined,
  });

  expect(plainLayer.getExtent()).toBeNull();

  plainLayer.setModels([
    { id: 'a', coords: [1, 2] },
    { id: 'b', coords: [10, 20] },
  ]);

  const extent = plainLayer.getExtent();
  expect(extent).toEqual([1, 2, 10, 20]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --include="**/plain-layer.spec.ts" --watch=false`
Expected: FAIL — `plainLayer.getExtent is not a function`

- [ ] **Step 3: Add `getExtent` to `VectorLayerApi` type**

In `projects/lib/src/lib/map-framework/public/types.ts`, add after `clearFeatureStates` (line ~415), before the closing `};` of `VectorLayerApi`:

```typescript
  /**
   * Возвращает extent всех фич базового источника (без кластеризации).
   * Возвращает null, если фич нет.
   */
  getExtent: () => import('ol/extent').Extent | null;
```

- [ ] **Step 4: Implement `getExtent` in `VectorLayerBase`**

In `projects/lib/src/lib/map-framework/runtime/vector-layer-base.ts`, add after `centerOnModels` method (after line 247):

```typescript
  getExtent(): import('ol/extent').Extent | null {
    const extent = this.source.getExtent();
    return isEmpty(extent) ? null : extent;
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx ng test --include="**/plain-layer.spec.ts" --watch=false`
Expected: PASS

- [ ] **Step 6: Write the failing test for `getExtent` on a clustered layer**

In `projects/lib/src/lib/map-framework/runtime/clustered-layer.spec.ts`, add a new test (inside the `describe('ClusteredVectorLayer', ...)` block):

```typescript
it('getExtent returns base source extent, not cluster source extent', () => {
  const { api, source } = createLayerSetup(true);
  expect(api.getExtent()).toBeNull();

  api.setModels([
    { id: 'a', coords: [0, 0] },
    { id: 'b', coords: [100, 100] },
  ]);

  const extent = api.getExtent();
  expect(extent).toEqual([0, 0, 100, 100]);
});
```

- [ ] **Step 7: Run test to verify it passes (no override needed)**

Run: `npx ng test --include="**/clustered-layer.spec.ts" --watch=false`
Expected: PASS — `getExtent` from `VectorLayerBase` uses `this.source` which is the base source

- [ ] **Step 8: Commit**

```bash
git add projects/lib/src/lib/map-framework/public/types.ts projects/lib/src/lib/map-framework/runtime/vector-layer-base.ts projects/lib/src/lib/map-framework/runtime/plain-layer.spec.ts projects/lib/src/lib/map-framework/runtime/clustered-layer.spec.ts
git commit -m "feat(map-framework): add getExtent to VectorLayerApi"
```

---

### Task 2: Add `collectLayersExtent` utility

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/fit-layer.utils.ts`
- Test: `projects/lib/src/lib/map-framework/runtime/fit-layer.utils.spec.ts`

- [ ] **Step 1: Write failing tests for `collectLayersExtent`**

In `fit-layer.utils.spec.ts`, first add these imports at the top of the file (alongside the existing import):

```typescript
import {collectLayersExtent} from './fit-layer.utils';
import type {VectorLayerApi} from '../public/types';
```

Then add a new `describe` block after the existing `describe('toOlFitOptions', ...)`:

```typescript
describe('collectLayersExtent', () => {
  const mockLayer = (visible: boolean, extent: number[] | null): Pick<VectorLayerApi<any, any>, 'isVisible' | 'getExtent'> => ({
    isVisible: () => visible,
    getExtent: () => extent,
  });

  it('aggregates extents from multiple visible layers', () => {
    const layers = {
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(true, [20, 20, 30, 30]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers)).toEqual([0, 0, 30, 30]);
  });

  it('skips hidden layers', () => {
    const layers = {
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(false, [100, 100, 200, 200]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers)).toEqual([0, 0, 10, 10]);
  });

  it('ignores non-existent layerIds', () => {
    const layers = {
      a: mockLayer(true, [0, 0, 10, 10]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers, ['a', 'missing'])).toEqual([0, 0, 10, 10]);
  });

  it('returns null for empty layerIds array', () => {
    const layers = {
      a: mockLayer(true, [0, 0, 10, 10]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers, [])).toBeNull();
  });

  it('returns null when all layers have no features', () => {
    const layers = {
      a: mockLayer(true, null),
      b: mockLayer(true, null),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers)).toBeNull();
  });

  it('returns null when all layers are hidden', () => {
    const layers = {
      a: mockLayer(false, [0, 0, 10, 10]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers)).toBeNull();
  });

  it('uses only specified layerIds when provided', () => {
    const layers = {
      a: mockLayer(true, [0, 0, 10, 10]),
      b: mockLayer(true, [50, 50, 60, 60]),
    } as Record<string, VectorLayerApi<any, any>>;

    expect(collectLayersExtent(layers, ['b'])).toEqual([50, 50, 60, 60]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include="**/fit-layer.utils.spec.ts" --watch=false`
Expected: FAIL — `collectLayersExtent is not a function`

- [ ] **Step 3: Implement `collectLayersExtent`**

In `projects/lib/src/lib/map-framework/runtime/fit-layer.utils.ts`:

First, add a new import at the top of the file:

```typescript
import {createEmpty, extend, isEmpty} from 'ol/extent';
```

Then replace the existing type import line `import type {ViewFitOptions, ViewFitPadding} from '../public/types';` with:

```typescript
import type {VectorLayerApi, ViewFitOptions, ViewFitPadding} from '../public/types';
```

Then add the function at the bottom of the file:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include="**/fit-layer.utils.spec.ts" --watch=false`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/fit-layer.utils.ts projects/lib/src/lib/map-framework/runtime/fit-layer.utils.spec.ts
git commit -m "feat(map-framework): add collectLayersExtent utility"
```

---

### Task 3: Add `centerOnAllLayers` and `centerOnLayers` to `MapContext`

**Files:**
- Modify: `projects/lib/src/lib/map-framework/public/types.ts:478-489` (MapContext type)
- Modify: `projects/lib/src/lib/map-framework/runtime/map-context.ts`
- Create: `projects/lib/src/lib/map-framework/runtime/map-context.spec.ts`

- [ ] **Step 1: Write failing tests for MapContext methods**

Create `projects/lib/src/lib/map-framework/runtime/map-context.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include="**/map-context.spec.ts" --watch=false`
Expected: FAIL — `ctx.centerOnAllLayers is not a function`

- [ ] **Step 3: Add `centerOnAllLayers` and `centerOnLayers` to `MapContext` type**

In `projects/lib/src/lib/map-framework/public/types.ts`, add before the closing `};` of the `MapContext` type (after `batch`):

```typescript
  /** Центрирует карту на всех видимых слоях. No-op если нет фич. */
  centerOnAllLayers: (opts?: ViewFitOptions) => void;
  /** Центрирует карту на указанных слоях (скрытые пропускаются). No-op если нет фич. */
  centerOnLayers: (layerIds: ReadonlyArray<string>, opts?: ViewFitOptions) => void;
```

- [ ] **Step 4: Implement in `createMapContext`**

Replace the entire content of `projects/lib/src/lib/map-framework/runtime/map-context.ts` with:

```typescript
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
      if (extent) map.getView().fit(extent, toOlFitOptions(opts));
    },
    centerOnLayers: (layerIds: ReadonlyArray<string>, opts?: ViewFitOptions) => {
      const extent = collectLayersExtent(layers, layerIds);
      if (extent) map.getView().fit(extent, toOlFitOptions(opts));
    },
  };
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx ng test --include="**/map-context.spec.ts" --watch=false`
Expected: ALL PASS

- [ ] **Step 6: Run all tests to verify nothing is broken**

Run: `npx ng test --watch=false`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add projects/lib/src/lib/map-framework/public/types.ts projects/lib/src/lib/map-framework/runtime/map-context.ts projects/lib/src/lib/map-framework/runtime/map-context.spec.ts
git commit -m "feat(map-framework): add centerOnAllLayers and centerOnLayers to MapContext"
```
