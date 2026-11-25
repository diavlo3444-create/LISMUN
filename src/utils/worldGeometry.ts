import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import worldTopology from 'world-atlas/countries-110m.json';

let cachedLand: FeatureCollection<Geometry> | null = null;
let cachedCountries: FeatureCollection<Geometry> | null = null;

function toFeatureCollection(
  geo: Feature<Geometry> | FeatureCollection<Geometry>
): FeatureCollection<Geometry> {
  if (geo.type === 'FeatureCollection') {
    return geo;
  }
  return { type: 'FeatureCollection', features: [geo] };
}

export function getWorldLandFeature(): FeatureCollection<Geometry> {
  if (cachedLand) return cachedLand;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = feature(worldTopology as any, (worldTopology as any).objects.land) as unknown as
    | Feature<Geometry>
    | FeatureCollection<Geometry>;
  const collection = toFeatureCollection(raw);
  cachedLand = collection;
  return collection;
}

export function getWorldCountriesFeatures(): FeatureCollection<Geometry> {
  if (cachedCountries) return cachedCountries;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = feature(worldTopology as any, (worldTopology as any).objects.countries) as unknown as
    | Feature<Geometry>
    | FeatureCollection<Geometry>;
  const collection = toFeatureCollection(raw);
  cachedCountries = collection;
  return collection;
}
