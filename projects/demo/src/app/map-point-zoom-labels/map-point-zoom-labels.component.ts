import {Component} from '@angular/core';
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

const LABEL_ZOOM_THRESHOLD = 12;
const POINTS = new MapPointGenerator().getByCount(5);

type PointStyleOptions = {
  color: string;
  radius: number;
  label: string;
  showLabel: boolean;
};

@Component({
  selector: 'app-map-point-zoom-labels',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-point-zoom-labels.component.html',
  styleUrl: './map-point-zoom-labels.component.scss',
})
export class MapPointZoomLabelsComponent {
  readonly labelZoomThreshold = LABEL_ZOOM_THRESHOLD;
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
              base: (model: MapPoint, view) => {
                const zoom = view.zoom ?? 0;
                const isClose = zoom >= LABEL_ZOOM_THRESHOLD;
                return {
                  color: isClose ? '#2563eb' : '#94a3b8',
                  radius: isClose ? 8 : 5,
                  label: model.name,
                  showLabel: isClose,
                };
              },
              render: (opts: PointStyleOptions) =>
                new Style({
                  image: new CircleStyle({
                    radius: opts.radius,
                    fill: new Fill({color: opts.color}),
                    stroke: new Stroke({color: '#ffffff', width: 2}),
                  }),
                  text: opts.showLabel
                    ? new Text({
                        text: opts.label,
                        offsetY: 18,
                        fill: new Fill({color: '#0f172a'}),
                        stroke: new Stroke({color: '#ffffff', width: 3}),
                        font: '600 12px "Inter", sans-serif',
                      })
                    : undefined,
                }),
            },
          },
        },
      ],
    },
    view: {
      centerLonLat: [27.5619, 53.9023],
      zoom: 11,
      minZoom: 9,
      maxZoom: 16,
    },
    osm: true,
  };

  private pointLayerApi?: VectorLayerApi<MapPoint, Geometry>;

  onReady(ctx: MapContext): void {
    this.pointLayerApi = ctx.layers['points'] as VectorLayerApi<MapPoint, Geometry> | undefined;
    this.pointLayerApi?.setModels(POINTS);
    this.pointLayerApi?.centerOnAllModels({padding: {all: 80}});
  }
}
