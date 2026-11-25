import { geoInterpolate } from 'd3-geo';
import type {
  AtlasSectionId,
  RegistrationPayload,
  RegistrationValidationResult,
} from '../types/atlas';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatCoordinateDMS(
  lon: number,
  lat: number
): { latStr: string; lonStr: string; combined: string } {
  const formatAxis = (val: number, pos: string, neg: string): string => {
    const hemi = val >= 0 ? pos : neg;
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    return `${String(deg).padStart(2, '0')}°${String(min).padStart(2, '0')}′${hemi}`;
  };

  const latStr = formatAxis(lat, 'N', 'S');
  const lonStr = formatAxis(lon, 'E', 'W');
  return {
    latStr,
    lonStr,
    combined: `${latStr} · ${lonStr}`,
  };
}

export function buildGeodesicPoints(
  from: [number, number],
  to: [number, number],
  steps = 28
): [number, number][] {
  const safeSteps = Math.max(2, Math.floor(steps));
  const interpolate = geoInterpolate(from, to);
  const points: [number, number][] = [];
  for (let i = 0; i <= safeSteps; i += 1) {
    points.push(interpolate(i / safeSteps));
  }
  return points;
}

export function isPointVisibleOnHemisphere(
  point: [number, number],
  rotation: [number, number, number]
): boolean {
  const [lon, lat] = point;
  const centerLon = -rotation[0];
  const centerLat = -rotation[1];
  const toRad = Math.PI / 180;
  const dLon = (lon - centerLon) * toRad;
  const lat1 = centerLat * toRad;
  const lat2 = lat * toRad;
  const cosAngle =
    Math.sin(lat1) * Math.sin(lat2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return cosAngle > 0.04;
}

export function computeSectionNavProgress(
  activeSection: AtlasSectionId,
  orderedIds: AtlasSectionId[]
): number {
  const idx = orderedIds.indexOf(activeSection);
  if (idx <= 0) return 0;
  if (orderedIds.length <= 1) return 1;
  return clamp(idx / (orderedIds.length - 1), 0, 1);
}

export function validateRegistration(
  payload: RegistrationPayload
): RegistrationValidationResult {
  const errors: Partial<Record<keyof RegistrationPayload, string>> = {};

  if (!payload.fullName || payload.fullName.trim().length < 2) {
    errors.fullName = 'Please enter the delegate or advisor full name.';
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!payload.email || !emailPattern.test(payload.email.trim())) {
    errors.email = 'Please provide a valid institutional or personal email address.';
  }

  if (!payload.institution || payload.institution.trim().length < 2) {
    errors.institution = 'Please enter your school, university, or institution.';
  }

  if (!payload.countryOrCity || payload.countryOrCity.trim().length < 2) {
    errors.countryOrCity = 'Please specify your city and country.';
  }

  if (!payload.preferredCommitteeId) {
    errors.preferredCommitteeId = 'Please select a preferred council seat.';
  }

  if (payload.track === 'delegation') {
    if (!Number.isFinite(payload.delegationSize) || payload.delegationSize < 2 || payload.delegationSize > 60) {
      errors.delegationSize = 'Delegation size must be between 2 and 60 delegates.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function generateDossierCode(fullName: string, committeeId: string): string {
  const cleanName = fullName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const cleanCommittee = committeeId.trim().toUpperCase().slice(0, 4).padEnd(3, 'M');
  const hashSeed = Array.from(fullName + committeeId).reduce(
    (acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 10000,
    417
  );
  return `LIS-I-${cleanCommittee}-${cleanName}-${String(hashSeed).padStart(4, '0')}`;
}
