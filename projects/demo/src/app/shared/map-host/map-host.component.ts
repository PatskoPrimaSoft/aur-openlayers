import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import Map from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import View from 'ol/View';
import { fromLonLat } from 'ol/proj';
import OSM from 'ol/source/OSM';

import {
  LayerManager,
  MapContext,
  MapController,
  MapSchema,
  VectorLayerDescriptor,
} from '../../../../../lib/src/lib/map-framework';

export type MapHostViewConfig = {
  centerLonLat: [number, number];
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
};

export type MapHostConfig<
  Layers extends readonly VectorLayerDescriptor<any, any, any, any>[] = readonly VectorLayerDescriptor<
    any,
    any,
    any,
    any
  >[],
> = {
  schema: MapSchema<Layers>;
  view: MapHostViewConfig;
  osm?: boolean;
  controllers?: MapController[];
};

@Component({
  selector: 'mff-map-host',
  standalone: true,
  templateUrl: './map-host.component.html',
  styleUrl: './map-host.component.scss',
})
export class MapHostComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) config!: MapHostConfig;
  @Output() ready = new EventEmitter<MapContext>();
  @Output() destroyed = new EventEmitter<void>();
  @ViewChild('map', { static: true }) mapElement!: ElementRef<HTMLDivElement>;

  private map?: Map;
  private layerManager?: LayerManager<any>;
  private ctx?: MapContext;
  private controllers: MapController[] = [];

  private resizeObserver?: ResizeObserver;

  constructor(private readonly zone: NgZone) {}

  ngAfterViewInit(): void {
    if (!this.config) return;

    let ctx: MapContext | undefined;
    this.zone.runOutsideAngular(() => {
      const { schema, view } = this.config;
      const layers: TileLayer[] = [];
      if (this.config.osm ?? true) {
        layers.push(new TileLayer({ source: new OSM() }));
      }

      const map = new Map({
        target: this.mapElement.nativeElement,
        layers,
        view: new View({
          center: fromLonLat(view.centerLonLat),
          zoom: view.zoom,
          minZoom: view.minZoom,
          maxZoom: view.maxZoom,
        }),
      });

      this.map = map;
      this.layerManager = LayerManager.create(map, schema);
      ctx = this.layerManager.getContext();
      this.ctx = ctx;

      this.controllers = this.config.controllers ?? [];
      this.controllers.forEach((controller) => controller.bind(ctx!));
    });

    if (ctx) {
      this.zone.run(() => this.ready.emit(ctx!));
    }

    setTimeout(() => this.map?.updateSize(), 0);

    this.resizeObserver = new ResizeObserver(() => {
      this.map?.updateSize();
    });
    this.resizeObserver.observe(this.mapElement.nativeElement);
  }

  ngOnDestroy(): void {
    this.zone.runOutsideAngular(() => {
      this.controllers.forEach((controller) => controller.unbind?.());
      this.controllers = [];
      this.resizeObserver?.disconnect();
      this.layerManager?.dispose();
      this.layerManager = undefined;
      this.map?.setTarget(undefined);
      this.map = undefined;
      this.ctx = undefined;
    });

    this.zone.run(() => this.destroyed.emit());
  }
}
