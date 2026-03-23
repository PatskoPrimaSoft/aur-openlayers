# Demo Navigation Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global nav bar with an index page of demo cards and a shared demo header component on each demo page.

**Architecture:** Create two new standalone Angular components — `DemoIndexComponent` (card grid index page) and `DemoHeaderComponent` (shared header with back button and metadata). Strip the nav/header from `AppComponent`. Add route `data` for index page cards. Update all 18 demo templates to use the new header.

**Tech Stack:** Angular 19 (standalone components), SCSS, Angular Router

**Spec:** `docs/superpowers/specs/2026-03-23-demo-navigation-redesign.md`

---

## File Structure

**New files:**
- `projects/demo/src/app/shared/demo-header/demo-header.component.ts` — shared header with back button, title, component name, description, features, interactions
- `projects/demo/src/app/shared/demo-header/demo-header.component.html` — template
- `projects/demo/src/app/shared/demo-header/demo-header.component.scss` — styles
- `projects/demo/src/app/demo-index/demo-index.component.ts` — index page reading route data
- `projects/demo/src/app/demo-index/demo-index.component.html` — card grid template
- `projects/demo/src/app/demo-index/demo-index.component.scss` — responsive grid styles

**Modified files:**
- `projects/demo/src/app/app.component.ts` — remove RouterLink, RouterLinkActive
- `projects/demo/src/app/app.component.html` — remove header, nav, section wrapper
- `projects/demo/src/app/app.component.scss` — remove header/nav/content styles
- `projects/demo/src/app/app.routes.ts` — add index route + data to all 18 routes
- 18 demo `.html` templates — replace `<header class="map-header">` with `<app-demo-header>`
- 18 demo `.ts` files — add `DemoHeaderComponent` to imports
- `projects/demo/src/styles.scss` — remove `.map-header` global styles (moved to DemoHeaderComponent)

---

### Task 1: Create DemoHeaderComponent

**Files:**
- Create: `projects/demo/src/app/shared/demo-header/demo-header.component.ts`
- Create: `projects/demo/src/app/shared/demo-header/demo-header.component.html`
- Create: `projects/demo/src/app/shared/demo-header/demo-header.component.scss`

- [ ] **Step 1: Create component TypeScript file**

```typescript
// projects/demo/src/app/shared/demo-header/demo-header.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-demo-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './demo-header.component.html',
  styleUrl: './demo-header.component.scss',
})
export class DemoHeaderComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) component!: string;
  @Input({ required: true }) description!: string;
  @Input() features: string[] = [];
  @Input() interactions: string[] = [];
}
```

- [ ] **Step 2: Create component template**

```html
<!-- projects/demo/src/app/shared/demo-header/demo-header.component.html -->
<header class="demo-header">
  <div class="demo-header__top">
    <a routerLink="/" class="demo-header__back">← К списку</a>
    <div class="demo-header__title-block">
      <h2 class="demo-header__title">{{ title }}</h2>
      <span class="demo-header__component">{{ component }}</span>
    </div>
  </div>

  <p class="demo-header__description">{{ description }}</p>

  <div class="demo-header__meta" *ngIf="features.length || interactions.length">
    <div class="demo-header__features" *ngIf="features.length">
      <span class="demo-header__label">Фичи:</span>
      <span class="demo-header__tag" *ngFor="let f of features">{{ f }}</span>
    </div>
    <div class="demo-header__interactions" *ngIf="interactions.length">
      <span class="demo-header__label">Взаимодействие:</span>
      <span>{{ interactions.join(', ') }}</span>
    </div>
  </div>
</header>
```

- [ ] **Step 3: Create component styles**

