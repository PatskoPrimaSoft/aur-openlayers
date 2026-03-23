import {Component, NgZone} from '@angular/core';
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
import {MapHostComponent, MapHostConfig} from '../shared/map-host/map-host.component';
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

const POINTS = new MapPointGenerator().getByCount(5);

@Component({
  selector: 'app-map-select-interaction',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-select-interaction.component.html',
  styleUrl: './map-select-interaction.component.scss',
})
export class MapSelectInteractionComponent {
  selectedPointName: string | null = null;

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
                radius: 7,
                label: model.name,
              }),
              states: {
                SELECTED: () => ({
                  color: '#f97316',
                  radius: 10,
                }),
              },
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
                    fill: new Fill({ color: '#0f172a' }),
                    stroke: new Stroke({ color: '#ffffff', width: 3 }),
                    font: '600 12px "Inter", sans-serif',
                  }),
                }),
            },
            interactions: {
              select: {
                cursor: 'pointer',
                state: 'SELECTED',
                hitTolerance: 6,
                onSelect: ({ items }) => {
                  this.zone.run(() => {
                    this.selectedPointName = items[0]?.model?.name ?? null;
                  });
                  return true;
                },
                onClear: () => {
                  this.zone.run(() => {
                    this.selectedPointName = null;
                  });
                  return true;
                },
              },
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

  constructor(private readonly zone: NgZone) {}

  onReady(ctx: MapContext): void {
    ctx.layers['points']?.setModels(POINTS);
  }
}
