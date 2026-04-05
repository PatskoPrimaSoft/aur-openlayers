# Line Decorations: Buffer Polygon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a declarative `buffer` decoration to `LineDecorations` that renders a polygon corridor around LineString geometries.

**Architecture:** New `BufferDecorationManager` (mirrors `ArrowDecorationManager` pattern) manages an internal `VectorLayer` with `Polygon` features. A pure function `generateBufferPolygon` handles offset-curve geometry. Arrow zIndex shifts from `+1` to `+2` to accommodate buffer layer below the parent.

**Tech Stack:** Angular 19, OpenLayers 6.5, Karma/Jasmine

---

### Task 1: Add `BufferDecoration` type and extend `LineDecorations`

**Files:**
- Modify: `projects/lib/src/lib/map-framework/public/types.ts:541-549`

- [ ] **Step 1: Add `BufferDecoration` type after `ArrowDecoration`**

In `projects/lib/src/lib/map-framework/public/types.ts`, after the closing `};` of `ArrowDecoration` (line 541), add:

```typescript
/**
 * Конфигурация буферного полигона (коридора) вдоль LineString.
 */
export type BufferDecoration = {
  /** Ширина буфера в метрах (в одну сторону — полная ширина = distance * 2). */
  distance: number;

  /** Стиль буферного полигона (OL Style). */
  style: Style | Style[];

  /** Форма торцов. По умолчанию: 'round'. */
  cap?: 'round' | 'flat';
};
```

- [ ] **Step 2: Extend `LineDecorations` to include `buffer`**

Replace the existing `LineDecorations` type:

```typescript
/**
 * Декоративные элементы вдоль LineString-геометрий.
 */
export type LineDecorations = {
  /** Стрелки направления вдоль линии. */
  arrows?: ArrowDecoration;
  /** Буферный полигон (коридор) вокруг линии. */
  buffer?: BufferDecoration;
};
```

- [ ] **Step 3: Verify types compile**

Run: `npx ng build lib 2>&1 | head -5`
Expected: Build succeeds (no consumers of the new type yet).

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/public/types.ts
git commit -m "feat(map-framework): add BufferDecoration type to LineDecorations"
```

---

### Task 2: Implement `generateBufferPolygon` pure function

**Files:**
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.ts`
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.spec.ts`

- [ ] **Step 1: Write the test file**

Create `projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.spec.ts`:

```typescript
import { generateBufferPolygon } from './generate-buffer-polygon';