```scss
// projects/demo/src/app/shared/demo-header/demo-header.component.scss
.demo-header {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
}

.demo-header__top {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.demo-header__back {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  text-decoration: none;
  color: #1f2937;
  background: #f1f5f9;
  border: 1px solid rgba(15, 23, 42, 0.1);
  font-size: 0.875rem;
  white-space: nowrap;
  transition: background 0.2s ease, border-color 0.2s ease;

  &:hover {
    background: #e8f0fe;
    border-color: #c4d7f2;
  }
}

.demo-header__title-block {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.demo-header__title {
  margin: 0;
  font-size: 1.5rem;
}

.demo-header__component {
  font-size: 0.75rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.demo-header__description {
  margin: 0;
  color: #5b6470;
}

.demo-header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.875rem;
}

.demo-header__label {
  color: #64748b;
  font-weight: 600;
  margin-right: 0.35rem;
}

.demo-header__features {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.demo-header__tag {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: #e8f0fe;
  color: #1e40af;
  font-size: 0.8rem;
}

.demo-header__interactions {
  display: flex;
  align-items: baseline;
  color: #5b6470;
}
```

- [ ] **Step 4: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds (component is created but not yet used anywhere — Angular tree-shakes unused components, so no errors expected)

- [ ] **Step 5: Commit**

```bash
git add projects/demo/src/app/shared/demo-header/
git commit -m "feat(demo): add shared DemoHeaderComponent"
```

---

### Task 2: Create DemoIndexComponent

**Files:**
- Create: `projects/demo/src/app/demo-index/demo-index.component.ts`
- Create: `projects/demo/src/app/demo-index/demo-index.component.html`
- Create: `projects/demo/src/app/demo-index/demo-index.component.scss`

- [ ] **Step 1: Create component TypeScript file**

```typescript
// projects/demo/src/app/demo-index/demo-index.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

interface DemoCard {
  path: string;
  title: string;
  component: string;
  description: string;
}

@Component({
  selector: 'app-demo-index',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './demo-index.component.html',
  styleUrl: './demo-index.component.scss',
})
export class DemoIndexComponent {
  private readonly router = inject(Router);

  readonly demos: DemoCard[] = this.router.config
    .filter((route): route is typeof route & { data: { title: string } } =>
      !!route.data && 'title' in route.data
    )
    .map(route => ({
      path: '/' + route.path,
      title: route.data!['title'] as string,
      component: route.data!['component'] as string,
      description: route.data!['description'] as string,
    }));
}
```

- [ ] **Step 2: Create component template**

```html
<!-- projects/demo/src/app/demo-index/demo-index.component.html -->
<section class="demo-index">
  <header class="demo-index__header">
    <h1>Демо карт</h1>
    <p>Примеры использования библиотеки в отдельных компонентах.</p>
  </header>

  <div class="demo-index__grid">
    <a
      *ngFor="let demo of demos"
      [routerLink]="demo.path"
      class="demo-card"
    >
      <span class="demo-card__component">{{ demo.component }}</span>
      <span class="demo-card__title">{{ demo.title }}</span>
      <span class="demo-card__description">{{ demo.description }}</span>
    </a>
  </div>
</section>
```

- [ ] **Step 3: Create component styles**

```scss
// projects/demo/src/app/demo-index/demo-index.component.scss
.demo-index {
  display: grid;
  gap: 1.5rem;
}

.demo-index__header h1 {
  margin: 0;
  font-size: 2rem;
}

.demo-index__header p {
  margin: 0.25rem 0 0;
  color: #5b6470;
}

.demo-index__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.demo-card {
  display: grid;
  gap: 0.35rem;
  padding: 1.1rem 1.25rem;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;

  &:hover {
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.12);
    border-color: #c4d7f2;
  }
}

.demo-card__component {
  font-size: 0.7rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.demo-card__title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1c1f24;
}

.demo-card__description {
  font-size: 0.85rem;
  color: #5b6470;
}
```

