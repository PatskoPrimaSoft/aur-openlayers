import type Geometry from 'ol/geom/Geometry';
import { LineString, Point } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import CircleStyle from 'ol/style/Circle';
import Fill from 'ol/style/Fill';
import RegularShape from 'ol/style/RegularShape';
import Stroke from 'ol/style/Stroke';
import Style from 'ol/style/Style';
import Text from 'ol/style/Text';
import type { VectorLayerDescriptor } from '../../../../lib/src/lib/map-framework';
import type { MapHostConfig } from '../shared/map-host/map-host.component';
import { RouteWaypoint, RouteLine, RouteArrow, LAYER_ID } from './route-drag.models';

type LineStyleOpts = { color: string; width: number };

type PointStyleOpts = {
  color: string;
  radius: number;
  strokeColor: string;
  label: string;
};

function renderPoint(opts: PointStyleOpts): Style[] {
  return [new Style({
    image: new CircleStyle({
      radius: opts.radius,
      fill: new Fill({ color: opts.color }),
      stroke: new Stroke({ color: opts.strokeColor, width: 2 }),
    }),
    text: opts.label ? new Text({
      text: opts.label,
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: 'rgba(15, 23, 42, 0.45)', width: 2 }),
      font: opts.radius >= 12 ? '700 12px "Inter", sans-serif' : '600 9px "Inter", sans-serif',
      textAlign: 'center',
      textBaseline: 'middle',
    }) : undefined,
  })];
}

export interface SchemaCallbacks {
  getPhase(): 'placing' | 'routed';
  getIntermediateLabel(id: string): string;
  onClickMap(lon: number, lat: number, coord3857: number[]): void;
  onClickMapIntermediate(lon: number, lat: number, coord3857: number[]): void;
  onTranslateEnd(): void;
}

export function buildMapConfig(
  cb: SchemaCallbacks,
): MapHostConfig<readonly VectorLayerDescriptor<any, Geometry, any>[]> {
  return {
    schema: {
      layers: [
        {
          id: LAYER_ID.ROUTE_LINE,
          zIndex: 1,
          feature: {
            id: (m: RouteLine) => m.id,
            geometry: {
              fromModel: (m: RouteLine) =>
                new LineString(m.coordinates.map(([lng, lat]) => fromLonLat([lng, lat]))),
              applyGeometryToModel: (prev: RouteLine) => prev,
            },
            style: {
              base: (): LineStyleOpts => ({ color: '#2563eb', width: 4 }),
              render: (opts: LineStyleOpts) =>
                new Style({ stroke: new Stroke({ color: opts.color, width: opts.width }) }),
            },
          },
        },
        {
          id: LAYER_ID.ROUTE_ARROWS,
          zIndex: 2,
          feature: {
            id: (m: RouteArrow) => m.id,
            geometry: {
              fromModel: (m: RouteArrow) => new Point(fromLonLat([m.lng, m.lat])),
              applyGeometryToModel: (prev: RouteArrow) => prev,
            },
            style: {
              base: (m: RouteArrow) => ({ rotation: m.rotation }),
              render: (opts: { rotation: number }) => new Style({
                image: new RegularShape({
                  points: 3, radius: 6, rotation: opts.rotation,
                  fill: new Fill({ color: '#2563eb' }),
                  stroke: new Stroke({ color: '#ffffff', width: 1 }),
                }),
              }),
            },
          },
        },
        {
          id: LAYER_ID.INTERMEDIATE_POINTS,
          zIndex: 3,
          feature: {
            id: (m: RouteWaypoint) => m.id,
            geometry: {
              fromModel: (m: RouteWaypoint) => new Point(fromLonLat([m.lng, m.lat])),
              applyGeometryToModel: (prev: RouteWaypoint, geom: Geometry): RouteWaypoint => {
                if (!(geom instanceof Point)) return prev;
                const [lng, lat] = toLonLat(geom.getCoordinates());
                return { ...prev, lng, lat };
              },
            },
            style: {
              base: (m: RouteWaypoint): PointStyleOpts => ({
                color: '#10b981', radius: 10, strokeColor: '#ffffff',
                label: cb.getIntermediateLabel(m.id),
              }),
              states: {
                DRAG: (): Partial<PointStyleOpts> => ({ color: '#f97316', radius: 11 }),
                HOVER: (): Partial<PointStyleOpts> => ({ strokeColor: '#f97316' }),
              },
              render: renderPoint,
            },
            interactions: {
              hover: { cursor: 'pointer', state: 'HOVER' },
              click: {
                enabled: () => cb.getPhase() === 'routed',
                onClick: ({ items, event }) => {
                  if (items.length === 0) {
                    const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                    cb.onClickMapIntermediate(lng, lat, event.coordinate as number[]);
                  }
                  return true;
                },
              },
              translate: {
                cursor: 'grab', hitTolerance: 6, state: 'DRAG',
                onEnd: () => { cb.onTranslateEnd(); return true; },
              },
            },
          },
        },
        {
          id: LAYER_ID.PRIMARY_POINTS,
          zIndex: 4,
          feature: {
            id: (m: RouteWaypoint) => m.id,
            geometry: {
              fromModel: (m: RouteWaypoint) => new Point(fromLonLat([m.lng, m.lat])),
              applyGeometryToModel: (prev: RouteWaypoint, geom: Geometry): RouteWaypoint => {
                if (!(geom instanceof Point)) return prev;
                const [lng, lat] = toLonLat(geom.getCoordinates());
                return { ...prev, lng, lat };
              },
            },
            style: {
              base: (m: RouteWaypoint): PointStyleOpts => ({
                color: '#2563eb', radius: 14, strokeColor: '#ffffff',
                label: String(m.orderIndex),
              }),
              states: {
                DRAG: (): Partial<PointStyleOpts> => ({ color: '#1d4ed8', radius: 16 }),
                HOVER: (): Partial<PointStyleOpts> => ({ strokeColor: '#f97316' }),
              },
              render: renderPoint,
            },
            interactions: {
              hover: { cursor: 'pointer', state: 'HOVER' },
              click: {
                enabled: () => cb.getPhase() === 'placing',
                onClick: ({ items, event }) => {
                  if (items.length === 0) {
                    const [lng, lat] = toLonLat(event.coordinate) as [number, number];
                    cb.onClickMap(lng, lat, event.coordinate as number[]);
                  }
                  return true;
                },
              },
              translate: {
                cursor: 'grab', hitTolerance: 6, state: 'DRAG',
                onEnd: () => { cb.onTranslateEnd(); return true; },
              },
            },
          },
        },
      ],
    },
    view: { centerLonLat: [27.5619, 53.9023], zoom: 11 },
    osm: true,
  };
}
