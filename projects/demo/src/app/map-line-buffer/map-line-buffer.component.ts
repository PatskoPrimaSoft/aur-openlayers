import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LineString } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import Fill from 'ol/style/Fill';
import RegularShape from 'ol/style/RegularShape';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type {
  BufferDecoration,
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';

type LineModel = { id: string; coordinates: [number, number][] };
type LineStyleOpts = { color: string; width: number };

const ROUTE_COORDINATES: [number, number][] = [
  [27.4745, 53.9130],
  [27.5060, 53.9110],
  [27.5350, 53.9050],
  [27.5619, 53.9023],
  [27.5900, 53.9080],
  [27.6150, 53.9150],
  [27.6400, 53.9100],
];

@Component({
  selector: 'app-map-line-buffer',
  standalone: true,
  imports: [CommonModule, FormsModule, MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-line-buffer.component.html',
  styleUrl: './map-line-buffer.component.scss',
})
export class MapLineBufferComponent {
  bufferDistance = 500;
  bufferOpacity = 0.15;
  cap: 'round' | 'flat' = 'round';
  layerVisible = true;

  private lineApi?: VectorLayerApi<LineModel, LineString>;

  private readonly bufferStyle = new Style({
    fill: new Fill({ color: `rgba(37, 99, 235, ${this.bufferOpacity})` }),
    stroke: new Stroke({ color: '#2563eb', width: 1 }),
  });

  private readonly bufferConfig: BufferDecoration = {
    distance: this.bufferDistance,
    style: this.bufferStyle,
    cap: this.cap,
  };

  private readonly lineModels: LineModel[] = [
    { id: 'route', coordinates: ROUTE_COORDINATES },
  ];

  readonly mapConfig: MapHostConfig<readonly VectorLayerDescriptor<any, any, any, any>[]> = {
    schema: {
      layers: [
        {
          id: 'line',
          zIndex: 1,
          feature: {
            id: (m: LineModel) => m.id,
            geometry: {
              fromModel: (m: LineModel) =>
                new LineString(m.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
              applyGeometryToModel: (prev: LineModel) => prev,
            },
            style: {
              base: (): LineStyleOpts => ({ color: '#2563eb', width: 4 }),
              render: (opts: LineStyleOpts) =>
                new Style({ stroke: new Stroke({ color: opts.color, width: opts.width }) }),
            },
            decorations: {
              buffer: this.bufferConfig,
              arrows: {
                interval: (view) => Math.max(100, view.resolution * 80),
                style: ({ rotation }) =>
                  new Style({
                    image: new RegularShape({
                      points: 3,
                      radius: 6,
                      rotation,
                      fill: new Fill({ color: '#2563eb' }),
                      stroke: new Stroke({ color: '#ffffff', width: 1 }),
                    }),
                  }),
              },
            },
          },
        },
      ],
    },
    view: { centerLonLat: [27.5619, 53.9023], zoom: 12 },
    osm: true,
  };

  constructor(private readonly zone: NgZone) {}

  onReady(ctx: MapContext): void {
    this.lineApi = ctx.layers['line'] as VectorLayerApi<LineModel, LineString>;
    this.lineApi.setModels(this.lineModels);
  }

  onDistanceChange(value: number): void {
    this.bufferDistance = value;
    this.bufferConfig.distance = value;
    this.triggerRebuild();
  }

  onOpacityChange(value: number): void {
    this.bufferOpacity = value;
    this.bufferStyle.getFill().setColor(`rgba(37, 99, 235, ${value})`);
    this.triggerRebuild();
  }

  onCapChange(value: 'round' | 'flat'): void {
    this.cap = value;
    (this.bufferConfig as any).cap = value;
    this.triggerRebuild();
  }

  toggleLayerVisible(): void {
    this.layerVisible = !this.layerVisible;
    this.lineApi?.setVisible(this.layerVisible);
  }

  private triggerRebuild(): void {
    this.zone.runOutsideAngular(() => {
      this.lineApi?.setModels(this.lineModels);
    });
  }
}