- [ ] **Step 4: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add projects/demo/src/app/demo-index/
git commit -m "feat(demo): add DemoIndexComponent with card grid"
```

---

### Task 3: Update Routes and Simplify AppComponent

**Files:**
- Modify: `projects/demo/src/app/app.routes.ts`
- Modify: `projects/demo/src/app/app.component.ts`
- Modify: `projects/demo/src/app/app.component.html`
- Modify: `projects/demo/src/app/app.component.scss`
- Modify: `projects/demo/src/styles.scss`

- [ ] **Step 1: Update app.routes.ts — add index route and data to all 18 routes**

Replace the entire file content. The root path now loads `DemoIndexComponent` instead of redirecting. Each route gets a `data` object:

```typescript
// projects/demo/src/app/app.routes.ts
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
];
```

- [ ] **Step 2: Simplify app.component.ts**

Remove `RouterLink` and `RouterLinkActive` from imports:

```typescript
// projects/demo/src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {}
```

- [ ] **Step 3: Simplify app.component.html**

Remove header, nav, and section wrapper:

```html
<!-- projects/demo/src/app/app.component.html -->
<main class="app">
  <router-outlet/>
</main>
```

- [ ] **Step 4: Simplify app.component.scss**

Keep only `.app` container:

```scss
// projects/demo/src/app/app.component.scss
.app {
  display: grid;
  gap: 1.5rem;
  padding: 1.5rem;
  min-height: 100vh;
  background: #f6f7fb;
  color: #1c1f24;
  box-sizing: border-box;
}
```

- [ ] **Step 5: Remove .map-header styles from global styles.scss**

In `projects/demo/src/styles.scss`, remove the `.map-header` styles (lines 19-27):

```scss
// REMOVE these lines:
.map-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.map-header p {
  margin: 0.25rem 0 0;
  color: #5b6470;
}
```

Keep everything else in the file unchanged.

- [ ] **Step 6: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds. The index page is now routed, the nav bar is removed.

- [ ] **Step 7: Commit**

```bash
git add projects/demo/src/app/app.routes.ts projects/demo/src/app/app.component.ts projects/demo/src/app/app.component.html projects/demo/src/app/app.component.scss projects/demo/src/styles.scss
git commit -m "refactor(demo): replace nav bar with index route, simplify AppComponent"
```

---

### Task 4: Migrate demo components — simple pattern (no sidebar)

Update the 6 demos that follow the simple layout (no sidebar controls): `simple-map`, `map-point-zoom-labels`, `map-select-interaction`, `map-click-interaction`, `static-map-point-popup`, `map-polygons-labels`.

**Files:**
- Modify: `projects/demo/src/app/simple-map/simple-map.component.html`
- Modify: `projects/demo/src/app/simple-map/simple-map.component.ts`
- Modify: `projects/demo/src/app/map-point-zoom-labels/map-point-zoom-labels.component.html`
- Modify: `projects/demo/src/app/map-point-zoom-labels/map-point-zoom-labels.component.ts`
- Modify: `projects/demo/src/app/map-select-interaction/map-select-interaction.component.html`
- Modify: `projects/demo/src/app/map-select-interaction/map-select-interaction.component.ts`
- Modify: `projects/demo/src/app/map-click-interaction/map-click-interaction.component.html`
- Modify: `projects/demo/src/app/map-click-interaction/map-click-interaction.component.ts`
- Modify: `projects/demo/src/app/static-map-point-popup/static-map-point-popup.component.html`
- Modify: `projects/demo/src/app/static-map-point-popup/static-map-point-popup.component.ts`
- Modify: `projects/demo/src/app/map-polygons-labels/map-polygons-labels.component.html`
- Modify: `projects/demo/src/app/map-polygons-labels/map-polygons-labels.component.ts`

- [ ] **Step 1: Migrate simple-map**

In `simple-map.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Базовая карта со статическими точками"
  component="SimpleMapComponent"
  description="Демонстрирует слой с фиксированными точками и их названиями."
  [features]="['setModels', 'style.base', 'style.render']"
  [interactions]="['Просмотр статических точек на карте']"
/>
```

In `simple-map.component.ts`, add `DemoHeaderComponent` to imports:
```typescript
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';
// ...
imports: [MapHostComponent, DemoHeaderComponent],
```

- [ ] **Step 2: Migrate map-point-zoom-labels**

In `map-point-zoom-labels.component.html`, replace the `<header class="map-header">...</header>` block (note: has multiple `<p>` tags with interpolation) with:
```html
<app-demo-header
  title="Подписи точек на разных зумах"
  component="MapPointZoomLabelsComponent"
  description="LOD-стили: подписи появляются при увеличении масштаба и скрываются при отдалении."
  [features]="['style.base с zoom', 'LOD-рендеринг']"
  [interactions]="['Масштабирование карты для появления/скрытия подписей']"
