# Route Drag Demo — Design Spec

## Overview

Interactive demo for the aur-openlayers library: user places checkpoints on a map, builds a route via OSRM, then adds intermediate waypoints by clicking and adjusts them by dragging. All routing logic lives in the demo — the library provides only map primitives.

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

- `primary` — placed by clicking the map in phase 1, displays a numbered marker
- `intermediate` — placed by clicking the map in phase 2, displays a colored marker without a number

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
| INTERMEDIATE_POINTS  | Point      | 2      | Click-created intermediate waypoints  |
| PRIMARY_POINTS       | Point      | 3      | Click-created checkpoints (numbered)  |

## Interactions

### Phase 1 — Placing checkpoints (before route is built)

- **Click on map** → creates a primary point with incremented orderIndex. The click interaction is defined on the PRIMARY_POINTS layer; when `items` is empty (click on empty space), a new point is created at the click coordinate.
- **Double-click on a primary point** → deletes it, renumbers remaining points.
- No route line exists yet
- "Build Route" button enabled when 2+ primary points

### Phase 2 — Route built

- **Click on map** → creates an intermediate point. The click interaction is defined on the INTERMEDIATE_POINTS layer; when `items` is empty (click on empty space), a new intermediate point is created. Its `orderIndex` is computed by finding the nearest segment of the current route and inserting between the two surrounding waypoints (fractional index).
- **Translate on INTERMEDIATE_POINTS** — drag intermediate points to adjust position. `onEnd`: recalculate route via OSRM.
- **Double-click on any point** → delete, recalculate route (if 2+ total points remain, otherwise clear route and return to phase 1). The doubleClick interaction is defined on both PRIMARY_POINTS and INTERMEDIATE_POINTS layers.
- Primary points are NOT draggable
- "Reset" button — clears route and intermediate points, returns to phase 1

### orderIndex strategy for intermediate points

When a new intermediate point is added by clicking, find the nearest segment of the route polyline. Determine which two waypoints that segment lies between. Assign a fractional orderIndex between them (e.g., between orderIndex 2 and 3 → assign 2.5). Primary points always have integer orderIndex values.

### Composite labels for intermediate points

Intermediate points display composite labels showing which segment they belong to and their sequential index within that segment. Format: `{segmentStart}.{indexWithinSegment}`. For example, intermediate points between primary checkpoints 2 and 3 are labeled "2.1", "2.2", "2.3", etc. Labels are recalculated dynamically from the sorted waypoint list — when a point is added or removed, all intermediate labels update.

## Styles

### ROUTE_LINE
- Base: solid blue (#2563eb), width 4px

### PRIMARY_POINTS
- Base: blue circle (#2563eb), radius 14px, white number label inside (orderIndex)
- State HOVER: orange (#f97316) stroke

### INTERMEDIATE_POINTS
- Base: green circle (#10b981), radius 10px, white composite label inside (e.g. "2.1")
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
2. Click to add intermediate point — recalculate with new point
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
- `projects/demo/src/app/map-route-drag/map-route-drag.component.scss`

### State

```typescript
phase: 'placing' | 'routed'
primaryPoints: RouteWaypoint[]
intermediatePoints: RouteWaypoint[]
loading: boolean
```

## What is NOT in scope

- Route optimization (TSP) — points are routed in the order placed
- Address search / geocoding
- Dragging primary points
- Modify interaction on the route line
- Library modifications — everything built on existing aur-openlayers API
