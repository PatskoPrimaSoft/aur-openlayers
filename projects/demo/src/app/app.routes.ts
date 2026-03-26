import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./demo-index/demo-index.component').then((m) => m.DemoIndexComponent),
  },
  {
    path: 'simple-map',
    data: {
      title: 'Статические точки',
      component: 'SimpleMapComponent',
      description: 'Слой с фиксированными точками и их названиями.',
    },
    loadComponent: () =>
      import('./simple-map/simple-map.component').then((m) => m.SimpleMapComponent),
  },
  {
    path: 'simple-map-two-static-layers',
    data: {
      title: 'Два слоя: точки и линия',
      component: 'SimpleMapTwoStaticLayersComponent',
      description: 'Точки и линейный слой с управлением видимостью и прозрачностью.',
    },
    loadComponent: () =>
      import('./simple-map-two-static-layers/simple-map-two-static-layers.component').then((m) => m.SimpleMapTwoStaticLayersComponent),
  },
  {
    path: 'map-point-move',
    data: {
      title: 'Перетаскивание точки',
      component: 'MapPointMoveComponent',
      description: 'Перетаскивание маркера с обновлением координат.',
    },
    loadComponent: () =>
      import('./map-point-move/map-point-move.component').then(
        (m) => m.MapPointMoveComponent,
      ),
  },
  {
    path: 'map-point-change-style',
    data: {
      title: 'Смена стиля точек',
      component: 'MapPointChangeStyleComponent',
      description: 'Переключение цвета точек с обновлением стилей на карте.',
    },
    loadComponent: () =>
      import('./map-point-change-style/map-point-change-style.component').then(
        (m) => m.MapPointChangeStyleComponent,
      ),
  },
  {
    path: 'map-point-zoom-labels',
    data: {
      title: 'Подписи точек на разных зумах',
      component: 'MapPointZoomLabelsComponent',
      description: 'LOD-стили: подписи появляются при увеличении масштаба.',
    },
    loadComponent: () =>
      import('./map-point-zoom-labels/map-point-zoom-labels.component').then(
        (m) => m.MapPointZoomLabelsComponent,
      ),
  },
  {
    path: 'map-translate-threshold-events',
    data: {
      title: 'Сравнение translate.startThresholdPx',
      component: 'MapTranslateThresholdEventsComponent',
      description: 'Сравнение порядка событий при взаимодействии с точками.',
    },
    loadComponent: () =>
      import('./map-translate-threshold-events/map-translate-threshold-events.component').then(
        (m) => m.MapTranslateThresholdEventsComponent,
      ),
  },
  {
    path: 'map-select-interaction',
    data: {
      title: 'Выбор точки на карте',
      component: 'MapSelectInteractionComponent',
      description: 'Клик по точке выделяет её и показывает название.',
    },
    loadComponent: () =>
      import('./map-select-interaction/map-select-interaction.component').then(
        (m) => m.MapSelectInteractionComponent,
      ),
  },
  {
    path: 'map-click-interaction',
    data: {
      title: 'Клик по карте',
      component: 'MapClickInteractionComponent',
      description: 'Нажмите на карту, чтобы получить координаты клика.',
    },
    loadComponent: () =>
      import('./map-click-interaction/map-click-interaction.component').then(
        (m) => m.MapClickInteractionComponent,
      ),
  },
  {
    path: 'static-map-point-popup',
    data: {
      title: 'Попап точки при наведении',
      component: 'StaticMapPointPopupComponent',
      description: 'Наведите на точку для попапа с данными объекта.',
    },
    loadComponent: () =>
      import('./static-map-point-popup/static-map-point-popup.component').then((m) => m.StaticMapPointPopupComponent),
  },
  {
    path: 'map-five-points-cluster',
    data: {
      title: 'Кластеризация точек',
      component: 'MapFivePointsClusterComponent',
      description: 'Слой из точек с переключаемой кластеризацией.',
    },
    loadComponent: () =>
      import('./map-five-points-cluster/map-five-points-cluster.component').then(
        (m) => m.MapFivePointsClusterComponent,
      ),
  },
  {
    path: 'map-line-drag-points',
    data: {
      title: 'Линия по точкам с перетаскиванием',
      component: 'MapLineDragPointsComponent',
      description: 'Точки соединённые линией с пересчётом при перетаскивании.',
    },
    loadComponent: () =>
      import('./map-line-drag-points/map-line-drag-points.component').then(
        (m) => m.MapLineDragPointsComponent,
      ),
  },
  {
    path: 'map-polygons-labels',
    data: {
      title: 'Полигоны с подписями',
      component: 'MapPolygonsLabelsComponent',
      description: 'Три полигона с названиями внутри каждой фигуры.',
    },
    loadComponent: () =>
      import('./map-polygons-labels/map-polygons-labels.component').then(
        (m) => m.MapPolygonsLabelsComponent,
      ),
  },
  {
    path: 'map-polygons-modify',
    data: {
      title: 'Редактирование полигонов',
      component: 'MapPolygonsModifyComponent',
      description: 'Перемещение вершин полигонов с обновлением координат.',
    },
    loadComponent: () =>
      import('./map-polygons-modify/map-polygons-modify.component').then(
        (m) => m.MapPolygonsModifyComponent,
      ),
  },
  {
    path: 'map-point-mutate',
    data: {
      title: 'Редактирование данных точек',
      component: 'MapPointMutateComponent',
      description: 'Редактирование имени и координат точек через форму.',
    },
    loadComponent: () =>
      import('./map-point-mutate/map-point-mutate.component').then(
        (m) => m.MapPointMutateComponent,
      ),
  },
  {
    path: 'map-route-iterations',
    data: {
      title: 'Маршрут с изменением порядка',
      component: 'MapRouteIterationsComponent',
      description: 'Точки с линией, изменение порядка и имён через список.',
    },
    loadComponent: () =>
      import('./map-route-iterations/map-route-iterations.component').then(
        (m) => m.MapRouteIterationsComponent,
      ),
  },
  {
    path: 'map-route-edit-point',
    data: {
      title: 'Маршрут: редактирование одной точки',
      component: 'MapRouteEditPointComponent',
      description: 'Выбор и перетаскивание одной точки маршрута.',
    },
    loadComponent: () =>
      import('./map-route-edit-point/map-route-edit-point.component').then(
        (m) => m.MapRouteEditPointComponent,
      ),
  },
  {
    path: 'map-route-add-point',
    data: {
      title: 'Маршрут с добавлением точки',
      component: 'MapRouteAddPointComponent',
      description: 'Интерактивное добавление точки в маршрут кликом.',
    },
    loadComponent: () =>
      import('./map-route-add-point/map-route-add-point.component').then(
        (m) => m.MapRouteAddPointComponent,
      ),
  },
  {
    path: 'map-route-drag',
    data: {
      title: 'Маршрут с промежуточными точками',
      component: 'MapRouteDragComponent',
      description: 'Построение маршрута с OSRM и перетаскиваемыми промежуточными точками.',
    },
    loadComponent: () =>
      import('./map-route-drag/map-route-drag.component').then(
        (m) => m.MapRouteDragComponent,
      ),
  },
  {
    path: 'map-ripple-demo',
    data: {
      title: 'Ripple-анимация при выборе точки',
      component: 'MapRippleDemoComponent',
      description: 'Панель с городами и анимация "кругов на воде" при клике.',
    },
    loadComponent: () =>
      import('./map-ripple-demo/map-ripple-demo.component').then(
        (m) => m.MapRippleDemoComponent,
      ),
  },
  {
    path: 'center-on-layers',
    data: {
      title: 'Центрирование по слоям',
      component: 'CenterOnLayersComponent',
      description: 'Центрирование карты на всех или выбранных слоях.',
    },
    loadComponent: () =>
      import('./center-on-layers/center-on-layers.component').then(
        (m) => m.CenterOnLayersComponent,
      ),
  },
];
