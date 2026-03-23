import { Component, NgZone } from '@angular/core';
import type Geometry from 'ol/geom/Geometry';
import Point from 'ol/geom/Point';
import { fromLonLat, toLonLat } from 'ol/proj';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import { VectorLayerDescriptor } from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { DemoHeaderComponent } from '../shared/demo-header/demo-header.component';

type ClickMarker = {
  id: string;
  lat: number;
  lng: number;
};

type ClickStyleOptions = {
  color: string;
  radius: number;
};

@Component({
  selector: 'app-map-click-interaction',
  standalone: true,
  imports: [MapHostComponent, DemoHeaderComponent],
  templateUrl: './map-click-interaction.component.html',
  styleUrl: './map-click-interaction.component.scss',
})
export class MapClickInteractionComponent {
  clickedPosition: { lat: number; lng: number } | null = null;

  readonly mapConfig: MapHostConfig<
    readonly VectorLayerDescriptor<ClickMarker, Geometry, ClickStyleOptions>[]
  > = {
    schema: {
      layers: [
        {
          id: 'click-layer',
          feature: {
            id: (model: ClickMarker) => model.id,
            geometry: {
              fromModel: (model: ClickMarker) =>
                new Point(fromLonLat([model.lng, model.lat])),
              applyGeometryToModel: (prev: ClickMarker) => prev,
            },
            style: {
              base: () => ({
                color: '#2563eb',
                radius: 6,
              }),
              render: (opts: ClickStyleOptions) =>
                new Style({
                  image: new CircleStyle({
                    radius: opts.radius,
                    fill: new Fill({ color: opts.color }),
                    stroke: new Stroke({ color: '#ffffff', width: 2 }),
                  }),
                }),
            },
            interactions: {
              click: {
                cursor: 'pointer',
                onClick: ({ ctx, event }) => {
                  const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                  this.zone.run(() => {
                    this.clickedPosition = { lat, lng };
                  });
                  ctx.layers['click-layer']!.setModels([
                    {
                      id: 'click-marker',
                      lat,
                      lng,
                    },
                  ]);
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

  get formattedCoordinates(): string {
    if (!this.clickedPosition) {
      return 'кликните по карте';
    }

    const { lat, lng } = this.clickedPosition;
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}
