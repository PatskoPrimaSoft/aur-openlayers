import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import type {ModifyEvent} from 'ol/interaction/Modify';
import type OlMap from 'ol/Map';
import type Style from 'ol/style/Style';
import type {TranslateEvent} from 'ol/interaction/Translate';

/**
 * Идентификатор состояния стиля, применяемого к фичам.
 *
 * Используйте строковые константы уровня проекта (например, `"HOVER"`).
 *
 * @example
 * const state: FeatureStyleState = 'SELECTED';
 */
export type FeatureStyleState = string;

/**
 * Идентификатор доменной модели.
 *
 * @example
 * const id: Id = 'point-1';
 */
export type Id = string | number;

/**
 * Значение или функция, которая его вычисляет.
 *
 * Полезно для ленивых вычислений и адаптации к контексту.
 *
 * @example
 * const width: MaybeFn<number, [zoom: number]> = (zoom) => zoom > 10 ? 3 : 1;
 */
export type MaybeFn<T, A extends any[] = []> = T | ((...args: A) => T);

/**
 * Патч: либо частичный объект, либо функция, вычисляющая патч.
 *
 * Используется для частичных переопределений стиля.
 *
 * @example
 * const patch: Patch<{ color: string }> = { color: 'red' };
 */
export type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);

/**
 * Признак включённости: статическое значение или вычисляемая функция.
 *
 * @example
 * const enabled: Enabled = () => isEditMode;
 */
export type Enabled = boolean | (() => boolean);

/**
 * Политика сброса (flush) для батчинга обновлений.
 *
 * @example
 * const policy: FlushPolicy = 'raf';
 */
export type FlushPolicy = 'microtask' | 'raf';

/**
 * Опции батчинга для `MapContext.batch`.
 *
 * @example
 * ctx.batch(doWork, { policy: 'raf' });
 */
export type BatchOptions = {
  /** Политика сброса для конкретного батча. */
  policy?: FlushPolicy;
};

/**
 * Параметры текущего вида карты для LOD-стилей.
 *
 * @example
 * const view: StyleView = { resolution: 12.5, zoom: 8 };
 */
export type StyleView = {
  /** Текущее разрешение OpenLayers (`map.getView().getResolution()`). */
  resolution: number;
  /** Опциональный зум, если он вычисляется в реализации. */
  zoom?: number;
};

/**
 * Состояние фичи: одиночное или составное.
 *
 * @example
 * const state: FeatureState = ['HOVER', 'SELECTED'];
 */
export type FeatureState = FeatureStyleState | FeatureStyleState[];

/**
 * Результат hit-test для текущего слоя: модель + соответствующая фича.
 *
 * @example
 * const item: HitItem<Model, Geometry> = { model, feature };
 */
export type HitItem<M, G extends Geometry> = {
  /** Доменных объект, связанный с фичей. */
  model: M;
  /** Фича OpenLayers. */
  feature: Feature<G>;
};

/**
 * Общие настройки для interactions (hover, click, translate и т.д.).
 *
 * @example
 * const base: InteractionBase = { enabled: true, propagation: 'stop' };
 */
export type InteractionBase = {
  /**
   * Включённость интеракции. Если не задано — считается включённой.
   */
  enabled?: Enabled;
  /**
   * UX: курсор для interaction на DOM-элементе карты.
   */
  cursor?: string;
  /**
   * Состояния, которые должны применяться при активности интеракции.
   * Если не задано — управление состояниями полностью на стороне пользователя.
   */
  state?: FeatureState;
  /**
   * Пропагация события на нижележащие слои, если текущий слой обработал событие.
   */
  propagation?: 'stop' | 'continue' | 'auto';
};

/**
 * Результат обработчика интеракции: `true` — событие обработано.
 *
 * @example
 * const handled: InteractionHandlerResult = true;
 */
export type InteractionHandlerResult = boolean | void;

/**
 * Причина изменения модели, инициированного картой.
 *
 * @example
 * const reason: ModelChangeReason = 'translate';
 */
export type ModelChangeReason = 'mutate' | 'translate' | 'modify';