/>
```

In `map-point-zoom-labels.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 3: Migrate map-select-interaction**

In `map-select-interaction.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Выбор точки на карте"
  component="MapSelectInteractionComponent"
  description="Клик по точке выделяет её на карте и показывает название."
  [features]="['interactions.select', 'onSelect callback']"
  [interactions]="['Клик по точке для выделения']"
/>
```

In `map-select-interaction.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 4: Migrate map-click-interaction**

In `map-click-interaction.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Клик по карте"
  component="MapClickInteractionComponent"
  description="Нажмите на карту, чтобы получить координаты клика."
  [features]="['interactions.click', 'onClick callback']"
  [interactions]="['Клик по любой области карты']"
/>
```

In `map-click-interaction.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 5: Migrate static-map-point-popup**

In `static-map-point-popup.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Попап точки при наведении"
  component="StaticMapPointPopupComponent"
  description="Наведите курсор на точку, чтобы увидеть попап с данными объекта."
  [features]="['interactions.hover', 'overlay popup']"
  [interactions]="['Наведение курсора на точку']"
/>
```

In `static-map-point-popup.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 6: Migrate map-polygons-labels**

In `map-polygons-labels.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Карта с полигонами и подписями"
  component="MapPolygonsLabelsComponent"
  description="Три полигона с названиями, размещенными внутри каждой фигуры."
  [features]="['Polygon geometry', 'Text placement внутри полигона']"
  [interactions]="['Просмотр полигонов на карте']"
/>
```

In `map-polygons-labels.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 7: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add projects/demo/src/app/simple-map/ projects/demo/src/app/map-point-zoom-labels/ projects/demo/src/app/map-select-interaction/ projects/demo/src/app/map-click-interaction/ projects/demo/src/app/static-map-point-popup/ projects/demo/src/app/map-polygons-labels/
git commit -m "refactor(demo): migrate 6 simple-layout demos to DemoHeaderComponent"
```

---

### Task 5: Migrate demo components — sidebar pattern (map-controls)

Update 3 demos using `map-controls` sidebar: `map-point-move`, `map-point-change-style`, `map-point-mutate`.

**Files:**
- Modify: `projects/demo/src/app/map-point-move/map-point-move.component.html`
- Modify: `projects/demo/src/app/map-point-move/map-point-move.component.ts`
- Modify: `projects/demo/src/app/map-point-change-style/map-point-change-style.component.html`
- Modify: `projects/demo/src/app/map-point-change-style/map-point-change-style.component.ts`
- Modify: `projects/demo/src/app/map-point-mutate/map-point-mutate.component.html`
- Modify: `projects/demo/src/app/map-point-mutate/map-point-mutate.component.ts`

- [ ] **Step 1: Migrate map-point-move**

In `map-point-move.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Перетаскивание точки"
  component="MapPointMoveComponent"
  description="Перетаскивайте маркер на карте и наблюдайте обновление координат."
  [features]="['interactions.translate', 'onDragEnd callback']"
  [interactions]="['Перетаскивание маркера по карте']"
/>
```

In `map-point-move.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 2: Migrate map-point-change-style**

In `map-point-change-style.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Смена стиля точек"
  component="MapPointChangeStyleComponent"
  description="Переключайте цвет точек и смотрите обновление стилей прямо на карте."
  [features]="['style.states', 'mutate для смены стиля']"
  [interactions]="['Клик по кнопкам цвета в боковой панели']"
/>
```

In `map-point-change-style.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 3: Migrate map-point-mutate**

In `map-point-mutate.component.html`, replace the `<header class="map-header">...</header>` block with:
```html
<app-demo-header
  title="Редактирование данных точек"
  component="MapPointMutateComponent"
  description="Меняйте имя и координаты в форме и наблюдайте обновление точек на карте."
  [features]="['mutate', 'centerOnModel']"
  [interactions]="['Изменение полей формы в боковой панели']"
