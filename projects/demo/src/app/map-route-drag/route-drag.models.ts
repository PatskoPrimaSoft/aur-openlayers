export interface RouteWaypoint {
  id: string;
  lat: number;
  lng: number;
  orderIndex: number;
  type: 'primary' | 'intermediate';
}

export interface RouteLine {
  id: string;
  coordinates: [number, number][];
}

export const LAYER_ID = {
  ROUTE_LINE: 'route-line',
  PRIMARY_POINTS: 'primary-points',
  INTERMEDIATE_POINTS: 'intermediate-points',
} as const;
