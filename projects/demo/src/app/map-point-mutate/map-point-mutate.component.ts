import {Component} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
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

type PointStyleOptions = {
  color: string;
  radius: number;
  id: string;
  name: string;
};

const POINTS: MapPoint[] = new MapPointGenerator().getByCount(3);

@Component({
  selector: 'app-map-point-mutate',
  standalone: true,
  imports: [CommonModule, FormsModule, MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-point-mutate.component.html',
  styleUrl: './map-point-mutate.component.scss',
})
export class MapPointMutateComponent {
  readonly mapConfig: MapHostConfig<
    readonly VectorLayerDescriptor<MapPoint, Geometry, PointStyleOptions>[]
  > = {
    schema: {
      layers: [
        {
          id: 'points',
          feature: {
            id: (m) => m.id,
            geometry: {
              fromModel: mapPointToGeometry,
              applyGeometryToModel: applyGeometryToMapPoint,
            },
            style: {
              base: (m) => ({color: '#7c3aed', radius: 7, id: m.id, name: m.name}),
              render: (o) =>
                new Style({
                  image: new CircleStyle({
                    radius: o.radius,
                    fill: new Fill({color: o.color}),
                    stroke: new Stroke({color: '#fff', width: 2}),
                  }),
                  text: new Text({
                    text: `[${o.id}] ${o.name}`,
                    offsetY: 18,
                    fill: new Fill({color: '#111827'}),
                    stroke: new Stroke({color: '#fff', width: 3}),
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
    this.pointLayerApi?.centerOnAllModels();
  }

  updatePoint(id: string, field: 'name' | 'lat' | 'lng', value: string | number): void {
    this.pointLayerApi?.mutate(id, (prev) => {
      if (!prev) return prev;

      if (field === 'name') {
        return new MapPoint(
          prev.id,
          String(value),
          prev.lat,
          prev.lng,
          prev.district, prev.address, prev.details, prev.status, prev.schedule,
        );
      }

      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return prev;

      return new MapPoint(
        prev.id,
        prev.name,
        field === 'lat' ? num : prev.lat,
        field === 'lng' ? num : prev.lng,
        prev.district, prev.address, prev.details, prev.status, prev.schedule,
      );
    });

    this.pointLayerApi?.centerOnModel(id, { maxZoom: 14 });
  }


  protected readonly POINTS = POINTS;
}