/**
 * Изменение модели, инициированное картой.
 *
 * @example
 * onModelsChanged?.((changes) => console.log(changes.length));
 */
export type ModelChange<M> = {
  /** Предыдущая версия модели. */
  prev: M;
  /** Новая версия модели (immutable). */
  next: M;
  /** Причина изменения. */
  reason: ModelChangeReason;
};

/**
 * Причина внешнего изменения коллекции моделей слоя.
 *
 * @example
 * const reason: ModelsSetReason = 'add';
 */
export type ModelsSetReason = 'set' | 'add' | 'remove' | 'clear';

/**
 * Ошибка, выбрасываемая при нарушении уникальности id моделей слоя.
 *
 * Возникает при попытке:
 * - добавить модель с уже существующим id;
 * - передать в setModels массив с дублирующимися id.
 */
export class DuplicateModelIdError extends Error {
  public override readonly name = 'DuplicateModelIdError';

  constructor(
    /** Дублирующийся id. */
    public readonly id: Id,
    /** Идентификатор слоя. */
    public readonly layerId: string,
    message?: string,
  ) {
    super(message ?? `Model with id "${String(id)}" already exists on layer (${layerId}).`);
  }
}

/**
 * Событие внешнего изменения коллекции моделей слоя.
 */
export type ModelsCollectionEvent<M> = {
  /** Снимок коллекции до изменения. */
  prev: readonly M[];
  /** Снимок коллекции после изменения. */
  next: readonly M[];
  /** Причина изменения. */
  reason: ModelsSetReason;
  /**
   * Опциональный diff.
   *
   * Гарантируется для reason = 'add' | 'remove' | 'clear'.
   * Может отсутствовать для reason = 'set'.
   */
  added?: readonly M[];
  removed?: readonly M[];
};

/**
 * API управления коллекцией моделей слоя.
 */
export interface VectorLayerCollectionApi<M> {
  /** Текущий иммутабельный снимок моделей слоя. */
  getAllModels: () => readonly M[];

  /**
   * Полная замена набора моделей.
   *
   * Требования:
   * - Все id в массиве должны быть уникальны.
   * - При обнаружении дубликата выбрасывается DuplicateModelIdError.
   */
  setModels: (models: readonly M[]) => void;

  /**
   * Подписка на внешние изменения коллекции моделей
   * (set / add / remove / clear).
   */
  onModelsCollectionChanged: (cb: (e: ModelsCollectionEvent<M>) => void) => Unsubscribe;

  /**
   * Добавляет модель в конец коллекции.
   *
   * @throws DuplicateModelIdError если модель с таким id уже существует.
   */
  addModel: (model: M) => void;

  /**
   * Добавляет несколько моделей в конец коллекции
   * (в порядке входного массива).
   *
   * @throws DuplicateModelIdError
   */
  addModels: (models: readonly M[]) => void;

  /**
   * Удаляет модели по id.
   *
   * @returns Количество реально удалённых моделей.
   */
  removeModelsById: (ids: readonly Id[]) => number;

  /**
   * Полностью очищает слой.
   */
  clear: () => void;
}

export type MutateOptions = {
  /** Причина изменения (по умолчанию 'mutate'). */
  reason?: ModelChangeReason;
  /** Без оповещения подписчиков (по умолчанию false). */
  silent?: boolean;
};

/**
 * Паддинги для операций fit/center.
 *
 * @example
 * const padding: ViewFitPadding = { top: 16, right: 16, bottom: 16, left: 16 };
 */
export type ViewFitPadding =
  | { all: number }
  | { vertical: number; horizontal: number }
  | { top: number; right: number; bottom: number; left: number };

/**
 * Опции fit/center операций.
 *
 * @example
 * layer.centerOnModel(1, { duration: 300, maxZoom: 18 });
 */
export type ViewFitOptions = {
  /** Паддинги вокруг области. */
  padding?: ViewFitPadding;
  /** Длительность анимации (мс). */
  duration?: number;
  /** Верхний предел увеличения. */
  maxZoom?: number;
};

/**
 * Функция отписки от событий.
 *
 * @example
 * const unsubscribe: Unsubscribe = onModelsChanged(() => {});
 */
export type Unsubscribe = () => void;

