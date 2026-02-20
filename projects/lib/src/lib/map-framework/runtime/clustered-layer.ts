import Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import {createEmpty} from 'ol/extent';
import type ClusterSource from 'ol/source/Cluster';
import type VectorSource from 'ol/source/Vector';

import { clearFeatureStates } from './style/feature-states';
import { createClusterStyleFunction } from './style/style-pipeline';
import {VectorLayerBase, VectorLayerBaseOptions} from './vector-layer-base';

export type ClusteredLayerOptions<M, G extends Geometry, OPTS extends object> =
  VectorLayerBaseOptions<M, G, OPTS> & {
    clusterSource: ClusterSource;
  };

export class ClusteredVectorLayer<M, G extends Geometry, OPTS extends object>
  extends VectorLayerBase<M, G, OPTS>
{
  private readonly clusterSource: ClusterSource;
  private clusteringEnabled: boolean;

  constructor(options: ClusteredLayerOptions<M, G, OPTS>) {
    super(options);
    this.clusterSource = options.clusterSource;
    this.clusteringEnabled = options.descriptor.clustering?.enabledByDefault ?? false;

    this.layer.setStyle(
      createClusterStyleFunction({
        descriptor: this.descriptor,
        clustering: options.descriptor.clustering!,
        ctx: this.ctx,
        registryGetModel: (feature) => this.registry.getModelByFeature(feature as Feature<G>),
        map: this.ctx.map,
      }),
    );

    this.layer.setSource(
      this.clusteringEnabled ? (this.clusterSource as unknown as VectorSource<G>) : this.source,
    );
  }

  override setModels(models: readonly M[]): void {
    super.setModels(models);
    this.scheduleInvalidate();
  }

  setClusteringEnabled(enabled: boolean): void {
    if (this.clusteringEnabled === enabled) {
      return;
    }
    this.clusteringEnabled = enabled;
    this.clearInteractionStates();
    this.layer.setSource(
      enabled ? (this.clusterSource as unknown as VectorSource<G>) : this.source,
    );
    if (enabled) {
      const view = this.ctx.map.getView();
      const resolution = view.getResolution() ?? 1;
      this.clusterSource.loadFeatures(createEmpty(), resolution, view.getProjection());
      this.clusterSource.refresh();
    }
    this.scheduleInvalidate();
  }

  isClusteringEnabled(): boolean {
    return this.clusteringEnabled;
  }

  private clearInteractionStates(): void {
    this.registry.forEachId((id) => {
      const feature = this.registry.getFeature(id);
      if (feature) {
        clearFeatureStates(feature);
      }
    });
  }

  protected override getCenterOnAllModelsSource(): VectorSource<G> | null {
    return this.layer.getSource() as unknown as VectorSource<G> | null;
  }
}
