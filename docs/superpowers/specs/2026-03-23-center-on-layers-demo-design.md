# Center On Layers Demo

Демо для проверки `centerOnAllLayers` и `centerOnLayers` на `MapContext`.

## Компонент

Новый компонент `center-on-layers/` в демо-приложении с роутом `center-on-layers`.

## Данные

3 слоя точек, географически разнесённых по Минску для наглядности:

- **Layer A** (синий): запад — Минск-Арена, Комсомольское озеро, Остров слёз (3 точки)
- **Layer B** (зелёный): восток — Национальная библиотека, Ботанический сад, Парк Челюскинцев (3 точки)
- **Layer C** (красный): юг — Тракторный завод, Минский зоопарк, Чижовка-Арена (3 точки)

Точки берутся из `MapPointGenerator.getByIds()`. Каждый слой стилизован своим цветом.

## UI

Паттерн: `section.map-container` с header, кнопками и картой (как в `simple-map-two-static-layers`).

Кнопки над картой:

| Кнопка | Вызов |
|--------|-------|
| Все слои | `ctx.centerOnAllLayers()` |
| Слой A | `ctx.centerOnLayers(['a'])` |
| Слой B | `ctx.centerOnLayers(['b'])` |
| Слой C | `ctx.centerOnLayers(['c'])` |
| Слои A + B | `ctx.centerOnLayers(['a', 'b'])` |
| Слои B + C | `ctx.centerOnLayers(['b', 'c'])` |

## Роутинг

Добавить роут в `app.routes.ts`:

```typescript
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
```

## Затрагиваемые файлы

| Файл | Действие |
|------|----------|
| `projects/demo/src/app/center-on-layers/center-on-layers.component.ts` | Создать |
| `projects/demo/src/app/center-on-layers/center-on-layers.component.html` | Создать |
| `projects/demo/src/app/center-on-layers/center-on-layers.component.scss` | Создать |
| `projects/demo/src/app/app.routes.ts` | Добавить роут |