describe('generateBufferPolygon', () => {
  it('returns empty array for a single point', () => {
    const result = generateBufferPolygon([[0, 0]], 100, 'flat');
    expect(result.length).toBe(0);
  });

  it('returns empty array for empty coords', () => {
    const result = generateBufferPolygon([], 100, 'flat');
    expect(result.length).toBe(0);
  });

  it('generates a flat-capped buffer for a horizontal two-point line', () => {
    // Horizontal line from [0,0] to [1000,0], distance=100 (near equator, proj ≈ meters)
    const ring = generateBufferPolygon([[0, 0], [1000, 0]], 100, 'flat');
    expect(ring.length).toBeGreaterThan(0);

    // Ring should be closed
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 5);
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 5);

    // Check width: left side Y ≈ +100, right side Y ≈ -100
    const ys = ring.map(c => c[1]);
    const maxY = Math.max(...ys);
    const minY = Math.min(...ys);
    expect(maxY).toBeCloseTo(100, -1); // ~100 (proj units near equator)
    expect(minY).toBeCloseTo(-100, -1);
  });

  it('generates a flat-capped buffer for a vertical two-point line', () => {
    // Vertical line from [0,0] to [0,1000], distance=50
    const ring = generateBufferPolygon([[0, 0], [0, 1000]], 50, 'flat');
    expect(ring.length).toBeGreaterThan(0);

    const xs = ring.map(c => c[0]);
    const maxX = Math.max(...xs);
    const minX = Math.min(...xs);
    expect(maxX).toBeCloseTo(50, -1);
    expect(minX).toBeCloseTo(-50, -1);
  });

  it('generates round end caps with extra vertices', () => {
    const flatRing = generateBufferPolygon([[0, 0], [1000, 0]], 100, 'flat');
    const roundRing = generateBufferPolygon([[0, 0], [1000, 0]], 100, 'round');
    // Round caps add semicircle vertices at each end
    expect(roundRing.length).toBeGreaterThan(flatRing.length);
  });

  it('handles a line with a sharp turn (miter/bevel)', () => {
    // Right angle: go right 1000, then go up 1000
    const ring = generateBufferPolygon([[0, 0], [1000, 0], [1000, 1000]], 100, 'flat');
    expect(ring.length).toBeGreaterThan(0);

    // Should not produce extreme miter spikes — all points within reasonable bounds
    for (const [x, y] of ring) {
      expect(x).toBeGreaterThan(-300);
      expect(x).toBeLessThan(1300);
      expect(y).toBeGreaterThan(-300);
      expect(y).toBeLessThan(1300);
    }
  });

  it('returns zero distance produces degenerate (zero-width) polygon', () => {
    const ring = generateBufferPolygon([[0, 0], [1000, 0]], 0, 'flat');
    // With zero distance, all Y values should be ~0
    for (const [, y] of ring) {
      expect(y).toBeCloseTo(0, 5);
    }
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: FAIL — `generateBufferPolygon` not found.

- [ ] **Step 3: Implement `generateBufferPolygon`**

Create `projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.ts`:

```typescript
import { toLonLat } from 'ol/proj';

/**
 * Compute projected buffer distance for a segment by converting meters
 * to EPSG:3857 units using the segment's average latitude.
 */
function projectedDistance(ax: number, ay: number, bx: number, by: number, meters: number): number {
  const midY = (ay + by) / 2;
  const [, lat] = toLonLat([0, midY]);
  const scale = Math.cos((lat * Math.PI) / 180);
  return scale > 1e-10 ? meters / scale : meters;
}

/**
 * Compute the unit normal of a segment (pointing left when walking from a→b).
 */
function segmentNormal(ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [0, 0];
  return [-dy / len, dx / len];
}

/**
 * Generate a semicircle of points around a center, from startAngle to startAngle + PI.
 */
function semicircle(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  segments: number,
): number[][] {
  const points: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (Math.PI * i) / segments;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

/**
 * Generate a closed polygon ring representing a buffer around a polyline.
 *
 * @param coords Line vertices in EPSG:3857.
 * @param distance Buffer width in meters (one side).
 * @param cap End cap style: 'round' or 'flat'.
 * @returns Closed ring (first == last point), or empty array if line is degenerate.
 */
export function generateBufferPolygon(
  coords: number[][],
  distance: number,
  cap: 'round' | 'flat',
): number[][] {
  if (coords.length < 2) return [];

  const n = coords.length;
  const left: number[][] = [];
  const right: number[][] = [];

  // Compute per-vertex offset using averaged normals at joins
  for (let i = 0; i < n; i++) {
    let nx: number, ny: number, dist: number;

    if (i === 0) {
      // First vertex — use first segment's normal
      dist = projectedDistance(coords[0][0], coords[0][1], coords[1][0], coords[1][1], distance);
      [nx, ny] = segmentNormal(coords[0][0], coords[0][1], coords[1][0], coords[1][1]);
    } else if (i === n - 1) {
      // Last vertex — use last segment's normal
      dist = projectedDistance(coords[n - 2][0], coords[n - 2][1], coords[n - 1][0], coords[n - 1][1], distance);
      [nx, ny] = segmentNormal(coords[n - 2][0], coords[n - 2][1], coords[n - 1][0], coords[n - 1][1]);
    } else {
      // Interior vertex — average normals of adjacent segments
      const dist1 = projectedDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1], distance);
      const dist2 = projectedDistance(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1], distance);
      dist = (dist1 + dist2) / 2;

      const [n1x, n1y] = segmentNormal(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      const [n2x, n2y] = segmentNormal(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);

      nx = n1x + n2x;
      ny = n1y + n2y;
      const len = Math.hypot(nx, ny);

      if (len > 1e-10) {
        nx /= len;
        ny /= len;
        // Miter length factor: 1 / cos(half-angle between segments)
        const dot = n1x * nx + n1y * ny;
        const miterScale = dot > 0.5 ? 1 / dot : 2; // Bevel cap at miter ratio > 2
        dist *= miterScale;
      } else {
        [nx, ny] = segmentNormal(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      }
    }

    const x = coords[i][0];
    const y = coords[i][1];
    left.push([x + nx * dist, y + ny * dist]);
    right.push([x - nx * dist, y - ny * dist]);
  }

  // Assemble the polygon ring
  const ring: number[][] = [];

  // Start cap
  if (cap === 'round') {
    const [n1x, n1y] = segmentNormal(coords[0][0], coords[0][1], coords[1][0], coords[1][1]);
    const startAngle = Math.atan2(n1y, n1x);
    const dist = projectedDistance(coords[0][0], coords[0][1], coords[1][0], coords[1][1], distance);
    ring.push(...semicircle(coords[0][0], coords[0][1], dist, startAngle, 8));
  } else {
    ring.push(left[0]);
  }

  // Left side (forward)
  for (let i = 1; i < n; i++) {
    ring.push(left[i]);
  }

  // End cap
  if (cap === 'round') {
    const [n2x, n2y] = segmentNormal(coords[n - 2][0], coords[n - 2][1], coords[n - 1][0], coords[n - 1][1]);
    const endAngle = Math.atan2(-n2y, -n2x);
    const dist = projectedDistance(coords[n - 2][0], coords[n - 2][1], coords[n - 1][0], coords[n - 1][1], distance);
    ring.push(...semicircle(coords[n - 1][0], coords[n - 1][1], dist, endAngle, 8));
  } else {
    ring.push(right[n - 1]);
  }

  // Right side (backward)
  for (let i = n - 2; i >= 0; i--) {
    ring.push(right[i]);
  }

  // Close ring
  ring.push(ring[0].slice());

  return ring;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All `generateBufferPolygon` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.ts projects/lib/src/lib/map-framework/runtime/decorations/generate-buffer-polygon.spec.ts
git commit -m "feat(map-framework): implement generateBufferPolygon with tests"
```

---

### Task 3: Implement `BufferDecorationManager`

**Files:**
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.ts`
- Create: `projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.spec.ts`

- [ ] **Step 1: Write the test file**

Create `projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: FAIL — `BufferDecorationManager` not found.

- [ ] **Step 3: Implement `BufferDecorationManager`**

Create `projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.ts`:

```typescript
import Feature from 'ol/Feature';
import { LineString, MultiLineString, Polygon } from 'ol/geom';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type OlMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';

import type { BufferDecoration, Unsubscribe, VectorLayerApi } from '../../public/types';
import { generateBufferPolygon } from './generate-buffer-polygon';

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

export type BufferDecorationManagerOptions = {
  map: OlMap;
  parentLayer: VectorLayer;
  parentApi: VectorLayerApi<any, any>;
  config: BufferDecoration;
};

export class BufferDecorationManager {
  private readonly source = new VectorSource<Polygon>();
  private readonly layer: VectorLayer;
  private readonly config: BufferDecoration;
  private readonly map: OlMap;
  private readonly parentLayer: VectorLayer;
  private readonly parentApi: VectorLayerApi<any, any>;
  private readonly moveEndKey: EventsKey;
  private readonly unsubCollection: Unsubscribe;
  private readonly unsubChanges: Unsubscribe | undefined;
  private rafId: number | null = null;

  constructor(options: BufferDecorationManagerOptions) {
    this.config = options.config;
    this.map = options.map;
    this.parentLayer = options.parentLayer;
    this.parentApi = options.parentApi;

    const parentZ = this.parentLayer.getZIndex() ?? 0;
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: parentZ,
    });
    this.layer.set('id', '__decoration_buffer');
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

    const parentSource = this.parentLayer.getSource() as VectorSource<Geometry> | null;
    if (!parentSource) {
      this.source.clear();
      return;
    }

    const cap = this.config.cap ?? 'round';
    const style = this.config.style;
    const allFeatures: Feature<Polygon>[] = [];

    parentSource.getFeatures().forEach((feature) => {
      const geom = feature.getGeometry();
      if (!geom) return;
      const lines = extractLineCoords(geom);
      for (const coords of lines) {
        const ring = generateBufferPolygon(coords, this.config.distance, cap);
        if (ring.length === 0) continue;
        const f = new Feature<Polygon>({ geometry: new Polygon([ring]) });
        f.setStyle(Array.isArray(style) ? style : [style]);
        allFeatures.push(f);
      }
    });

    this.source.clear();
    if (allFeatures.length > 0) {
      this.source.addFeatures(allFeatures);
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

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All `BufferDecorationManager` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.ts projects/lib/src/lib/map-framework/runtime/decorations/buffer-decoration-manager.spec.ts
git commit -m "feat(map-framework): implement BufferDecorationManager with tests"
```

---

### Task 4: Update arrow zIndex from `+1` to `+2`

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts:99-102`
- Modify: `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts:88`

- [ ] **Step 1: Update the zIndex in `ArrowDecorationManager` constructor**

In `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts`, change line 102:

```typescript
// Before:
zIndex: parentZ + 1,

// After:
zIndex: parentZ + 2,
```

- [ ] **Step 2: Update the test expectation**

In `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts`, change line 88:

```typescript
// Before:
expect(arrowLayer.getZIndex()).toBe(6);

// After:
expect(arrowLayer.getZIndex()).toBe(7);
```

- [ ] **Step 3: Run tests — verify they pass**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All arrow decoration tests PASS with updated zIndex.

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.ts projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration-manager.spec.ts
git commit -m "refactor(map-framework): shift arrow decoration zIndex to +2 for buffer layer slot"
```

---

### Task 5: Wire `BufferDecorationManager` into `LayerManager`

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/layer-manager.ts:18,27,79-87`

- [ ] **Step 1: Add import**

In `projects/lib/src/lib/map-framework/runtime/layer-manager.ts`, add after line 18:

```typescript
import { BufferDecorationManager } from './decorations/buffer-decoration-manager';
```

- [ ] **Step 2: Widen the `decorationManagers` array type**

Change line 27:

```typescript
// Before:
private readonly decorationManagers: ArrowDecorationManager[] = [];

// After:
private readonly decorationManagers: (ArrowDecorationManager | BufferDecorationManager)[] = [];
```

- [ ] **Step 3: Add buffer decoration wiring after the arrows block**

After the closing `}` of the arrows block (line 87), add:

```typescript
      if (descriptor.feature.decorations?.buffer) {
        const bufferManager = new BufferDecorationManager({
          map: this.map,
          parentLayer: layer,
          parentApi: api,
          config: descriptor.feature.decorations.buffer,
        });
        this.decorationManagers.push(bufferManager);
      }
```

- [ ] **Step 4: Run tests — verify all pass**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All tests PASS. Existing `dispose()` already iterates `decorationManagers`.

- [ ] **Step 5: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/layer-manager.ts
git commit -m "feat(map-framework): wire BufferDecorationManager into LayerManager"
```

---

### Task 6: Add `LayerManager` integration test for buffer + arrows combo

**Files:**
- Modify: `projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts`

- [ ] **Step 1: Add integration test**

Add the following test after the existing `decorations.arrows` test (after line 121) in `projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts`:

```typescript
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

    // Verify z-index ordering: buffer(1) < parent(1+1=2 via addLayer) < arrows(3)
    const layers = map.getLayers().getArray();
    const bufferLayer = layers.find((l) => l.get('id') === '__decoration_buffer');
    const arrowLayer = layers.find((l) => l.get('id') === '__decoration_arrows');
    expect(bufferLayer).toBeDefined();
    expect(arrowLayer).toBeDefined();
    expect(bufferLayer!.getZIndex()).toBe(1);   // parentZIndex
    expect(arrowLayer!.getZIndex()).toBe(3);    // parentZIndex + 2

    // Set models and flush to trigger generation
    manager.getApi('route')!.setModels([{ id: 'r1', coords: [[0, 0], [1000, 0]] }]);
    while (callbacks.length > 0) {
      callbacks.shift()!(0);
    }

    // Cleanup
    manager.dispose();
    expect(map.getLayers().getLength()).toBe(initialLayers);
  });
```

- [ ] **Step 2: Add `Fill` import if not present**

At the top of `layer-manager.spec.ts`, ensure `Fill` is imported:

```typescript
import Fill from 'ol/style/Fill';
```

- [ ] **Step 3: Run tests — verify all pass**

Run: `npx ng test lib --watch=false 2>&1 | tail -20`
Expected: All tests PASS including the new integration test.

- [ ] **Step 4: Commit**

```bash
git add projects/lib/src/lib/map-framework/runtime/layer-manager.spec.ts
git commit -m "test(map-framework): add LayerManager buffer+arrows integration test"
```

---

### Task 7: Export `BufferDecoration` type

**Files:**
- Verify: `projects/lib/src/lib/map-framework/index.ts`
- Verify: `projects/lib/src/public-api.ts`

- [ ] **Step 1: Verify exports are already covered**

`projects/lib/src/lib/map-framework/index.ts` has `export * from './public/types'` which re-exports all types including the new `BufferDecoration`. `projects/lib/src/public-api.ts` has `export * from './lib/map-framework'`.

No changes needed — the wildcard exports already cover `BufferDecoration`.

Run: `npx ng build lib 2>&1 | head -5`
Expected: Build succeeds.

- [ ] **Step 2: Commit (skip if no changes)**

No files to commit — exports already covered by wildcards.