/**
 * Публичный API слоя для бизнес-логики и других дескрипторов.
 *
 * @example
 * ctx.layers.points.mutate(id, (prev) => ({ ...prev, active: true }));
 */
export type VectorLayerApi<M, G extends Geometry> = VectorLayerCollectionApi<M> & {
  /** Запросить пересчёт слоя/стилей. */
  invalidate: () => void;
  /** Найти модель по фиче слоя. */
  getModelByFeature: (feature: Feature<G>) => M | undefined;
  /**
   * Иммутабельное обновление модели по id.
   * `update` обязан вернуть новый объект (или тот же для no-op).
   */
  mutate: (
    id: Id,
    update: (prev: M) => M,
    opts?: MutateOptions,
  ) => void;

  /** Массовая мутация (опционально). */
  mutateMany?: (
    ids: Array<Id>,
    update: (prev: M) => M,
    opts?: MutateOptions,
  ) => void;

  /**
   * Переключение кластеризации (если слой её поддерживает).
   */
  setClusteringEnabled?: (enabled: boolean) => void;
  /** Текущее состояние кластеризации. */
  isClusteringEnabled?: () => boolean;
  /**
   * Уведомления об изменениях моделей, инициированных картой.
   */
  onModelsChanged?: (cb: (changes: ModelChange<M>[]) => void) => Unsubscribe;

  /**
   * Центрирует карту на всех фичах слоя.
   */
  centerOnAllModels: (opts?: ViewFitOptions) => void;

  /**
   * Центрирует карту на одной фиче по id.
   */
  centerOnModel: (id: Id, opts?: ViewFitOptions) => void;

  /**
   * Центрирует карту на наборе фичей по списку id.
   */
  centerOnModels: (ids: ReadonlyArray<Id>, opts?: ViewFitOptions) => void;

  /**
   * Управление видимостью слоя.
   */
  setVisible: (visible: boolean) => void;

  /**
   * Текущее состояние видимости слоя.
   */
  isVisible: () => boolean;

  /**
   * Установить прозрачность слоя.
   */
  setOpacity: (opacity: number) => void;

  /**
   * Получить прозрачность слоя.
   */
  getOpacity: () => number;

  /**
   * Установить z-index слоя.
   */
  setZIndex: (z: number) => void;

  /**
   * Получить z-index слоя.
   */
  getZIndex: () => number | undefined;

  /**
   * Получить модель по id.
   */
  getModelById: (id: Id) => M | undefined;

  /**
   * Проверить наличие модели по id.
   */
  hasModel: (id: Id) => boolean;

  /**
   * Получить текущий снимок id моделей.
   */
  getAllModelIds: () => Array<Id>;

  /**
   * Применить состояния стиля к фичам по id.
   */
  setFeatureStates: (
    ids: Id | ReadonlyArray<Id>,
    states?: FeatureState,
  ) => void;

  /**
   * Сбросить состояния стиля у фич к состоянию по умолчанию.
   */
  clearFeatureStates: (ids: Id | ReadonlyArray<Id>) => void;

  /**
   * Возвращает extent всех фич базового источника (без кластеризации).
   * Возвращает null, если фич нет.
   */
  getExtent: () => import('ol/extent').Extent | null;
};

/**
 * Источник появления popup-элемента.
 *
 * @example
 * const source: PopupItemSource = 'feature';
 */
export type PopupItemSource = 'feature' | 'cluster' | 'interaction';

/**
 * Элемент popup, отображаемый глобальным хостом.
 *
 * @example
 * const item: PopupItem<Model> = { model, content: 'Hello' };
 */
export type PopupItem<M> = {
  /** Модель, связанная с элементом popup. */
  model: M;
  /** Контент popup. */
  content: string | HTMLElement;
  /** CSS-класс для стилизации. */
  className?: string;
  /** Смещение popup относительно координаты. */
  offset?: number[];
  /** Ключ дедупликации элементов. */
  dedupKey?: Id;
  /** Приоритет сортировки (чем больше, тем выше). */
  priority?: number;
  /** Источник элемента. */
  source?: PopupItemSource;
};

