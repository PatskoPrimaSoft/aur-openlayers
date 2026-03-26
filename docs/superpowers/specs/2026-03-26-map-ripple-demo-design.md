# Map Ripple Demo — Design Spec

## Overview

A demo showcasing `aur-openlayers` with a map displaying city markers and a side panel. Clicking a city in the panel centers the map on it (without changing zoom) and triggers a ripple animation (expanding rings) from the point.

## Data

Six hardcoded cities with real coordinates:

| City | lat | lng |
|------|-----|-----|
| Moscow | 55.7558 | 37.6173 |
| London | 51.5074 | -0.1278 |
| New York | 40.7128 | -74.0060 |
| Tokyo | 35.6762 | 139.6503 |
| Sydney | -33.8688 | 151.2093 |
| Paris | 48.8566 | 2.3522 |

Model: a simple `City` interface with `id: string`, `name: string`, `lat: number`, `lng: number`.

Initial view: zoom ~2-3, centered approximately on Europe so multiple points are visible.

## Layout

Flex container, full viewport height.

- **Left panel** — `flex: 0 0 300px`. Contains a "Points" header and a scrollable list of city items. Each item displays the city name and coordinates (lat, lng). Clicking an item highlights it (left border accent + background change) and deselects the previous one.
- **Map** — `flex: 1`, fills remaining space. Uses `<app-map-host>` shared component.

## Centering

The library's `centerOnModel` uses `view.fit()` which changes zoom level. To center **without zoom change**, the demo uses OpenLayers `view.animate({ center: fromLonLat([lng, lat]), duration: 500 })` directly via the OL map reference from `MapHostComponent`.

## Ripple Animation

Triggered only by clicking a city in the side panel (not by clicking points on the map).

### Mechanism

A dedicated `ripple` VectorLayer in the MapSchema, separate from the `cities` layer. No interactions on the ripple layer.

Ring model: a simple `RippleRing` interface with `id: string`, `lat: number`, `lng: number`, `delay: number` (stagger offset in ms). The ripple layer's style function reads the current animation progress to compute radius and opacity per ring.

On panel click:
1. Center the map on the city (as above).
2. Create 3 `RippleRing` models at the city's coordinates (delays: 0, 150, 300ms) and add them to the ripple layer via `setModels()`.
3. Run a `requestAnimationFrame` loop for 1 second.
4. On each frame, update ring styles:
   - Radius grows from 0 to max (~50px) using `ol/style/Circle`.
   - Rings start staggered with ~150ms delay between each.
   - Opacity fades from 1 to 0 as rings expand.
   - Style: stroke only (no fill), width ~2px.
5. After 1 second, remove all ring models from the ripple layer.

### Parameters

- Max ring radius: ~50px
- Ring color: `rgba(41, 128, 185, <opacity>)`
- Duration: 1000ms
- Stagger delay between rings: ~150ms
- Ring stroke width: 2px

### City Point Style

Simple circle, ~8px radius, blue fill (`rgb(41, 128, 185)`), white stroke 2px.

## Architecture

Single standalone Angular component: `MapRippleDemoComponent`.

### Files

- `projects/demo/src/app/map-ripple-demo/map-ripple-demo.component.ts` — component logic: city data, map config with two layers, panel click handler, ripple animation.
- `projects/demo/src/app/map-ripple-demo/map-ripple-demo.component.scss` — panel and layout styles.
- `projects/demo/src/app/map-ripple-demo/map-ripple-demo.component.html` — template: panel + `<app-map-host>`.

### MapSchema — 2 Layers

1. **`cities`** — static city points with circle style (8px, blue, white stroke).
2. **`ripple`** — empty layer for temporary ripple ring features, no interactions.

### Data Flow

1. `onReady(ctx: MapContext)` — save context and OL map reference, set city models on the cities layer.
2. Panel click → `onCityClick(city)`:
   - Update selected city state in the panel.
   - Call `view.animate({ center })` for smooth panning.
   - Call `startRipple(city)` to begin animation.
3. `startRipple(city)` — add 3 ring models to ripple layer, animate via rAF, remove when done.

### Route Registration

Add a new route entry in `projects/demo/src/app/app.routes.ts` with lazy-loaded component.

## Code Principles

The code must be minimal and straightforward. The primary focus of this demo is the ripple animation ("circles on water") — all other code (layout, panel, centering) should be as simple as possible and not distract from the main feature. Avoid abstractions, helpers, or over-engineering.

## Non-Goals

- No interaction with points directly on the map (click/hover).
- No clustering.
- No popups.
- No additional services or utilities — everything in one component.