/>
```

In `map-point-mutate.component.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 4: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add projects/demo/src/app/map-point-move/ projects/demo/src/app/map-point-change-style/ projects/demo/src/app/map-point-mutate/
git commit -m "refactor(demo): migrate 3 map-controls demos to DemoHeaderComponent"
```

---

### Task 6: Migrate demo components — map-panel and map-info sidebar pattern

Update 6 demos using `map-panel` or `map-info` sidebars: `map-five-points-cluster`, `map-route-iterations`, `map-route-add-point`, `map-line-drag-points`, `map-polygons-modify`, `map-route-drag`.

**Files:**
- Modify: `projects/demo/src/app/map-five-points-cluster/map-five-points-cluster.component.html`
- Modify: `projects/demo/src/app/map-five-points-cluster/map-five-points-cluster.component.ts`
- Modify: `projects/demo/src/app/map-route-iterations/map-route-iterations.component.html`
- Modify: `projects/demo/src/app/map-route-iterations/map-route-iterations.component.ts`
- Modify: `projects/demo/src/app/map-route-add-point/map-route-add-point.component.html`
- Modify: `projects/demo/src/app/map-route-add-point/map-route-add-point.component.ts`
- Modify: `projects/demo/src/app/map-line-drag-points/map-line-drag-points.component.html`
- Modify: `projects/demo/src/app/map-line-drag-points/map-line-drag-points.component.ts`
- Modify: `projects/demo/src/app/map-polygons-modify/map-polygons-modify.component.html`
- Modify: `projects/demo/src/app/map-polygons-modify/map-polygons-modify.component.ts`
- Modify: `projects/demo/src/app/map-route-drag/map-route-drag.component.html`
- Modify: `projects/demo/src/app/map-route-drag/map-route-drag.component.ts`

- [ ] **Step 1: Migrate map-five-points-cluster**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Пять точек с кластеризацией"
  component="MapFivePointsClusterComponent"
  description="Слой из точек с переключаемой кластеризацией."
  [features]="['cluster layer', 'toggle кластеризации']"
  [interactions]="['Переключение кластеризации в боковой панели', 'Масштабирование карты']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 2: Migrate map-line-drag-points**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Линия по точкам с перетаскиванием"
  component="MapLineDragPointsComponent"
  description="Точки соединённые линией. Перетаскивайте точки — линия пересчитывается автоматически."
  [features]="['MultiPoint + LineString layers', 'translate', 'onModelsChanged']"
  [interactions]="['Перетаскивание точек по карте']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 3: Migrate map-polygons-modify**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Редактирование полигонов"
  component="MapPolygonsModifyComponent"
  description="Перемещайте вершины, чтобы изменить форму полигонов и увидеть обновлённые координаты."
  [features]="['Polygon geometry', 'modify interaction', 'onModelsChanged']"
  [interactions]="['Перетаскивание вершин полигонов']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 4: Migrate map-route-iterations**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Маршрут с изменением порядка"
  component="MapRouteIterationsComponent"
  description="Точки соединены линией, индекс отображается в круге. Наведение раскрывает детали, выбор позволяет изменить имя и порядок."
  [features]="['select', 'hover', 'LineString layer', 'mutate']"
  [interactions]="['Наведение на точки', 'Клик для выбора', 'Изменение порядка в панели']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 5: Migrate map-route-add-point**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Маршрут с добавлением точки"
  component="MapRouteAddPointComponent"
  description="Интерактивное добавление точки: черновик создаётся кликом, доступен для перетаскивания и сохраняется в конец маршрута."
  [features]="['click', 'translate', 'addModel', 'removeModelsById']"
  [interactions]="['Клик по карте для создания черновика', 'Перетаскивание черновика', 'Сохранение через панель']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 6: Migrate map-route-drag**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Маршрут с промежуточными точками"
  component="MapRouteDragComponent"
  description="Расставьте контрольные точки, постройте маршрут, затем кликайте по карте для добавления промежуточных точек."
  [features]="['translate', 'click', 'OSRM routing', 'direction arrows', 'multiple layers']"
  [interactions]="['Клик по карте для точек', 'Построение маршрута', 'Перетаскивание промежуточных точек']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 7: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add projects/demo/src/app/map-five-points-cluster/ projects/demo/src/app/map-line-drag-points/ projects/demo/src/app/map-polygons-modify/ projects/demo/src/app/map-route-iterations/ projects/demo/src/app/map-route-add-point/ projects/demo/src/app/map-route-drag/
git commit -m "refactor(demo): migrate 6 panel/info-sidebar demos to DemoHeaderComponent"
```