/**
 * Контракт хоста попапов, агрегирующего элементы со всех слоёв.
 *
 * @example
 * ctx.popupHost?.set([item]);
 */
export interface PopupHostApi {
  /** Добавить элементы в текущий список. */
  push: (items: PopupItem<any>[]) => void;
  /** Заменить список элементов. */
  set: (items: PopupItem<any>[]) => void;
  /** Очистить список. */
  clear: () => void;
  /** Удалить элемент по ключу. */
  remove: (key: Id) => void;
  /** Получить текущие элементы. */
  getItems: () => PopupItem<any>[];
  /** Примонтировать popup-хост к DOM-узлу. */
  mount: (target: HTMLElement | (() => HTMLElement)) => void;
  /** Освободить ресурсы и отписки. */
  dispose: () => void;
}

/**
 * Минимальный контекст, доступный обработчикам взаимодействий.
 *
 * @example
 * controller.bind({ map, layers, batch });
 */
export type MapContext = {
  /** Экземпляр карты OpenLayers. */
  map: OlMap;
  /** Доступ к слоям по id (типизируется реализацией). */
  layers: Record<string, VectorLayerApi<any, any>>;
  /** Глобальный хост попапов, если включён. */
  popupHost?: PopupHostApi;
  /**
   * Батчинг для группировки mutate/invalidate.
   */
  batch: (fn: () => void, options?: BatchOptions) => void;
  /** Центрирует карту на всех видимых слоях. No-op если нет фич. */
  centerOnAllLayers: (opts?: ViewFitOptions) => void;
  /** Центрирует карту на указанных слоях (скрытые пропускаются). No-op если нет фич. */
  centerOnLayers: (layerIds: ReadonlyArray<string>, opts?: ViewFitOptions) => void;
};

/**
 * Контроллер, который связывается с контекстом карты.
 *
 * @example
 * controller.bind(ctx);
 */
export type MapController = {
  /** Связать контроллер с контекстом. */
  bind: (ctx: MapContext) => void;
  /** Освободить ресурсы при отвязке (опционально). */
  unbind?: () => void;
};

/**
 * Описание фичи: геометрия, стиль, взаимодействия и popup.
 *
 * @example
 * const feature: FeatureDescriptor<Model, Geometry, StyleOpts> = { ... };
 */
