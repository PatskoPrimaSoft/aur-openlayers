# Line Decorations: Arrow Markers Along LineString

## Summary

Declarative mechanism for rendering direction arrows along LineString geometries, configured as part of a layer's `FeatureDescriptor`. The library handles the internal layer, zoom-dependent recalculation, and lifecycle automatically.

## Motivation

Currently, placing direction arrows along a route requires the user to manually manage a second layer, subscribe to `moveend`, regenerate arrow models on zoom/pan, and synchronize visibility. This boilerplate can be eliminated by allowing arrow decorations to be declared alongside the LineString layer descriptor.

## API

### New Types (in `types.ts`)

```typescript
export type ArrowDecoration = {
  /** Distance between arrows in meters. Function for zoom-adaptive spacing. */
  interval: MaybeFn<number, [view: StyleView]>;

  /** Arrow style. Receives rotation (radians, clockwise from north) and current view. */
  style: (args: { rotation: number; view: StyleView }) => Style | Style[];

  /** Offset of the first arrow as a fraction of interval (0-1). Default: 0.5. */
  offsetRatio?: number;
};

export type LineDecorations = {
  arrows?: ArrowDecoration;
};
```

### FeatureDescriptor Extension

```typescript
export interface FeatureDescriptor<M, G extends Geometry, OPTS extends object> {
  // ... existing fields ...

  /** Decorative elements along LineString geometries. */
  decorations?: LineDecorations;
}
```

### Usage Example

```typescript
{
  id: 'route-line',
  zIndex: 1,
  feature: {
    id: (m: RouteLine) => m.id,
    geometry: { fromModel, applyGeometryToModel },
    style: {
      base: () => ({ color: '#2563eb', width: 4 }),
      render: (opts) => new Style({ stroke: new Stroke({ ... }) }),
    },
    decorations: {
      arrows: {
        interval: (view) => Math.max(100, view.resolution * 80),
        style: ({ rotation }) => new Style({
          image: new RegularShape({
            points: 3, radius: 6, rotation,
            fill: new Fill({ color: '#2563eb' }),
            stroke: new Stroke({ color: '#fff', width: 1 }),
          }),
        }),
      },
    },
  },
}
```

This replaces the need for a separate `ROUTE_ARROWS` layer, `moveend` subscription, and manual `generateRouteArrows` calls.

## Internal Mechanics

### Decoration Layer Creation

When `LayerManager` processes a descriptor with `decorations.arrows`, it:

1. Creates an internal OL `VectorLayer` with its own `VectorSource` for arrow features.
2. Sets `zIndex = parentZIndex + 1` on the internal layer.
3. The internal layer is not exposed in `MapContext.layers` — it is purely visual.
4. No interactions are registered on the internal layer.

### Recalculation Triggers

Arrow features are recalculated on:

- **`map.on('moveend')`** — resolution changed, interval may differ.
- **Parent layer model changes** — `setModels`, `addModel`, `addModels`, `removeModelsById`, `clear`, and `mutate`/`mutateMany` that change geometry.

### Arrow Generation Algorithm

1. Iterate all features in the parent source.
2. For each feature, extract LineString coordinates (EPSG:3857).
3. Compute `interval = resolveMaybeFn(arrows.interval, [currentView])`.
4. Walk along the line, placing points at `interval` steps. First arrow offset = `interval * (offsetRatio ?? 0.5)`.
5. For each point, compute `rotation = Math.atan2(dx, dy)` from the segment direction (clockwise from north, OL convention).
6. Create OL Feature at each point, styled via `arrows.style({ rotation, view })`.
7. Replace all features on the internal source.

### Performance

- Recalculation is throttled via `requestAnimationFrame` to avoid overload during rapid zoom.
- Style results are set directly on features (no style function on the layer — each feature gets its own static style).

### Lifecycle

- Parent `setVisible(false)` hides the decoration layer. `setOpacity` is synchronized.
- `LayerManager.dispose()` removes the internal layer and all subscriptions.

## Edge Cases

| Case | Behavior |
|------|----------|
| Empty layer / no features | No arrows generated, internal layer empty |
| MultiLineString geometry | Each sub-line processed independently |
| Line shorter than interval | No arrows placed |
| Non-LineString geometry with `decorations` | Field ignored, console warning in dev mode |
| Parent visibility toggled | Decoration layer visibility synchronized |
| Parent opacity changed | Decoration layer opacity synchronized |

## Scope

- **In scope:** `arrows` decoration type for LineString/MultiLineString.
- **Out of scope (future):** Other decoration types (distance labels, intermediate markers) via additional fields in `LineDecorations`.

## Files to Modify

- `projects/lib/src/lib/map-framework/public/types.ts` — add `ArrowDecoration`, `LineDecorations`, extend `FeatureDescriptor`
- `projects/lib/src/lib/map-framework/runtime/layer-manager.ts` — detect `decorations.arrows`, create internal layer, wire subscriptions
- New file: `projects/lib/src/lib/map-framework/runtime/decorations/arrow-decoration.ts` — arrow generation algorithm and internal layer management
- `projects/lib/src/public-api.ts` — export new types
- `projects/demo/src/app/map-route-drag/` — refactor to use `decorations.arrows` instead of manual `ROUTE_ARROWS` layer