---

### Task 7: Migrate remaining demo components

Update the remaining 3 demos: `simple-map-two-static-layers` (inline controls), `map-translate-threshold-events` (dual-map grid), `map-route-edit-point` (custom sidebar).

**Files:**
- Modify: `projects/demo/src/app/simple-map-two-static-layers/simple-map-two-static-layers.component.html`
- Modify: `projects/demo/src/app/simple-map-two-static-layers/simple-map-two-static-layers.component.ts`
- Modify: `projects/demo/src/app/map-translate-threshold-events/map-translate-threshold-events.component.html`
- Modify: `projects/demo/src/app/map-translate-threshold-events/map-translate-threshold-events.component.ts`
- Modify: `projects/demo/src/app/map-route-edit-point/map-route-edit-point.component.html`
- Modify: `projects/demo/src/app/map-route-edit-point/map-route-edit-point.component.ts`

- [ ] **Step 1: Migrate simple-map-two-static-layers**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Два слоя: точки и линия"
  component="SimpleMapTwoStaticLayersComponent"
  description="Карта с точками и линейным слоем, который можно скрывать и менять его прозрачность."
  [features]="['multiple layers', 'layer visibility toggle', 'opacity control']"
  [interactions]="['Кнопка скрытия слоя', 'Ползунок прозрачности']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 2: Migrate map-translate-threshold-events**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Сравнение translate.startThresholdPx"
  component="MapTranslateThresholdEventsComponent"
  description="Взаимодействуйте с точками на двух картах и сравните порядок событий: onSelect, onClear, onDragStart, onDragChange, onDragEnd."
  [features]="['translate.startThresholdPx', 'onSelect', 'onDragStart', 'onDragEnd']"
  [interactions]="['Перетаскивание точек на обеих картах', 'Сравнение событий в логах']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 3: Migrate map-route-edit-point**

Replace `<header class="map-header">...</header>` with:
```html
<app-demo-header
  title="Маршрут и редактирование одной точки"
  component="MapRouteEditPointComponent"
  description="Выберите точку по кнопке «Редактировать» и на карте можно перетаскивать только её."
  [features]="['translate с enabled filter', 'select', 'conditional dragging']"
  [interactions]="['Выбор точки через кнопку «Редактировать»', 'Перетаскивание выбранной точки']"
/>
```

In `.ts`, add `DemoHeaderComponent` to imports.

- [ ] **Step 4: Verify build**

Run: `npx ng build demo 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add projects/demo/src/app/simple-map-two-static-layers/ projects/demo/src/app/map-translate-threshold-events/ projects/demo/src/app/map-route-edit-point/
git commit -m "refactor(demo): migrate remaining 3 demos to DemoHeaderComponent"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full build**

Run: `npx ng build demo --configuration production 2>&1 | tail -10`
Expected: Production build succeeds with no errors

- [ ] **Step 2: Visual smoke test**

Run: `npx ng serve demo`
Then verify manually:
1. Open `http://localhost:4200/` — see index page with 18 demo cards in a grid
2. Click any card — navigates to demo page with new header (back button, title, component, description, features, interactions)
3. Click "← К списку" — returns to index page
4. No nav bar visible on any page

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -u
git commit -m "fix(demo): address issues found during smoke test"
```