export interface FeatureDescriptor<M, G extends Geometry, OPTS extends object> {
  /** Получение идентификатора модели. */
  id: (model: M) => Id;
  /** Синхронизация модели и геометрии. */
  geometry: {
    /** Преобразование модели в геометрию. */
    fromModel: (model: M) => G;
    /** Применение геометрии к модели (immutable). */
    applyGeometryToModel: (prev: M, geometry: G) => M;
    /** Хук после создания фичи. */
    onCreate?: (args: { feature: Feature<G>; model: M; ctx: MapContext }) => void;
  };
  /** Настройка стилей. */
  style: {
    /** Базовые параметры стиля с учётом LOD. */
    base: MaybeFn<OPTS, [model: M, view: StyleView]>;
    /** Патчи по состояниям (объединяются с base). */
    states?: Partial<
      Record<FeatureStyleState, MaybeFn<Patch<OPTS>, [model: M, view: StyleView]>>
    >;
    /** Рендер стиля по параметрам. */
    render: (opts: OPTS, view: StyleView) => Style | Style[];
    /** Опциональный ключ кеша. */
    cacheKey?: (opts: OPTS, view: StyleView) => string;
    /** Приоритет слияния состояний. */
    statePriority?: FeatureStyleState[];
  };
  /**
   * Интеракции слоя.
   * Поведение описано в `contract.md`.
   */
  interactions?: {
    /**
     * Обработка клика по карте в контексте слоя.
     * Коллбек вызывается даже при отсутствии фич под курсором
     * (в этом случае `items` будет пустым массивом).
     */
    click?: InteractionBase & {
      /** Переопределение hitTolerance для клика. */
      hitTolerance?: number;
      /** Коллбек клика по текущему слою. */
      onClick: (args: {
        items: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
    };

    /**
     * Обработка двойного клика по карте в контексте слоя.
     * Коллбек вызывается даже при отсутствии фич под курсором
     * (в этом случае `items` будет пустым массивом).
     */
    doubleClick?: InteractionBase & {
      /** Переопределение hitTolerance для doubleClick. */
      hitTolerance?: number;
      /** Коллбек двойного клика по текущему слою. */
      onDoubleClick: (args: {
        items: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
    };

    /**
     * Hover-взаимодействие: вход и выход указателя.
     */
    hover?: InteractionBase & {
      /** Переопределение hitTolerance для hover. */
      hitTolerance?: number;
      /** Указатель вошёл в фичи текущего слоя. */
      onEnter?: (args: {
        items: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
      /** Указатель вышел из фич текущего слоя. */
      onLeave?: (args: {
        items: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
    };

    /**
     * Select-взаимодействие: выбор фич и очистка выбора.
     */
    select?: InteractionBase & {
      /** Переопределение hitTolerance для select. */
      hitTolerance?: number;
      /**
       * Фильтрация/выбор целевых элементов select из кандидатов hit-test.
       *
       * Возврат `null/undefined` или пустого массива означает игнорирование select
       * для текущего клика (без `onSelect`, `onClear` и без изменения `state`).
       */
      pickTargets?: (args: {
        candidates: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => Array<HitItem<M, G>> | null | undefined;
      /** Выбраны фичи текущего слоя. */
      onSelect?: (args: {
        items: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
      /** Очистка выбора текущего слоя. */
      onClear?: (args: {
        ctx: MapContext;
        event: MapBrowserEvent<UIEvent>;
      }) => InteractionHandlerResult;
    };

    /** Перетаскивание фичи целиком. */
    translate?: InteractionBase & {
      /** Переопределение hitTolerance для translate. */
      hitTolerance?: number;
      /**
       * Минимальное смещение курсора (в px) для старта translate.
       * По умолчанию: `1`.
       *
       * Полезно, когда нужно разделить клик/select и перетаскивание:
       * пока порог не пройден, `onStart`/`state`/`onChange` не срабатывают.
       *
       * Если нужен прежний режим, где drag-start срабатывает сразу на нажатие
       * кнопки мыши (pointer down), установите `startThresholdPx: 0`.
       */
      startThresholdPx?: number;
      /** Ограничение частоты обновлений при перемещении (мс). */
      moveThrottleMs?: number;
      /**
       * Выбор цели из списка кандидатов на старте.
       */
      pickTarget?: (args: {
        candidates: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: TranslateEvent;
      }) => HitItem<M, G> | null | undefined;
      /** Старт перемещения. */
      onStart?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: TranslateEvent;
      }) => InteractionHandlerResult;
      /** Перемещение в процессе. */
      onChange?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: TranslateEvent;
      }) => InteractionHandlerResult;
      /** Завершение перемещения. */
      onEnd?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: TranslateEvent;
      }) => InteractionHandlerResult;
    };

    /** Редактирование геометрии (вершины/сегменты). */
    modify?: InteractionBase & {
      /** Переопределение hitTolerance для modify. */
      hitTolerance?: number;
      /** Ограничение частоты обновлений при редактировании (мс). */
      moveThrottleMs?: number;
      /** Стиль хэндлов вершин нативного Modify. */
      vertexStyle?: Style | Style[];
      /**
       * Выбор цели из списка кандидатов на старте.
       */
      pickTarget?: (args: {
        candidates: Array<HitItem<M, G>>;
        ctx: MapContext;
        event: ModifyEvent;
      }) => HitItem<M, G> | null | undefined;
      /** Старт редактирования. */
      onStart?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: ModifyEvent;
      }) => InteractionHandlerResult;
      /** Обновления в процессе. */
      onChange?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: ModifyEvent;
      }) => InteractionHandlerResult;
      /** Завершение редактирования. */
      onEnd?: (args: {
        item: HitItem<M, G>;
        ctx: MapContext;
        event: ModifyEvent;
      }) => InteractionHandlerResult;
    };
  };
  /**
   * Формирование элемента popup для фичи.
   */
  popup?: {
    /** Включённость popup на фичах. */
    enabled?: Enabled;
    /** Создание popup-элемента. */
    item: (args: {
      model: M;
      feature: Feature<G>;
      ctx: MapContext;
      event?: MapBrowserEvent<UIEvent>;
    }) => PopupItem<M>;
  };
}

/**
 * Конфигурация кластеризации слоя.
 *
 * @example
 * clustering: { enabledByDefault: true, clusterStyle: { render } }
 */
export type LayerClustering<M> = {
  /** Кластеризация включена по умолчанию. */
  enabledByDefault?: boolean;
  /** Параметры OL Cluster (px). */
  distance?: number;
  minDistance?: number;
  /** Стиль для cluster-feature. */
  clusterStyle: {
    /** Рендер стиля кластера. */
    render: (args: { models: M[]; size: number; view: StyleView }) => Style | Style[];
    /** Опциональный ключ кеша. */
    cacheKey?: (args: { models: M[]; size: number; view: StyleView }) => string;
  };
  /** Popup для кластера. */
  popup?: {
    /** Включённость popup на кластерах. */
    enabled?: Enabled;
    /** Создание popup-элемента для кластера. */
    item: (args: {
      models: M[];
      size: number;
      ctx: MapContext;
      event?: MapBrowserEvent<UIEvent>;
    }) => PopupItem<M>;
    /** Лимит элементов для кластера (переопределяет popupHost.maxItems). */
    maxItems?: number;
  };
  /**
   * Раскрытие кластера при клике.
   */
  expandOnClick?: {
    /** Режим раскрытия. */
    mode?: 'zoomToExtent' | 'zoomIn';
    /** Паддинги для fit(extent). */
    padding?: ViewFitPadding;
    /** Максимальный зум при fit/zoomIn. */
    maxZoom?: number;
    /** Шаг увеличения для zoomIn. */
    zoomDelta?: number;
    /** Длительность анимации (мс). */
    durationMs?: number;
    /** Хук после раскрытия кластера. */
    onExpanded?: (args: { models: M[]; ctx: MapContext }) => void;
  };
};

/**
 * Дескриптор слоя (тип модели + стиль + интеракции).
 *
 * @example
 * const layer: VectorLayerDescriptor<Model, Geometry, StyleOpts> = { id: 'points', feature };
 */
export interface VectorLayerDescriptor<
  M,
  G extends Geometry,
  OPTS extends object,
  ID extends string = string
> {
  /** Идентификатор слоя. */
  id: ID;
  /** Человекочитаемое имя слоя. */
  title?: string;
  /** z-index слоя. */
  zIndex?: number;
  /** Видимость слоя по умолчанию. */
  visibleByDefault?: boolean;
  /** Описание фич и поведения слоя. */
  feature: FeatureDescriptor<M, G, OPTS>;
  /** Кластеризация слоя (опционально). */
  clustering?: LayerClustering<M>;
}

/**
 * Схема карты: слои + общие настройки.
 *
 * @example
 * const schema: MapSchema<typeof layers> = { layers };
 */
export interface MapSchema<
  Layers extends readonly VectorLayerDescriptor<any, any, any, any>[]
> {
  /** Список слоёв. */
  layers: Layers;
  /** Глобальные опции карты. */
  options?: {
    /** Глобальное значение hitTolerance по умолчанию. */
    hitTolerance?: number;
    /** Параметры планировщика invalidate/changed. */
    scheduler?: {
      /** Политика flush по умолчанию. */
      policy?: FlushPolicy;
      /** Политика flush для translate/modify. */
      interactionPolicy?: FlushPolicy;
    };
    /**
     * Глобальный popup-хост.
     */
    popupHost?: {
      /** Включённость popup-хоста. */
      enabled?: Enabled;
      /** Автоматический режим показа. */
      autoMode?: 'off' | 'click' | 'hover';
      /** Максимум элементов в списке. */
      maxItems?: number;
      /** Сортировка popup-элементов. */
      sort?: (a: PopupItem<any>, b: PopupItem<any>) => number;
      /** Куда монтировать popup-хост. */
      mount?: HTMLElement | (() => HTMLElement);
      /** Стек поверх других popup-хостов. */
      stack?: 'stop' | 'continue';
    };
  };
}
