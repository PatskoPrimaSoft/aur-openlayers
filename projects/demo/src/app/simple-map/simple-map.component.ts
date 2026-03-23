import { Component } from '@angular/core';
import type Geometry from 'ol/geom/Geometry';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import {
  MapContext,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';
import {
  applyGeometryToMapPoint,
  mapPointToGeometry,
  MapPoint,
  MapPointGenerator,
} from '../shared/map-point';

type PointStyleOptions = {
  color: string;
  radius: number;
  label: string;
};

const POINTS = new MapPointGenerator().getByCount(3);

@Component({
  selector: 'app-simple-map',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './simple-map.component.html',
  styleUrl: './simple-map.component.scss',
})
export class SimpleMapComponent {
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
                color: '#1976d2',
                radius: 6,
                label: model.name,
              }),
              render: (opts: PointStyleOptions) =>
                new Style({
                  image: new CircleStyle({
                    radius: opts.radius,
                    fill: new Fill({ color: opts.color }),
                    stroke: new Stroke({ color: '#ffffff', width: 2 }),
                  }),
                  text: new Text({
                    text: opts.label,
                    offsetY: 18,
                    fill: new Fill({ color: '#1f2937' }),
                    stroke: new Stroke({ color: '#ffffff', width: 3 }),
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

  onReady(ctx: MapContext): void {
    ctx.layers['points']?.setModels(POINTS);
  }
}
