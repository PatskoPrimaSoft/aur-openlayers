import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import type Geometry from 'ol/geom/Geometry';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import {
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import {MapHostComponent, MapHostConfig} from '../shared/map-host/map-host.component';
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';
import {
  applyGeometryToMapPoint,
  mapPointToGeometry,
  MapPoint,
  MapPointGenerator,
} from '../shared/map-point';

const BASE_COLOR = '#1976d2';
const STATE_COLOR_MAP = {
  red: '#ef4444',
  yellow: '#facc15',
  green: '#22c55e',
} as const;

type PointStyleOptions = {
  color: string;
  radius: number;
  label: string;
};

const POINTS: MapPoint[] = new MapPointGenerator().getByIds([
  'minsk-center',
  'minsk-library',
  'minsk-arena',
]);

const COLOR_OPTIONS = [
  {label: 'Красный', state: 'red', color: STATE_COLOR_MAP.red},
  {label: 'Желтый', state: 'yellow', color: STATE_COLOR_MAP.yellow},
  {label: 'Зеленый', state: 'green', color: STATE_COLOR_MAP.green},
  {label: 'Сброс', state: undefined, color: '#94a3b8'},
] as const;

@Component({
  selector: 'app-map-point-change-style',
  standalone: true,
  imports: [CommonModule, MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-point-change-style.component.html',
  styleUrl: './map-point-change-style.component.scss',
})
export class MapPointChangeStyleComponent {
  readonly points = POINTS;
  readonly colorOptions = COLOR_OPTIONS;
  readonly mapConfig: MapHostConfig<
    readonly VectorLayerDescriptor<MapPoint, Geometry, PointStyleOptions>[]
  > = {
    schema: {
      layers: [
        {
          id: 'points',
          feature: {
            id: (model: MapPoint) => model.id,
            geometry: {
              fromModel: mapPointToGeometry,
              applyGeometryToModel: applyGeometryToMapPoint,
            },
            style: {
              base: (model: MapPoint) => ({
                color: BASE_COLOR,
                radius: 7,
                label: model.name,
              }),
              states: {
                red: () => ({color: STATE_COLOR_MAP.red}),
                yellow: () => ({color: STATE_COLOR_MAP.yellow}),
                green: () => ({color: STATE_COLOR_MAP.green}),
              },
              render: (opts: PointStyleOptions) =>
                new Style({
                  image: new CircleStyle({
                    radius: opts.radius,
                    fill: new Fill({color: opts.color}),
                    stroke: new Stroke({color: '#ffffff', width: 2}),
                  }),
                  text: new Text({
                    text: opts.label,
                    offsetY: 18,
                    fill: new Fill({color: '#111827'}),
                    stroke: new Stroke({color: '#ffffff', width: 3}),
                    font: '600 12px "Inter", sans-serif',
                  }),
                }),
            },
          },
        },
      ],
    },
    view: {
      centerLonLat: [27.5619, 53.9023],
      zoom: 11,
    },
    osm: true,
  };

  private pointLayerApi?: VectorLayerApi<MapPoint, Geometry>;

  onReady(ctx: MapContext): void {
    this.pointLayerApi = ctx.layers['points'] as VectorLayerApi<MapPoint, Geometry> | undefined;
    this.pointLayerApi?.setModels(POINTS);
    this.pointLayerApi?.centerOnAllModels({padding: {all: 80}});
  }

  changePointColor(pointId: string, state?: keyof typeof STATE_COLOR_MAP): void {
    this.pointLayerApi?.setFeatureStates(pointId, state);
    this.pointLayerApi?.centerOnModel(pointId, {maxZoom: 13});
  }
}
