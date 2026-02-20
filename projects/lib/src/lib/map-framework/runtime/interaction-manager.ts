import Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type MapBrowserEvent from 'ol/MapBrowserEvent';
import type OlMap from 'ol/Map';
import type VectorLayer from 'ol/layer/Vector';
import Collection from 'ol/Collection';
import DragPan from 'ol/interaction/DragPan';
import Modify from 'ol/interaction/Modify';
import type { ModifyEvent } from 'ol/interaction/Modify';
import type { TranslateEvent } from 'ol/interaction/Translate';
import ClusterSource from 'ol/source/Cluster';
import type VectorSource from 'ol/source/Vector';
import type { EventsKey } from 'ol/events';
import * as Observable from 'ol/Observable';
import { createEmpty, extend, isEmpty } from 'ol/extent';

import type {
  FeatureState,
  HitItem,
  InteractionBase,
  InteractionHandlerResult,
  MapContext,
  MapSchema,
  PopupItem,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../public/types';
import { getClusterFeatures } from './cluster-utils';
import { toOlPadding } from './fit-layer.utils';
import { getFeatureStates, setFeatureStates } from './style/feature-states';

type LayerEntry = {
  descriptor: VectorLayerDescriptor<any, any, any, any>;
  layer: VectorLayer;
  api: VectorLayerApi<any, any>;
  index: number;
};

type InteractionEnabledState = {
  click: boolean;
  doubleClick: boolean;
  hover: boolean;
  select: boolean;
  translate: boolean;
  modify: boolean;
};

type ListenerName =
  | 'pointermove'
  | 'singleclick'
  | 'dblclick'
  | 'pointerdown'
  | 'pointerdrag'
  | 'pointerup';

type ActiveTranslate = {
  targetKey: string | number;
  startCoordinate: [number, number];
  startPixel: [number, number];
  lastCoordinate: [number, number];
  lastItem?: HitItem<any, any>;
  moveThrottleMs: number;
  startThresholdPx: number;
  started: boolean;
  translate: NonNullable<
    NonNullable<LayerEntry['descriptor']['feature']['interactions']>['translate']
  >;
  pendingEvent?: MapBrowserEvent<UIEvent>;
  throttleTimer?: ReturnType<typeof setTimeout>;
  lastHandled?: boolean;
};

type ActiveModify = {
  targetKey: string | number;
  lastItem?: HitItem<any, any>;
  moveThrottleMs: number;
  modify: NonNullable<
    NonNullable<LayerEntry['descriptor']['feature']['interactions']>['modify']
  >;
  pendingEvent?: MapBrowserEvent<UIEvent>;
  throttleTimer?: ReturnType<typeof setTimeout>;
  lastHandled?: boolean;
};

type NativeModifyEntry = {
  interaction: Modify;
  keys: EventsKey[];
};

type ModifyInteraction = NonNullable<
  NonNullable<LayerEntry['descriptor']['feature']['interactions']>['modify']
>;

export type HitTestArgs = {
  layerId: string;
  layer: VectorLayer;
  api: VectorLayerApi<any, any>;
  descriptor: VectorLayerDescriptor<any, any, any, any>;
  event: MapBrowserEvent<UIEvent>;
  hitTolerance: number;
};

export type ClusterHit = {
  feature: Feature<Geometry>;
  features: Array<Feature<Geometry>>;
  size: number;
};

export type HitTestResult = {
  items: Array<HitItem<any, any>>;
  cluster?: ClusterHit;
};

export type HitTestFn = (args: HitTestArgs) => HitTestResult;

export type InteractionManagerOptions<
  Layers extends readonly VectorLayerDescriptor<any, any, any, any>[]
> = {
  ctx: MapContext;
  map: OlMap;
  schema: MapSchema<Layers>;
  layers: Record<string, VectorLayer>;
  apis: Record<string, VectorLayerApi<any, any>>;
  hitTest?: HitTestFn;
};

export class InteractionManager<
  Layers extends readonly VectorLayerDescriptor<any, any, any, any>[]
> {
  private readonly ctx: MapContext;
  private readonly map: OlMap;
  private readonly schema: MapSchema<Layers>;
  private readonly layers: Record<string, VectorLayer>;
  private readonly apis: Record<string, VectorLayerApi<any, any>>;
  private readonly hitTest: HitTestFn;
  private readonly hoverItems = new Map<string, Map<string | number, HitItem<any, any>>>();
  private readonly selectedItems = new Map<string, Map<string | number, HitItem<any, any>>>();
  private readonly activeTranslates = new Map<string, ActiveTranslate>();
  private readonly activeModifies = new Map<string, ActiveModify>();
  private readonly nativeModifies = new Map<string, NativeModifyEntry>();
  private readonly popupStack: 'stop' | 'continue';
  private readonly listenerKeys = new Map<ListenerName, EventsKey>();
  private readonly enabledState = new Map<string, InteractionEnabledState>();
  private dragPanLocks = 0;
  private dragPanStates?: Map<DragPan, boolean>;
  private currentCursor?: string;

  constructor(options: InteractionManagerOptions<Layers>) {
    this.ctx = options.ctx;
    this.map = options.map;
    this.schema = options.schema;
    this.layers = options.layers;
    this.apis = options.apis;
    this.hitTest = options.hitTest ?? this.createDefaultHitTest();
    this.popupStack = this.schema.options?.popupHost?.stack ?? 'stop';
    this.refreshEnabled();
  }

  refreshEnabled(): void {
    const popupEnabled = this.isEnabled(this.schema.options?.popupHost?.enabled);
    if (!popupEnabled) {
      this.ctx.popupHost?.clear();
    }

    const nextState = new Map<string, InteractionEnabledState>();
    this.schema.layers.forEach((descriptor) => {
      const interactions = descriptor.feature.interactions;
      nextState.set(descriptor.id, {
        click: !!interactions?.click && this.isEnabled(interactions.click.enabled),
        doubleClick:
          !!interactions?.doubleClick && this.isEnabled(interactions.doubleClick.enabled),
        hover: !!interactions?.hover && this.isEnabled(interactions.hover.enabled),
        select: !!interactions?.select && this.isEnabled(interactions.select.enabled),
        translate: !!interactions?.translate && this.isEnabled(interactions.translate.enabled),
        modify: !!interactions?.modify && this.isEnabled(interactions.modify.enabled),
      });
    });

    this.syncNativeModify(nextState);
    this.applyDisabledCleanup(nextState);
    this.enabledState.clear();
    nextState.forEach((value, key) => this.enabledState.set(key, value));
    this.syncListeners(popupEnabled);
  }

  handlePointerDown(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('pointerdown')) {
      return;
    }
    const layers = this.getOrderedLayers();
    for (const entry of layers) {
      const interactions = entry.descriptor.feature.interactions;

      const translate = interactions?.translate;
      if (translate && this.isEnabled(translate.enabled)) {
        const { items: candidates } = this.hitTest({
          layerId: entry.descriptor.id,
          layer: entry.layer,
          api: entry.api,
          descriptor: entry.descriptor,
          event,
          hitTolerance: this.getHitTolerance(translate.hitTolerance),
        });
        if (candidates.length > 0) {
          const translateEvent = this.createTranslateEvent(
            event,
            event.coordinate as [number, number],
            'translatestart',
            candidates,
          );

          let target: HitItem<any, any> | null | undefined;
          if (translate.pickTarget) {
            target = translate.pickTarget({ candidates, ctx: this.ctx, event: translateEvent });
          } else {
            target = candidates[0];
          }

          if (target) {
            const targetKey = entry.descriptor.feature.id(target.model);
            const resolved = this.resolveTarget(entry, targetKey);
            if (resolved) {
              const active: ActiveTranslate = {
                targetKey,
                startCoordinate: event.coordinate as [number, number],
                startPixel: event.pixel as [number, number],
                lastCoordinate: event.coordinate as [number, number],
                lastItem: resolved,
                moveThrottleMs: translate.moveThrottleMs ?? 0,
                startThresholdPx: Math.max(0, translate.startThresholdPx ?? 1),
                started: false,
                translate,
              };
              this.activeTranslates.set(entry.descriptor.id, active);
              this.lockDragPan();

              if (active.startThresholdPx <= 0) {
                this.startTranslate(entry, active, resolved, event);
                if (active.lastHandled && this.shouldStopPropagation(translate)) {
                  break;
                }
              }
            }
          }
        }
      }

      if (this.activeTranslates.has(entry.descriptor.id)) {
        continue;
      }

      const modify = interactions?.modify;
      const hasNativeModify = this.nativeModifies.has(entry.descriptor.id);
      if (!hasNativeModify && modify && this.isEnabled(modify.enabled)) {
        const { items: candidates } = this.hitTest({
          layerId: entry.descriptor.id,
          layer: entry.layer,
          api: entry.api,
          descriptor: entry.descriptor,
          event,
          hitTolerance: this.getHitTolerance(modify.hitTolerance),
        });

        if (candidates.length > 0) {
          const modifyEvent = this.createModifyEvent(event, 'modifystart', candidates);

          let target: HitItem<any, any> | null | undefined;
          if (modify.pickTarget) {
            target = modify.pickTarget({ candidates, ctx: this.ctx, event: modifyEvent });
          } else {
            target = candidates[0];
          }

          if (target) {
            const targetKey = entry.descriptor.feature.id(target.model);
            const resolved = this.resolveTarget(entry, targetKey);
            if (resolved) {
              const active: ActiveModify = {
                targetKey,
                lastItem: resolved,
                moveThrottleMs: modify.moveThrottleMs ?? 0,
                modify,
              };
              this.activeModifies.set(entry.descriptor.id, active);
              this.lockDragPan();

              if (modify.state) {
                this.applyState([resolved], modify.state, true);
              }

              const handled = modify.onStart
                ? this.isHandled(
                    modify.onStart({ item: resolved, ctx: this.ctx, event: modifyEvent }),
                  )
                : false;
              active.lastHandled = handled;

              if (handled && this.shouldStopPropagation(modify)) {
                break;
              }
            }
          }
        }
      }

      if (this.activeModifies.has(entry.descriptor.id)) {
        continue;
      }
    }

    this.updateCursor(event);
  }

  handlePointerDrag(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('pointerdrag')) {
      return;
    }
    if (this.activeTranslates.size === 0 && this.activeModifies.size === 0) {
      return;
    }
    for (const entry of this.getOrderedLayers()) {
      const active = this.activeTranslates.get(entry.descriptor.id);
      if (!active) {
        const activeModify = this.activeModifies.get(entry.descriptor.id);
        if (!activeModify) {
          continue;
        }
        const modify = activeModify.modify;
        const execute = () => this.applyModifyChange(entry, activeModify, event);

        if (activeModify.moveThrottleMs > 0) {
          if (!activeModify.throttleTimer) {
            execute();
            activeModify.throttleTimer = setTimeout(() => {
              activeModify.throttleTimer = undefined;
              if (activeModify.pendingEvent) {
                const pending = activeModify.pendingEvent;
                activeModify.pendingEvent = undefined;
                this.applyModifyChange(entry, activeModify, pending);
              }
            }, activeModify.moveThrottleMs);
          } else {
            activeModify.pendingEvent = event;
          }
        } else {
          execute();
        }

        if (activeModify.lastHandled && this.shouldStopPropagation(modify)) {
          break;
        }
        continue;
      }
      const translate = active.translate;
      const execute = () => this.applyTranslateMove(entry, active, event);

      if (active.moveThrottleMs > 0) {
        if (!active.throttleTimer) {
          execute();
          active.throttleTimer = setTimeout(() => {
            active.throttleTimer = undefined;
            if (active.pendingEvent) {
              const pending = active.pendingEvent;
              active.pendingEvent = undefined;
              this.applyTranslateMove(entry, active, pending);
            }
          }, active.moveThrottleMs);
        } else {
          active.pendingEvent = event;
        }
      } else {
        execute();
      }

      if (active.lastHandled && this.shouldStopPropagation(translate)) {
        break;
      }
    }

    this.updateCursor(event);
  }

  handlePointerUp(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('pointerup')) {
      return;
    }
    if (this.activeTranslates.size === 0 && this.activeModifies.size === 0) {
      return;
    }
    for (const entry of this.getOrderedLayers()) {
      const active = this.activeTranslates.get(entry.descriptor.id);
      if (active) {
        const translate = active.translate;
        if (active.throttleTimer) {
          clearTimeout(active.throttleTimer);
          active.throttleTimer = undefined;
        }
        if (active.pendingEvent) {
          const pending = active.pendingEvent;
          active.pendingEvent = undefined;
          this.applyTranslateMove(entry, active, pending);
        }
        const resolved = this.resolveTarget(entry, active.targetKey);
        if (active.started && resolved && translate.onEnd) {
          const translateEvent = this.createTranslateEvent(
            event,
            active.startCoordinate,
            'translateend',
            [resolved],
          );
          active.lastHandled = this.isHandled(
            translate.onEnd({ item: resolved, ctx: this.ctx, event: translateEvent }),
          );
        } else {
          active.lastHandled = false;
        }

        this.finishTranslate(entry, active, resolved);

        if (active.lastHandled && this.shouldStopPropagation(translate)) {
          break;
        }
        continue;
      }

      const activeModify = this.activeModifies.get(entry.descriptor.id);
      if (!activeModify) {
        continue;
      }
      const modify = activeModify.modify;
      if (activeModify.throttleTimer) {
        clearTimeout(activeModify.throttleTimer);
        activeModify.throttleTimer = undefined;
      }
      if (activeModify.pendingEvent) {
        const pending = activeModify.pendingEvent;
        activeModify.pendingEvent = undefined;
        this.applyModifyChange(entry, activeModify, pending);
      }
      const resolved = this.resolveTarget(entry, activeModify.targetKey);
      if (resolved && modify.onEnd) {
        const modifyEvent = this.createModifyEvent(event, 'modifyend', [resolved]);
        activeModify.lastHandled = this.isHandled(
          modify.onEnd({ item: resolved, ctx: this.ctx, event: modifyEvent }),
        );
      } else {
        activeModify.lastHandled = false;
      }

      this.finishModify(entry, activeModify, resolved);

      if (activeModify.lastHandled && this.shouldStopPropagation(modify)) {
        break;
      }
    }

    this.updateCursor(event);
  }

  handlePointerMove(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('pointermove')) {
      return;
    }
    const popupHost = this.ctx.popupHost;
    const popupEnabled = this.isEnabled(this.schema.options?.popupHost?.enabled);
    const autoMode = popupEnabled ? this.schema.options?.popupHost?.autoMode ?? 'off' : 'off';
    const autoHover = autoMode === 'hover';
    const popupItems: Array<PopupItem<any>> = [];
    let popupStopped = false;
    const layers = this.getOrderedLayers();
    for (const entry of layers) {
      const hover = entry.descriptor.feature.interactions?.hover;
      const hoverEnabled = !!hover && this.isEnabled(hover.enabled);
      if (!hoverEnabled && !autoHover) {
        continue;
      }
      const hitResult = this.hitTest({
        layerId: entry.descriptor.id,
        layer: entry.layer,
        api: entry.api,
        descriptor: entry.descriptor,
        event,
        hitTolerance: this.getHitTolerance(hoverEnabled ? hover!.hitTolerance : undefined),
      });

      if (hoverEnabled) {
        const handled = this.processHover(entry, hover!, hitResult.items, event);
        if (handled && this.shouldStopPropagation(hover!)) {
          break;
        }
      }

      if (autoHover && popupHost && !popupStopped) {
        const collected = this.collectPopupItems(entry, hitResult, event);
        if (collected.length > 0) {
          popupItems.push(...collected);
          if (this.popupStack === 'stop') {
            popupStopped = true;
          }
        }
      }
    }
    if (autoHover && popupHost) {
      popupHost.set(popupItems);
    }

    this.updateCursor(event);
  }

  handleSingleClick(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('singleclick')) {
      return;
    }
    const popupHost = this.ctx.popupHost;
    const popupEnabled = this.isEnabled(this.schema.options?.popupHost?.enabled);
    const autoMode = popupEnabled ? this.schema.options?.popupHost?.autoMode ?? 'off' : 'off';
    const autoClick = autoMode === 'click';
    const popupItems: Array<PopupItem<any>> = [];
    let popupStopped = false;
    const layers = this.getOrderedLayers();
    for (const entry of layers) {
      const select = entry.descriptor.feature.interactions?.select;
      const click = entry.descriptor.feature.interactions?.click;
      const selectEnabled = select && this.isEnabled(select.enabled);
      const clickEnabled = click && this.isEnabled(click.enabled);
      const clusteringEnabled = !!entry.descriptor.clustering && !!entry.api.isClusteringEnabled?.();
      if (!selectEnabled && !clickEnabled && !clusteringEnabled && !autoClick) {
        continue;
      }

      const tolerances = [
        selectEnabled ? select?.hitTolerance : undefined,
        clickEnabled ? click?.hitTolerance : undefined,
      ].filter((value): value is number => value !== undefined);
      const hitTolerance =
        tolerances.length > 0 ? Math.max(...tolerances) : this.getHitTolerance(undefined);
      const hitResult = this.hitTest({
        layerId: entry.descriptor.id,
        layer: entry.layer,
        api: entry.api,
        descriptor: entry.descriptor,
        event,
        hitTolerance,
      });

      if (clusteringEnabled && hitResult.cluster) {
        if (autoClick && popupHost && !popupStopped) {
          const collected = this.collectPopupItems(entry, hitResult, event);
          if (collected.length > 0) {
            popupItems.push(...collected);
            if (this.popupStack === 'stop') {
              popupStopped = true;
            }
          }
        }
        const handled = this.handleClusterClick(entry, hitResult.cluster, event, !autoClick);
        if (handled) {
          if (this.shouldStopClusterPropagation()) {
            break;
          }
          continue;
        }
      }

      if (selectEnabled || clickEnabled) {
        const selectItems = selectEnabled ? hitResult.items : [];
        const clickItems = clickEnabled ? hitResult.items : [];

        const selectHandled = selectEnabled
          ? this.processSelect(entry, select!, selectItems, event)
          : false;
        const selectStops = selectHandled && this.shouldStopPropagation(select!);
        const allowClick =
          !selectHandled || (selectEnabled && this.shouldContinuePropagation(select!));

        if (clickEnabled && allowClick) {
          const clickHandled = this.processClick(entry, click!, clickItems, event);
          if (clickHandled && this.shouldStopPropagation(click!)) {
            break;
          }
        }

        if (selectStops) {
          break;
        }
      }

      if (autoClick && popupHost && !popupStopped && !(clusteringEnabled && hitResult.cluster)) {
        const collected = this.collectPopupItems(entry, hitResult, event);
        if (collected.length > 0) {
          popupItems.push(...collected);
          if (this.popupStack === 'stop') {
            popupStopped = true;
          }
        }
      }
    }
    if (autoClick && popupHost) {
      popupHost.set(popupItems);
    }
  }

  handleDoubleClick(event: MapBrowserEvent<UIEvent>): void {
    if (!this.isListening('dblclick')) {
      return;
    }
    const layers = this.getOrderedLayers();
    for (const entry of layers) {
      const doubleClick = entry.descriptor.feature.interactions?.doubleClick;
      if (!doubleClick || !this.isEnabled(doubleClick.enabled)) {
        continue;
      }

      const hitResult = this.hitTest({
        layerId: entry.descriptor.id,
        layer: entry.layer,
        api: entry.api,
        descriptor: entry.descriptor,
        event,
        hitTolerance: this.getHitTolerance(doubleClick.hitTolerance),
      });

      if (entry.descriptor.clustering && entry.api.isClusteringEnabled?.() && hitResult.cluster) {
        continue;
      }
      const { items } = hitResult;

      const handled = this.processDoubleClick(entry, doubleClick, items, event);
      if (handled && this.shouldStopPropagation(doubleClick)) {
        break;
      }
    }
  }

  private runInteractionMutation(fn: () => void): void {
    const policy = this.schema.options?.scheduler?.interactionPolicy;
    if (policy) {
      this.ctx.batch(fn, { policy });
      return;
    }
    fn();
  }

  private syncListeners(popupEnabled: boolean): void {
    const autoMode = popupEnabled ? this.schema.options?.popupHost?.autoMode ?? 'off' : 'off';
    const needsHover = autoMode === 'hover';
    const needsClick = autoMode === 'click';

    let needsPointerMove = needsHover;
    let needsSingleClick = needsClick;
    let needsDoubleClick = false;
    let needsPointerDown = false;
    let needsPointerDrag = false;
    let needsPointerUp = false;

    this.schema.layers.forEach((descriptor) => {
      const state = this.enabledState.get(descriptor.id);
      const interactions = descriptor.feature.interactions;
      const maybeHover = this.isMaybeEnabled(interactions?.hover?.enabled);
      const maybeClick = this.isMaybeEnabled(interactions?.click?.enabled);
      const maybeSelect = this.isMaybeEnabled(interactions?.select?.enabled);
      const maybeDoubleClick = this.isMaybeEnabled(interactions?.doubleClick?.enabled);
      const maybeTranslate = this.isMaybeEnabled(interactions?.translate?.enabled);
      const maybeModify = this.isMaybeEnabled(interactions?.modify?.enabled);

      if (state?.hover || maybeHover) {
        needsPointerMove = true;
      }
      if (state?.click || state?.select || maybeClick || maybeSelect) {
        needsSingleClick = true;
      }
      if (state?.doubleClick || maybeDoubleClick) {
        needsDoubleClick = true;
      }
      if (state?.translate || state?.modify || maybeTranslate || maybeModify) {
        needsPointerDown = true;
        needsPointerDrag = true;
        needsPointerUp = true;
      }
      if (interactions && this.hasCursorInteraction(interactions)) {
        needsPointerMove = true;
      }
      if (
        descriptor.clustering &&
        (descriptor.clustering.expandOnClick || descriptor.clustering.popup)
      ) {
        needsSingleClick = true;
      }
    });

    this.toggleListener('pointermove', needsPointerMove, (event) => this.handlePointerMove(event));
    this.toggleListener('singleclick', needsSingleClick, (event) =>
      this.handleSingleClick(event),
    );
    this.toggleListener('dblclick', needsDoubleClick, (event) => this.handleDoubleClick(event));
    this.toggleListener('pointerdown', needsPointerDown, (event) => this.handlePointerDown(event));
    this.toggleListener('pointerdrag', needsPointerDrag, (event) => this.handlePointerDrag(event));
    this.toggleListener('pointerup', needsPointerUp, (event) => this.handlePointerUp(event));
  }

  private syncNativeModify(nextState: Map<string, InteractionEnabledState>): void {
    const handled = new Set<string>();

    this.schema.layers.forEach((descriptor) => {
      const interactions = descriptor.feature.interactions;
      const modify = interactions?.modify;
      const enabled = nextState.get(descriptor.id)?.modify ?? false;
      const shouldEnable = !!modify && enabled;
      if (!shouldEnable) {
        return;
      }
      const entry = this.getLayerEntry(descriptor.id);
      if (!entry) {
        return;
      }
      handled.add(descriptor.id);
      if (this.nativeModifies.has(descriptor.id)) {
        this.nativeModifies.get(descriptor.id)!.interaction.setActive(true);
        return;
      }
      const source = entry.layer.getSource() as VectorSource<Geometry> | null;
      if (!source) {
        return;
      }
      const interaction = new Modify({
        source,
        pixelTolerance: this.getHitTolerance(modify.hitTolerance),
        style: modify.vertexStyle,
      });
      const keys = [
        interaction.on('modifystart', (event) =>
          this.handleNativeModifyStart(entry, modify, event),
        ),
        interaction.on('modifyend', (event) =>
          this.handleNativeModifyEnd(entry, modify, event),
        ),
      ];
      this.map.addInteraction(interaction);
      this.nativeModifies.set(descriptor.id, { interaction, keys });
    });

    Array.from(this.nativeModifies.keys()).forEach((layerId) => {
      if (!handled.has(layerId)) {
        this.teardownNativeModify(layerId);
      }
    });
  }

  private teardownNativeModify(layerId: string): void {
    const entry = this.nativeModifies.get(layerId);
    if (!entry) {
      return;
    }
    entry.keys.forEach((key) => Observable.unByKey(key));
    this.map.removeInteraction(entry.interaction);
    this.nativeModifies.delete(layerId);
  }

  private handleNativeModifyStart(
    entry: LayerEntry,
    modify: ModifyInteraction,
    event: ModifyEvent,
  ): void {
    const items = this.resolveHitItemsFromFeatures(entry, event.features);
    if (items.length === 0) {
      return;
    }
    if (modify.state) {
      this.applyState(items, modify.state, true);
    }
    if (modify.onStart) {
      this.isHandled(modify.onStart({ item: items[0], ctx: this.ctx, event }));
    }
  }

  private handleNativeModifyEnd(
    entry: LayerEntry,
    modify: ModifyInteraction,
    event: ModifyEvent,
  ): void {
    const items = this.resolveHitItemsFromFeatures(entry, event.features);
    if (items.length === 0) {
      return;
    }
    this.runInteractionMutation(() => {
      items.forEach((item) => {
        const geometry = item.feature.getGeometry();
        if (!geometry) {
          return;
        }
        const id = entry.descriptor.feature.id(item.model);
        entry.api.mutate(
          id,
          (prev) =>
            entry.descriptor.feature.geometry.applyGeometryToModel(prev, geometry as any),
          {reason: 'modify'},
        );
      });
    });
    if (modify.onEnd) {
      this.isHandled(modify.onEnd({ item: items[0], ctx: this.ctx, event }));
    }
    if (modify.state) {
      this.applyState(items, modify.state, false);
    }
  }

  private resolveHitItemsFromFeatures(
    entry: LayerEntry,
    features: Collection<Feature<Geometry>>,
  ): Array<HitItem<any, any>> {
    return features
      .getArray()
      .map((feature) => {
        const model = entry.api.getModelByFeature(feature as Feature<any>);
        if (!model) {
          return null;
        }
        return { model, feature } as HitItem<any, any>;
      })
      .filter((item): item is HitItem<any, any> => item !== null);
  }

  private hasCursorInteraction(
    interactions: NonNullable<LayerEntry['descriptor']['feature']['interactions']>,
  ): boolean {
    const candidates = [
      interactions.hover,
      interactions.select,
      interactions.click,
      interactions.doubleClick,
      interactions.translate,
      interactions.modify,
    ];
    return candidates.some(
      (interaction) => interaction?.cursor && this.isMaybeEnabled(interaction.enabled),
    );
  }

  private toggleListener(
    type: ListenerName,
    enabled: boolean,
    handler: (event: MapBrowserEvent<UIEvent>) => void,
  ): void {
    if (enabled) {
      if (!this.listenerKeys.has(type)) {
        const key = (
          this.map.on as unknown as (
            eventType: string,
            listener: (event: MapBrowserEvent<UIEvent>) => void,
          ) => EventsKey
        )(type, handler);
        this.listenerKeys.set(type, key);
      }
      return;
    }
    this.removeListener(type);
  }

  private removeListener(type: ListenerName): void {
    const key = this.listenerKeys.get(type);
    if (key) {
      Observable.unByKey(key);
      this.listenerKeys.delete(type);
    }
  }

  private isListening(type: ListenerName): boolean {
    return this.listenerKeys.has(type);
  }

  private applyDisabledCleanup(nextState: Map<string, InteractionEnabledState>): void {
    this.enabledState.forEach((prev, layerId) => {
      const next = nextState.get(layerId) ?? {
        click: false,
        doubleClick: false,
        hover: false,
        select: false,
        translate: false,
        modify: false,
      };
      const entry = this.getLayerEntry(layerId);
      if (!entry) {
        return;
      }

      if (prev.hover && !next.hover) {
        this.clearHoverState(entry);
      }
      if (prev.select && !next.select) {
        this.clearSelectState(entry);
      }
      if (prev.translate && !next.translate) {
        this.cancelTranslate(entry);
      }
      if (prev.modify && !next.modify) {
        this.cancelModify(entry);
      }
    });

    this.setCursor(undefined);
  }

  private clearHoverState(entry: LayerEntry): void {
    const prev = this.hoverItems.get(entry.descriptor.id);
    if (!prev) {
      return;
    }
    const hover = entry.descriptor.feature.interactions?.hover;
    if (hover?.state) {
      this.applyState(Array.from(prev.values()), hover.state, false);
    }
    this.hoverItems.delete(entry.descriptor.id);
  }

  private clearSelectState(entry: LayerEntry): void {
    const prev = this.selectedItems.get(entry.descriptor.id);
    if (!prev) {
      return;
    }
    const select = entry.descriptor.feature.interactions?.select;
    if (select?.state) {
      this.applyState(Array.from(prev.values()), select.state, false);
    }
    this.selectedItems.delete(entry.descriptor.id);
  }

  private cancelTranslate(entry: LayerEntry): void {
    const active = this.activeTranslates.get(entry.descriptor.id);
    if (active) {
      this.finishTranslate(entry, active, active.lastItem);
    }
  }

  private cancelModify(entry: LayerEntry): void {
    const active = this.activeModifies.get(entry.descriptor.id);
    if (active) {
      this.finishModify(entry, active, active.lastItem);
    }
  }

  private updateCursor(event?: MapBrowserEvent<UIEvent>): void {
    const activeCursor = this.getActiveSessionCursor();
    if (activeCursor !== undefined) {
      this.setCursor(activeCursor ?? undefined);
      return;
    }
    if (!event) {
      this.setCursor(undefined);
      return;
    }

    for (const entry of this.getOrderedLayers()) {
      const interactions = entry.descriptor.feature.interactions;
      if (!interactions) {
        continue;
      }
      const cursor = this.getLayerCursor(interactions);
      if (!cursor) {
        continue;
      }
      const hitTolerance = this.getCursorHitTolerance(interactions);
      const { items } = this.hitTest({
        layerId: entry.descriptor.id,
        layer: entry.layer,
        api: entry.api,
        descriptor: entry.descriptor,
        event,
        hitTolerance,
      });
      if (items.length > 0) {
        this.setCursor(cursor);
        return;
      }
    }

    this.setCursor(undefined);
  }

  private getActiveSessionCursor(): string | null | undefined {
    for (const entry of this.getOrderedLayers()) {
      const activeTranslate = this.activeTranslates.get(entry.descriptor.id);
      if (activeTranslate) {
        return activeTranslate.translate.cursor ?? null;
      }
      const activeModify = this.activeModifies.get(entry.descriptor.id);
      if (activeModify) {
        return activeModify.modify.cursor ?? null;
      }
    }
    return undefined;
  }

  private getLayerCursor(
    interactions: NonNullable<LayerEntry['descriptor']['feature']['interactions']>,
  ): string | undefined {
    const candidates: Array<NonNullable<InteractionBase> | undefined> = [
      interactions.hover,
      interactions.select,
      interactions.click,
      interactions.doubleClick,
      interactions.translate,
      interactions.modify,
    ];
    for (const interaction of candidates) {
      if (!interaction || !interaction.cursor) {
        continue;
      }
      if (!this.isEnabled(interaction.enabled)) {
        continue;
      }
      return interaction.cursor;
    }
    return undefined;
  }

  private getCursorHitTolerance(
    interactions: NonNullable<LayerEntry['descriptor']['feature']['interactions']>,
  ): number {
    const candidates = [
      interactions.hover,
      interactions.select,
      interactions.click,
      interactions.doubleClick,
      interactions.translate,
      interactions.modify,
    ].filter((interaction) => interaction && interaction.cursor && this.isEnabled(interaction.enabled));
    if (candidates.length === 0) {
      return this.getHitTolerance(undefined);
    }
    const tolerances = candidates
      .map((interaction) => interaction?.hitTolerance)
      .filter((value): value is number => value !== undefined);
    if (tolerances.length === 0) {
      return this.getHitTolerance(undefined);
    }
    return Math.max(...tolerances);
  }

  private setCursor(cursor?: string): void {
    if (this.currentCursor === cursor) {
      return;
    }
    const target = this.getTargetElement();
    if (!target) {
      return;
    }
    target.style.cursor = cursor ?? '';
    this.currentCursor = cursor;
  }

  private getTargetElement(): HTMLElement | null {
    const targetElement = this.map.getTargetElement?.();
    if (targetElement) {
      return targetElement;
    }
    const target = this.map.getTarget?.();
    if (!target) {
      return null;
    }
    if (typeof target === 'string') {
      if (typeof document === 'undefined') {
        return null;
      }
      return document.getElementById(target);
    }
    return target as HTMLElement;
  }

  private getLayerEntry(layerId: string): LayerEntry | null {
    const index = this.schema.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) {
      return null;
    }
    const descriptor = this.schema.layers[index];
    const layer = this.layers[layerId];
    const api = this.apis[layerId];
    if (!layer || !api) {
      return null;
    }
    return { descriptor, layer, api, index };
  }

  private startTranslate(
    entry: LayerEntry,
    active: ActiveTranslate,
    resolved: HitItem<any, any>,
    event: MapBrowserEvent<UIEvent>,
  ): void {
    if (active.started) {
      return;
    }
    active.started = true;
    if (active.translate.state) {
      this.applyState([resolved], active.translate.state, true);
    }

    const translateEvent = this.createTranslateEvent(
      event,
      active.startCoordinate,
      'translatestart',
      [resolved],
    );
    active.lastHandled = active.translate.onStart
      ? this.isHandled(active.translate.onStart({ item: resolved, ctx: this.ctx, event: translateEvent }))
      : false;
  }

  private applyTranslateMove(
    entry: LayerEntry,
    active: ActiveTranslate,
    event: MapBrowserEvent<UIEvent>,
  ): void {
    const translate = active.translate;
    const resolved = this.resolveTarget(entry, active.targetKey);
    if (!resolved) {
      this.finishTranslate(entry, active, active.lastItem);
      return;
    }

    const nextCoordinate = event.coordinate as [number, number];
    const delta = [
      nextCoordinate[0] - active.lastCoordinate[0],
      nextCoordinate[1] - active.lastCoordinate[1],
    ];

    if (!active.started) {
      const currentPixel = event.pixel as [number, number];
      const offsetX = currentPixel[0] - active.startPixel[0];
      const offsetY = currentPixel[1] - active.startPixel[1];
      const distance = Math.hypot(offsetX, offsetY);
      if (distance < active.startThresholdPx) {
        active.lastHandled = false;
        return;
      }

      this.startTranslate(entry, active, resolved, event);
    }

    active.lastCoordinate = nextCoordinate;
    active.lastItem = resolved;

    const geometry = resolved.feature.getGeometry();
    if (!geometry) {
      return;
    }
    const translated = geometry.clone();
    translated.translate(delta[0], delta[1]);

    this.runInteractionMutation(() =>
      entry.api.mutate(
        active.targetKey,
        (prev) => entry.descriptor.feature.geometry.applyGeometryToModel(prev, translated),
        {reason: 'translate'},
      ),
    );

    if (translate.onChange) {
      const translateEvent = this.createTranslateEvent(
        event,
        active.startCoordinate,
        'translating',
        [resolved],
      );
      active.lastHandled = this.isHandled(
        translate.onChange({ item: resolved, ctx: this.ctx, event: translateEvent }),
      );
    } else if (!translate.onStart) {
      active.lastHandled = false;
    }
  }

  private applyModifyChange(
    entry: LayerEntry,
    active: ActiveModify,
    event: MapBrowserEvent<UIEvent>,
  ): void {
    const modify = active.modify;
    const resolved = this.resolveTarget(entry, active.targetKey);
    if (!resolved) {
      this.finishModify(entry, active, active.lastItem);
      return;
    }

    active.lastItem = resolved;

    const geometry = resolved.feature.getGeometry();
    if (!geometry) {
      return;
    }

    const nextGeometry = geometry.clone();
    this.runInteractionMutation(() =>
      entry.api.mutate(
        active.targetKey,
        (prev) => entry.descriptor.feature.geometry.applyGeometryToModel(prev, nextGeometry),
        {reason: 'modify'},
      ),
    );

    if (modify.onChange) {
      const modifyEvent = this.createModifyEvent(event, 'modifying', [resolved]);
      active.lastHandled = this.isHandled(
        modify.onChange({ item: resolved, ctx: this.ctx, event: modifyEvent }),
      );
    } else {
      active.lastHandled = false;
    }
  }

  private finishTranslate(
    entry: LayerEntry,
    active: ActiveTranslate,
    item?: HitItem<any, any> | null,
  ): void {
    const finalItem = item ?? active.lastItem;
    if (active.throttleTimer) {
      clearTimeout(active.throttleTimer);
      active.throttleTimer = undefined;
      active.pendingEvent = undefined;
    }

    if (active.translate.state && finalItem) {
      this.applyState([finalItem], active.translate.state, false);
    }

    this.activeTranslates.delete(entry.descriptor.id);
    this.unlockDragPan();
  }

  private finishModify(
    entry: LayerEntry,
    active: ActiveModify,
    item?: HitItem<any, any> | null,
  ): void {
    const finalItem = item ?? active.lastItem;
    if (active.throttleTimer) {
      clearTimeout(active.throttleTimer);
      active.throttleTimer = undefined;
      active.pendingEvent = undefined;
    }

    if (active.modify.state && finalItem) {
      this.applyState([finalItem], active.modify.state, false);
    }

    this.activeModifies.delete(entry.descriptor.id);
    this.unlockDragPan();
  }

  private resolveTarget(entry: LayerEntry, targetKey: string | number): HitItem<any, any> | null {
    const source = entry.layer.getSource();
    if (!source) {
      return null;
    }
    const resolvedSource = source instanceof ClusterSource ? source.getSource() : source;
    if (!resolvedSource) {
      return null;
    }
    const feature = resolvedSource.getFeatureById(targetKey);
    if (!(feature instanceof Feature)) {
      return null;
    }
    const model = entry.api.getModelByFeature(feature as Feature<Geometry>);
    if (!model) {
      return null;
    }
    return { model, feature };
  }

  private lockDragPan(): void {
    this.dragPanLocks += 1;
    if (this.dragPanLocks !== 1) {
      return;
    }
    const interactions = this.map.getInteractions?.();
    if (!interactions) {
      return;
    }
    const dragPans = interactions
      .getArray()
      .filter((interaction): interaction is DragPan => interaction instanceof DragPan);
    if (dragPans.length === 0) {
      return;
    }
    if (!this.dragPanStates) {
      this.dragPanStates = new Map();
    }
    dragPans.forEach((interaction) => {
      if (!this.dragPanStates?.has(interaction)) {
        this.dragPanStates?.set(interaction, interaction.getActive());
      }
      interaction.setActive(false);
    });
  }

  private unlockDragPan(): void {
    if (this.dragPanLocks === 0) {
      return;
    }
    this.dragPanLocks -= 1;
    if (this.dragPanLocks !== 0) {
      return;
    }
    if (!this.dragPanStates) {
      return;
    }
    this.dragPanStates.forEach((wasActive, interaction) => {
      interaction.setActive(wasActive);
    });
    this.dragPanStates = undefined;
  }

  private createTranslateEvent(
    event: MapBrowserEvent<UIEvent>,
    startCoordinate: [number, number],
    type: 'translatestart' | 'translating' | 'translateend',
    items: Array<HitItem<any, any>>,
  ): TranslateEvent {
    const features = new Collection(items.map((item) => item.feature));
    return {
      type,
      features,
      coordinate: event.coordinate as [number, number],
      startCoordinate,
      mapBrowserEvent: event,
    } as unknown as TranslateEvent;
  }

  private createModifyEvent(
    event: MapBrowserEvent<UIEvent>,
    type: 'modifystart' | 'modifying' | 'modifyend',
    items: Array<HitItem<any, any>>,
  ): ModifyEvent {
    const features = new Collection(items.map((item) => item.feature));
    return {
      type,
      features,
      mapBrowserEvent: event,
    } as unknown as ModifyEvent;
  }

  private createDefaultHitTest(): HitTestFn {
    return ({ layer, api, event, hitTolerance }) => {
      const items: Array<HitItem<any, any>> = [];
      let clusterHit: ClusterHit | undefined;
      this.map.forEachFeatureAtPixel(
        event.pixel,
        (feature) => {
          if (!(feature instanceof Feature)) {
            return;
          }
          const clusterFeatures = getClusterFeatures(feature as Feature<Geometry>);
          if (clusterFeatures) {
            if (clusterFeatures.length > 1) {
              if (!clusterHit) {
                clusterHit = {
                  feature: feature as Feature<Geometry>,
                  features: clusterFeatures,
                  size: clusterFeatures.length,
                };
              }
              return;
            }
            const singleFeature = clusterFeatures[0];
            const singleModel = api.getModelByFeature(singleFeature as Feature<Geometry>);
            if (!singleModel) {
              return;
            }
            items.push({ model: singleModel, feature: singleFeature });
            return;
          }
          const model = api.getModelByFeature(feature as Feature<Geometry>);
          if (!model) {
            return;
          }
          items.push({ model, feature });
        },
        {
          layerFilter: (candidateLayer) => candidateLayer === layer,
          hitTolerance,
        },
      );
      return { items, cluster: clusterHit };
    };
  }

  private collectFeaturePopupItems(
    entry: LayerEntry,
    items: Array<HitItem<any, any>>,
    event: MapBrowserEvent<UIEvent>,
  ): Array<PopupItem<any>> {
    const popup = entry.descriptor.feature.popup;
    if (!popup || !this.isEnabled(popup.enabled)) {
      return [];
    }
    return items.map((item) => {
      const popupItem = popup.item({
        model: item.model,
        feature: item.feature,
        ctx: this.ctx,
        event,
      });
      return {
        ...popupItem,
        source: popupItem.source ?? 'feature',
        dedupKey: popupItem.dedupKey ?? entry.descriptor.feature.id(item.model),
      };
    });
  }

  private collectPopupItems(
    entry: LayerEntry,
    hitResult: HitTestResult,
    event: MapBrowserEvent<UIEvent>,
  ): Array<PopupItem<any>> {
    if (entry.descriptor.clustering && entry.api.isClusteringEnabled?.() && hitResult.cluster) {
      const clustering = entry.descriptor.clustering;
      if (clustering?.popup && this.isEnabled(clustering.popup.enabled)) {
        const models = hitResult.cluster.features
          .map((clusterFeature) =>
            entry.api.getModelByFeature(clusterFeature as Feature<Geometry>),
          )
          .filter((model): model is any => model !== undefined);
        const popupItem = clustering.popup.item({
          models,
          size: hitResult.cluster.size,
          ctx: this.ctx,
          event,
        });
        return [
          {
            ...popupItem,
            source: popupItem.source ?? 'cluster',
            dedupKey: popupItem.dedupKey ?? this.getClusterDedupKey(entry, models),
          },
        ];
      }
      return [];
    }
    return this.collectFeaturePopupItems(entry, hitResult.items, event);
  }

  private getClusterDedupKey(entry: LayerEntry, models: any[]): string {
    const ids = models
      .map((model) => String(entry.descriptor.feature.id(model)))
      .sort((a, b) => a.localeCompare(b))
      .join('|');
    return `cluster:${entry.descriptor.id}:${ids}`;
  }

  private getOrderedLayers(): LayerEntry[] {
    return this.schema.layers
      .map((descriptor, index) => ({
        descriptor,
        index,
        layer: this.layers[descriptor.id],
        api: this.apis[descriptor.id],
      }))
      .filter((entry) => entry.layer && entry.api)
      .sort((a, b) => {
        const aZ = a.layer.getZIndex() ?? 0;
        const bZ = b.layer.getZIndex() ?? 0;
        if (aZ !== bZ) {
          return bZ - aZ;
        }
        return b.index - a.index;
      });
  }

  private getHitTolerance(hitTolerance?: number): number {
    if (hitTolerance !== undefined) {
      return hitTolerance;
    }
    if (this.schema.options?.hitTolerance !== undefined) {
      return this.schema.options.hitTolerance;
    }
    return 0;
  }

  private isEnabled(enabled?: boolean | (() => boolean)): boolean {
    if (enabled === undefined) {
      return true;
    }
    if (typeof enabled === 'function') {
      return enabled();
    }
    return enabled;
  }

  private isMaybeEnabled(enabled?: boolean | (() => boolean)): boolean {
    if (enabled === undefined) {
      return true;
    }
    if (typeof enabled === 'function') {
      return true;
    }
    return enabled;
  }

  private processHover(
    entry: LayerEntry,
    hover: NonNullable<NonNullable<LayerEntry['descriptor']['feature']['interactions']>['hover']>,
    items: Array<HitItem<any, any>>,
    event: MapBrowserEvent<UIEvent>,
  ): boolean {
    const prev = this.hoverItems.get(entry.descriptor.id) ?? new Map();
    const next = this.itemsToMap(entry, items);
    const entered = Array.from(next.entries())
      .filter(([id]) => !prev.has(id))
      .map(([, item]) => item);
    const left = Array.from(prev.entries())
      .filter(([id]) => !next.has(id))
      .map(([, item]) => item);

    let handled = false;
    if (left.length > 0 && hover.onLeave) {
      handled = this.isHandled(hover.onLeave({ items: left, ctx: this.ctx, event }));
    }
    if (entered.length > 0 && hover.onEnter) {
      handled = this.isHandled(hover.onEnter({ items: entered, ctx: this.ctx, event })) || handled;
    }

    if (hover.state) {
      this.applyState(left, hover.state, false);
      this.applyState(entered, hover.state, true);
    }

    this.hoverItems.set(entry.descriptor.id, next);
    return handled;
  }

  private processSelect(
    entry: LayerEntry,
    select: NonNullable<NonNullable<LayerEntry['descriptor']['feature']['interactions']>['select']>,
    items: Array<HitItem<any, any>>,
    event: MapBrowserEvent<UIEvent>,
  ): boolean {
    const selectedItems = select.pickTargets
      ? select.pickTargets({ candidates: items, ctx: this.ctx, event })
      : items;

    if (!selectedItems || selectedItems.length === 0) {
      if (select.pickTargets) {
        return false;
      }
      const prev = this.selectedItems.get(entry.descriptor.id);
      this.selectedItems.set(entry.descriptor.id, new Map());
      if (select.onClear) {
        const handled = this.isHandled(select.onClear({ ctx: this.ctx, event }));
        if (select.state && prev) {
          this.applyState(Array.from(prev.values()), select.state, false);
        }
        return handled;
      }
      if (select.state && prev) {
        this.applyState(Array.from(prev.values()), select.state, false);
      }
      return false;
    }

    const prev = this.selectedItems.get(entry.descriptor.id) ?? new Map();
    const next = this.itemsToMap(entry, selectedItems);
    const handled = select.onSelect
      ? this.isHandled(select.onSelect({ items: selectedItems, ctx: this.ctx, event }))
      : false;
    if (select.state) {
      const added = Array.from(next.entries())
        .filter(([id]) => !prev.has(id))
        .map(([, item]) => item);
      const removed = Array.from(prev.entries())
        .filter(([id]) => !next.has(id))
        .map(([, item]) => item);
      this.applyState(removed, select.state, false);
      this.applyState(added, select.state, true);
    }
    this.selectedItems.set(entry.descriptor.id, next);
    return handled;
  }

  private processClick(
    entry: LayerEntry,
    click: NonNullable<NonNullable<LayerEntry['descriptor']['feature']['interactions']>['click']>,
    items: Array<HitItem<any, any>>,
    event: MapBrowserEvent<UIEvent>,
  ): boolean {
    return this.isHandled(click.onClick({ items, ctx: this.ctx, event }));
  }

  private processDoubleClick(
    entry: LayerEntry,
    doubleClick: NonNullable<
      NonNullable<LayerEntry['descriptor']['feature']['interactions']>['doubleClick']
    >,
    items: Array<HitItem<any, any>>,
    event: MapBrowserEvent<UIEvent>,
  ): boolean {
    return this.isHandled(doubleClick.onDoubleClick({ items, ctx: this.ctx, event }));
  }

  private itemsToMap(
    entry: LayerEntry,
    items: Array<HitItem<any, any>>,
  ): Map<string | number, HitItem<any, any>> {
    const next = new Map<string | number, HitItem<any, any>>();
    items.forEach((item) => {
      const id = entry.descriptor.feature.id(item.model);
      next.set(id, item);
    });
    return next;
  }

  private applyState(items: Array<HitItem<any, any>>, state: FeatureState, enabled: boolean): void {
    const states = Array.isArray(state) ? state : [state];
    items.forEach((item) => {
      const current = new Set(getFeatureStates(item.feature));
      states.forEach((entry) => {
        if (enabled) {
          current.add(entry);
        } else {
          current.delete(entry);
        }
      });
      setFeatureStates(item.feature, Array.from(current));
    });
  }

  private isHandled(result: InteractionHandlerResult): boolean {
    return result === true;
  }

  private shouldStopPropagation(base: InteractionBase): boolean {
    return base.propagation !== 'continue';
  }

  private shouldContinuePropagation(base: InteractionBase): boolean {
    return base.propagation === 'continue';
  }

  private handleClusterClick(
    entry: LayerEntry,
    clusterHit: ClusterHit,
    event: MapBrowserEvent<UIEvent>,
    manualPopupPush: boolean,
  ): boolean {
    const clustering = entry.descriptor.clustering;
    if (!clustering) {
      return false;
    }

    const models = clusterHit.features
      .map((clusterFeature) =>
        entry.api.getModelByFeature(clusterFeature as Feature<Geometry>),
      )
      .filter((model): model is any => model !== undefined);
    let handled = false;

    if (clustering.expandOnClick) {
      this.expandCluster(clusterHit, clustering.expandOnClick);
      clustering.expandOnClick.onExpanded?.({ models, ctx: this.ctx });
      handled = true;
    }

    if (clustering.popup && this.isEnabled(clustering.popup.enabled)) {
      if (manualPopupPush || !this.ctx.popupHost) {
        const item = clustering.popup.item({ models, size: clusterHit.size, ctx: this.ctx, event });
        if (manualPopupPush && this.ctx.popupHost) {
          this.ctx.popupHost.push([
            {
              ...item,
              source: item.source ?? 'cluster',
              dedupKey: item.dedupKey ?? this.getClusterDedupKey(entry, models),
            },
          ]);
        }
      }
      handled = true;
    }

    return handled;
  }

  private expandCluster(
    clusterHit: ClusterHit,
    expand: NonNullable<NonNullable<LayerEntry['descriptor']['clustering']>['expandOnClick']>,
  ): void {
    const view = this.map.getView();
    const duration = expand.durationMs;
    if (expand.mode === 'zoomIn') {
      const currentZoom = view.getZoom() ?? 0;
      const delta = expand.zoomDelta ?? 1;
      const targetZoom = currentZoom + delta;
      const nextZoom =
        expand.maxZoom !== undefined ? Math.min(expand.maxZoom, targetZoom) : targetZoom;
      view.animate({ zoom: nextZoom, duration });
      return;
    }

    const extent = createEmpty();
    clusterHit.features.forEach((feature) => {
      const geometry = feature.getGeometry();
      if (geometry) {
        extend(extent, geometry.getExtent());
      }
    });
    if (isEmpty(extent)) {
      return;
    }
    const padding = toOlPadding(expand.padding, undefined);
    view.fit(extent, {
      padding,
      duration,
      maxZoom: expand.maxZoom,
    });
  }

  private shouldStopClusterPropagation(): boolean {
    return true;
  }

  dispose(): void {
    this.listenerKeys.forEach((key) => Observable.unByKey(key));
    this.listenerKeys.clear();
    Array.from(this.nativeModifies.keys()).forEach((id) => this.teardownNativeModify(id));
    this.hoverItems.clear();
    this.selectedItems.clear();
    this.activeTranslates.clear();
    this.activeModifies.clear();
    this.enabledState.clear();
  }
}
