import {Component, NgZone, OnDestroy} from '@angular/core';
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
import {applyGeometryToMapPoint, mapPointToGeometry, MapPoint} from '../shared/map-point';

type PointStyleOptions = {
  color: string;
  radius: number;
  label: string;
};

const INITIAL_POINT = new MapPoint('minsk-center', 'Точка Минска', 53.9097, 27.5678);

@Component({
  selector: 'app-map-point-move',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-point-move.component.html',
  styleUrl: './map-point-move.component.scss',
})
export class MapPointMoveComponent implements OnDestroy {
  currentPoint = INITIAL_POINT;

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
                color: '#2563eb',
                radius: 8,
                label: model.name,
              }),
              states: {
                DRAGGING: () => ({
                  color: '#f97316',
                  radius: 12,
                }),
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
                    fill: new Fill({color: '#0f172a'}),
                    stroke: new Stroke({color: '#ffffff', width: 3}),
                    font: '600 12px "Inter", sans-serif',
                  }),
                }),
            },
            interactions: {
              translate: {
                cursor: 'grabbing',
                hitTolerance: 6,
                state: 'DRAGGING',
              },
            },
          },
        },
      ],
    },
    view: {
      centerLonLat: [INITIAL_POINT.lng, INITIAL_POINT.lat],
      zoom: 12,
    },
    osm: true,
  };

  private pointLayerApi?: VectorLayerApi<MapPoint, Geometry>;
  private unsubscribe?: () => void;

  constructor(private readonly ngZone: NgZone) {}

  onReady(ctx: MapContext): void {
    const api = ctx.layers['points'] as VectorLayerApi<MapPoint, Geometry> | undefined;
    this.pointLayerApi = api;
    api?.setModels([INITIAL_POINT]);
    api?.centerOnAllModels({maxZoom: 13});

    this.unsubscribe = api?.onModelsChanged?.((changes) => {
      const latest = changes.at(-1);
      if (!latest) return;
      this.ngZone.run(() => {
        this.currentPoint = latest.next;
      });
    });
  }

  formatCoord(value: number): string {
    return value.toFixed(6);
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }
}
