# Route Drag Demo — Design Spec

## Overview

Interactive demo for the aur-openlayers library: user places waypoints on a map, builds a route via OSRM, then adjusts the route by dragging the trajectory line to create intermediate waypoints. All routing logic lives in the demo — the library provides only map primitives.

## Data Models

### RouteWaypoint

```typescript
interface RouteWaypoint {
  id: string;
  lat: number;
  lng: number;
  orderIndex: number;
  type: 'primary' | 'intermediate';
}
```

- `primary` — placed by clicking the map, displays a numbered marker
- `intermediate` — created by dragging the route line, displays a colored marker without a number

### RouteLine

```typescript
interface RouteLine {
  id: 'route';
  coordinates: [number, number][]; // decoded polyline from OSRM [lng, lat]
}
```

## Layers

Three vector layers, bottom to top:

| Layer                | Geometry   | zIndex | Purpose                              |
|----------------------|------------|--------|--------------------------------------|
| ROUTE_LINE           | LineString | 1      | Route geometry from OSRM             |
| INTERMEDIATE_POINTS  | Point      | 2      | Drag-created waypoints (green)       |
| PRIMARY_POINTS       | Point      | 3      | Click-created waypoints (numbered)   |

## Interactions

### Phase 1 — Placing points (before route is built)

- **Click on map** → creates a primary point with incremented orderIndex. The click interaction is defined on the PRIMARY_POINTS layer; when `items` is empty (click on empty space), a new point is created at the click coordinate.
- **Double-click on a primary point** → deletes it, renumbers remaining points. The doubleClick interaction is defined on the PRIMARY_POINTS layer.
- No route line exists yet
- "Build Route" button enabled when 2+ primary points

### Phase 2 — Route built

- **Click on map disabled** — no new primary points can be added
- **Modify on ROUTE_LINE** — user drags the route line:
  - `onEnd`: compare LineString coordinates before/after to find the new vertex
  - Create an intermediate point at the new vertex position
  - Insert it with an `orderIndex` between the two surrounding waypoints
  - Recalculate route via OSRM
- **Double-click on any point** → delete, recalculate route (if 2+ points remain, otherwise clear route and return to phase 1). The doubleClick interaction is defined on both PRIMARY_POINTS and INTERMEDIATE_POINTS layers.
- **Translate on INTERMEDIATE_POINTS** — drag intermediate points to adjust position:
  - `onEnd`: recalculate route via OSRM
- Primary points are NOT draggable
- "Reset" button — clears route and intermediate points, returns to phase 1

### Detecting new vertex after modify

The `applyGeometryToModel` for ROUTE_LINE is a no-op (returns `prev` unchanged) — the demo manages route geometry exclusively through OSRM responses.

In the `onEnd` callback of the modify interaction, read the new coordinates from `item.feature.getGeometry().getCoordinates()`. Compare with the previously stored `routeCoordinates` to identify the inserted vertex and its segment index. Use the segment index to compute the `orderIndex` for the new intermediate point.

### orderIndex strategy for intermediate points

Use fractional indexing: if an intermediate point is inserted between waypoints with orderIndex 2 and 3, assign it orderIndex 2.5. This avoids renumbering all points on every insert. Primary points always have integer orderIndex values.

## Styles

### ROUTE_LINE
- Base: solid blue (#2563eb), width 4px
- State MODIFY: dashed, width 5px
- Vertex handles (modify): white circles, radius 6px, blue stroke

### PRIMARY_POINTS
- Base: blue circle (#2563eb), radius 14px, white number label inside (orderIndex)
- State HOVER: orange (#f97316) stroke

### INTERMEDIATE_POINTS
- Base: green circle (#10b981), radius 8px, no label
- State DRAG: orange (#f97316) fill
- State HOVER: orange stroke

## OSRM Integration

### Endpoint

```
GET https://router.project-osrm.org/route/v1/driving/{coordinates}?overview=full&geometries=polyline
```

`{coordinates}`: semicolon-separated `lng,lat` pairs.

### When route is calculated

1. "Build Route" button click — initial route
2. `onEnd` of modify interaction on route line — after intermediate point creation
3. `onEnd` of translate on intermediate point — after dragging
4. Double-click deletion of any point (if 2+ points remain)

### Waypoint ordering

All waypoints (primary + intermediate) sorted by `orderIndex` → sent to OSRM in that order.

### Response handling

OSRM returns polyline-encoded geometry. Decode to `[lat, lng][]`, convert to `[lng, lat][]` for OpenLayers, update RouteLine model.

### Error handling

- OSRM error or network failure → show message, keep previous route line unchanged
- No debounce. If a request is in-flight, cancel it via `AbortController` before sending a new one.

## Component Structure

Single Angular standalone component: `MapRouteDragComponent`

### Files

- `projects/demo/src/app/map-route-drag/map-route-drag.component.ts`
- `projects/demo/src/app/map-route-drag/map-route-drag.component.html`

### State

```typescript
phase: 'placing' | 'routed'
primaryPoints: RouteWaypoint[]
intermediatePoints: RouteWaypoint[]
routeCoordinates: [number, number][]  // last known OSRM geometry for diff
loading: boolean
```

### Template

```html
<mff-map-host [config]="mapConfig" (ready)="onReady($event)">
  <div class="controls">
    <button (click)="buildRoute()" [disabled]="primaryPoints.length < 2 || loading">
      Build Route
    </button>
    <button (click)="resetRoute()" *ngIf="phase === 'routed'">
      Reset
    </button>
    <span *ngIf="loading">Loading...</span>
  </div>
</mff-map-host>
```

### Route registration

```typescript
{ path: 'map-route-drag', loadComponent: () => import('./map-route-drag/map-route-drag.component').then(m => m.MapRouteDragComponent) }
```

## What is NOT in scope

- Route optimization (TSP) — points are routed in the order placed
- Address search / geocoding
- Dragging primary points
- Library modifications — everything built on existing aur-openlayers API
