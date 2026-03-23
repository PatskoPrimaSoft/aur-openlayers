import { Component } from '@angular/core';
import type Geometry from 'ol/geom/Geometry';
import { fromLonLat } from 'ol/proj';
import Polygon from 'ol/geom/Polygon';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import { MapContext, VectorLayerApi, VectorLayerDescriptor } from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';

type MapPolygon = {
  id: string;
  name: string;
  color: string;
  coordinates: [number, number][];
};

type PolygonStyleOptions = {
  fillColor: string;
  strokeColor: string;
  label: string;
};

const POLYGONS: MapPolygon[] = [
  {
    id: 'poly-1',
    name: 'Северный квартал',
    color: '#2563eb',
    coordinates: [
      [27.5525, 53.9085],
      [27.5615, 53.913],
      [27.5705, 53.9082],
      [27.5615, 53.9035],
      [27.5525, 53.9085],
    ],
  },
  {
    id: 'poly-2',
    name: 'Центральный парк',
    color: '#f97316',
    coordinates: [
      [27.572, 53.9015],
      [27.582, 53.9045],
      [27.589, 53.9],
      [27.581, 53.8955],
      [27.572, 53.9015],
    ],
  },
  {
    id: 'poly-3',
    name: 'Южный микрорайон',
    color: '#10b981',
    coordinates: [
      [27.545, 53.8965],
      [27.552, 53.901],
      [27.559, 53.896],
      [27.5515, 53.8915],
      [27.545, 53.8965],
    ],
  },
];

@Component({
  selector: 'app-map-polygons-labels',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-polygons-labels.component.html',
  styleUrl: './map-polygons-labels.component.scss',
})
export class MapPolygonsLabelsComponent {
  readonly mapConfig: MapHostConfig<
    readonly VectorLayerDescriptor<MapPolygon, Geometry, PolygonStyleOptions>[]
  > = {
    schema: {
      layers: [
        {
          id: 'polygons',
          feature: {
            id: (model: MapPolygon) => model.id,
            geometry: {
              fromModel: (model: MapPolygon) =>
                new Polygon([model.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))]),
              applyGeometryToModel: (prev: MapPolygon) => prev,
            },
            style: {
              base: (model: MapPolygon) => ({
                fillColor: `${model.color}55`,
                strokeColor: model.color,
                label: model.name,
              }),
              render: (opts: PolygonStyleOptions) =>
                new Style({
                  fill: new Fill({ color: opts.fillColor }),
                  stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
                  text: new Text({
                    text: opts.label,
                    textAlign: 'center',
                    textBaseline: 'middle',
                    fill: new Fill({ color: '#0f172a' }),
                    stroke: new Stroke({ color: '#ffffff', width: 3 }),
                    font: '600 13px "Inter", sans-serif',
                  }),
                }),
            },
          },
        },
      ],
    },
    view: {
      centerLonLat: [27.566, 53.903],
      zoom: 12,
    },
    osm: true,
  };

  private polygonLayerApi?: VectorLayerApi<MapPolygon, Polygon>;

  onReady(ctx: MapContext): void {
    this.polygonLayerApi = ctx.layers['polygons'] as
      | VectorLayerApi<MapPolygon, Polygon>
      | undefined;

    this.polygonLayerApi?.setModels(POLYGONS);
    this.polygonLayerApi?.centerOnAllModels({ padding: { all: 80 } });
  }
}
