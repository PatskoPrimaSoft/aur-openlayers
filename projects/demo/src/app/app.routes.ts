import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'simple-map',
  },
  {
    path: 'simple-map',
    loadComponent: () =>
      import('./simple-map/simple-map.component').then((m) => m.SimpleMapComponent),
  },
  {
    path: 'map-point-mutate',
    loadComponent: () =>
      import('./map-point-mutate/map-point-mutate.component').then(
        (m) => m.MapPointMutateComponent,
      ),
  },
  {
    path: 'map-point-move',
    loadComponent: () =>
      import('./map-point-move/map-point-move.component').then(
        (m) => m.MapPointMoveComponent,
      ),
  },
  {
    path: 'map-select-interaction',
    loadComponent: () =>
      import('./map-select-interaction/map-select-interaction.component').then(
        (m) => m.MapSelectInteractionComponent,
      ),
  },
  {
    path: 'map-click-interaction',
    loadComponent: () =>
      import('./map-click-interaction/map-click-interaction.component').then(
        (m) => m.MapClickInteractionComponent,
      ),
  },
  {
    path: 'simple-map-two-static-layers',
    loadComponent: () =>
      import('./simple-map-two-static-layers/simple-map-two-static-layers.component').then((m) => m.SimpleMapTwoStaticLayersComponent),
  },
  {
    path: 'map-five-points-cluster',
    loadComponent: () =>
      import('./map-five-points-cluster/map-five-points-cluster.component').then(
        (m) => m.MapFivePointsClusterComponent,
      ),
  },
  {
    path: 'map-line-drag-points',
    loadComponent: () =>
      import('./map-line-drag-points/map-line-drag-points.component').then(
        (m) => m.MapLineDragPointsComponent,
      ),
  },
  {
    path: 'map-polygons-labels',
    loadComponent: () =>
      import('./map-polygons-labels/map-polygons-labels.component').then(
        (m) => m.MapPolygonsLabelsComponent,
      ),
  },
  {
    path: 'map-polygons-modify',
    loadComponent: () =>
      import('./map-polygons-modify/map-polygons-modify.component').then(
        (m) => m.MapPolygonsModifyComponent,
      ),
  },
  {
    path: 'map-route-iterations',
    loadComponent: () =>
      import('./map-route-iterations/map-route-iterations.component').then(
        (m) => m.MapRouteIterationsComponent,
      ),
  },

  {
    path: 'map-route-edit-point',
    loadComponent: () =>
      import('./map-route-edit-point/map-route-edit-point.component').then(
        (m) => m.MapRouteEditPointComponent,
      ),
  },
  {
    path: 'map-route-add-point',
    loadComponent: () =>
      import('./map-route-add-point/map-route-add-point.component').then(
        (m) => m.MapRouteAddPointComponent,
      ),
  },
  {
    path: 'static-map-point-popup',
    loadComponent: () =>
      import('./static-map-point-popup/static-map-point-popup.component').then((m) => m.StaticMapPointPopupComponent),
  },
  {
    path: 'map-point-change-style',
    loadComponent: () =>
      import('./map-point-change-style/map-point-change-style.component').then(
        (m) => m.MapPointChangeStyleComponent,
      ),
  },
  {
    path: 'map-point-zoom-labels',
    loadComponent: () =>
      import('./map-point-zoom-labels/map-point-zoom-labels.component').then(
        (m) => m.MapPointZoomLabelsComponent,
      ),
  },
  {
    path: 'map-translate-threshold-events',
    loadComponent: () =>
      import('./map-translate-threshold-events/map-translate-threshold-events.component').then(
        (m) => m.MapTranslateThresholdEventsComponent,
      ),
  },
  {
    path: 'map-route-drag',
    loadComponent: () =>
      import('./map-route-drag/map-route-drag.component').then(
        (m) => m.MapRouteDragComponent,
      ),
  },
];
