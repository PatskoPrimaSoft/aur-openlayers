import type OlMap from 'ol/Map';
import type { EventsKey } from 'ol/events';
import { unByKey } from 'ol/Observable';
import { fromLonLat } from 'ol/proj';

export interface RippleOptions {
  color?: [number, number, number];
  maxRadius?: number;
  duration?: number;
  stagger?: number;
  ringCount?: number;
  strokeWidth?: number;
}

const DEFAULTS: Required<RippleOptions> = {
  color: [219, 39, 119],
  maxRadius: 80,
  duration: 2500,
  stagger: 300,
  ringCount: 3,
  strokeWidth: 2,
};

export class RippleEffect {
  private readonly opts: Required<RippleOptions>;
  private ripple: { coord: [number, number]; start: number } | null = null;
  private animationId?: number;
  private postRenderKey?: EventsKey;

  constructor(private readonly map: OlMap, options?: RippleOptions) {
    this.opts = { ...DEFAULTS, ...options };
    this.postRenderKey = map.on('postrender', () => this.draw());
  }

  trigger(lonLat: [number, number]): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.ripple = {
      coord: fromLonLat(lonLat) as [number, number],
      start: performance.now(),
    };

    const animate = () => {
      const elapsed = performance.now() - this.ripple!.start;
      if (elapsed >= this.opts.duration) {
        this.ripple = null;
        this.animationId = undefined;
        this.map.render();
        return;
      }
      this.map.render();
      this.animationId = requestAnimationFrame(animate);
    };
    this.animationId = requestAnimationFrame(animate);
  }

  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.postRenderKey) {
      unByKey(this.postRenderKey);
    }
    this.ripple = null;
  }

  private draw(): void {
    if (!this.ripple) return;

    const canvas = this.map.getViewport().querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const elapsed = performance.now() - this.ripple.start;
    const pixel = this.map.getPixelFromCoordinate(this.ripple.coord);
    if (!pixel) return;

    const { color, maxRadius, duration, stagger, ringCount, strokeWidth } = this.opts;

    for (let i = 0; i < ringCount; i++) {
      const delay = i * stagger;
      const ringElapsed = elapsed - delay;
      if (ringElapsed < 0) continue;

      const t = Math.min(1, ringElapsed / (duration - delay));
      const radius = t * maxRadius;
      const opacity = 1 - t;
      if (opacity <= 0) continue;

      ctx.beginPath();
      ctx.arc(pixel[0], pixel[1], radius, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgba(${color.join(',')},${opacity.toFixed(2)})`;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  }
}
