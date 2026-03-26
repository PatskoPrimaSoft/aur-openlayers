import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import type Geometry from 'ol/geom/Geometry';
import {
  MapContext,
  VectorLayerApi,
  VectorLayerDescriptor,
} from '../../../../lib/src/lib/map-framework';
import { MapHostComponent, MapHostConfig } from '../shared/map-host/map-host.component';
import { RippleEffect } from '../shared/ripple-effect';

interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const CITIES: City[] = [
  { id: 'moscow', name: 'Moscow', lat: 55.7558, lng: 37.6173 },
  { id: 'london', name: 'London', lat: 51.5074, lng: -0.1278 },
  { id: 'new-york', name: 'New York', lat: 40.7128, lng: -74.006 },
  { id: 'tokyo', name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { id: 'sydney', name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { id: 'paris', name: 'Paris', lat: 48.8566, lng: 2.3522 },
];

type CityStyleOpts = { color: string; radius: number };

@Component({
  selector: 'app-map-ripple-demo',
  standalone: true,
  imports: [CommonModule, MapHostComponent],
  templateUrl: './map-ripple-demo.component.html',
  styleUrl: './map-ripple-demo.component.scss',
})
export class MapRippleDemoComponent implements OnDestroy {
  selectedId: string | null = null;
  readonly cities = CITIES;

  private citiesLayer?: VectorLayerApi<City, Geometry>;
  private ripple?: RippleEffect;

  readonly mapConfig: MapHostConfig<
    readonly [VectorLayerDescriptor<City, Geometry, CityStyleOpts>]
  > = {
    schema: {
      layers: [
        {
          id: 'cities',
          feature: {
            id: (m: City) => m.id,
            geometry: {
              fromModel: (m: City) => new Point(fromLonLat([m.lng, m.lat])),
              applyGeometryToModel: (prev: City) => prev,
            },
            style: {
              base: () => ({ color: 'rgb(219,39,119)', radius: 8 }),
              render: (opts: CityStyleOpts) =>
                new Style({
                  image: new CircleStyle({
                    radius: opts.radius,
                    fill: new Fill({ color: opts.color }),
                    stroke: new Stroke({ color: '#fff', width: 2 }),
                  }),
                }),
            },
          },
        },
      ],
    },
    view: {
      centerLonLat: [15, 45],
      zoom: 3,
    },
    osm: true,
  };

  onReady(ctx: MapContext): void {
    this.citiesLayer = ctx.layers['cities'] as VectorLayerApi<City, Geometry>;
    this.citiesLayer?.setModels(CITIES);
    this.ripple = new RippleEffect(ctx.map);
  }

  ngOnDestroy(): void {
    this.ripple?.dispose();
  }

  onCityClick(city: City): void {
    this.selectedId = city.id;

    this.citiesLayer?.centerOnModel(city.id, {keepZoom: true});

    this.ripple?.trigger([city.lng, city.lat]);
  }
}
