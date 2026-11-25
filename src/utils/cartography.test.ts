import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeodesicPoints,
  computeSectionNavProgress,
  formatCoordinateDMS,
  generateDossierCode,
  isPointVisibleOnHemisphere,
  validateRegistration,
} from './cartography';

test('formatCoordinateDMS formats positive and negative coordinates cleanly', () => {
  const ny = formatCoordinateDMS(-73.968, 40.749);
  assert.equal(ny.latStr, '40°44′N');
  assert.equal(ny.lonStr, '73°58′W');
  assert.equal(ny.combined, '40°44′N · 73°58′W');

  const nairobi = formatCoordinateDMS(36.818, -1.234);
  assert.equal(nairobi.latStr, '01°14′S');
  assert.equal(nairobi.lonStr, '36°49′E');
});

test('buildGeodesicPoints generates inclusive great-circle waypoints', () => {
  const arc = buildGeodesicPoints([-73.968, 40.749], [6.14, 46.227], 10);
  assert.equal(arc.length, 11);
  assert.ok(Math.abs(arc[0][0] - -73.968) < 0.001);
  assert.ok(Math.abs(arc[10][0] - 6.14) < 0.001);
});

test('isPointVisibleOnHemisphere distinguishes front vs back hemisphere', () => {
  // Centering globe on London/Geneva (rotation [-10, -25, 0] -> center lon 10E, lat 25N)
  assert.equal(isPointVisibleOnHemisphere([6.14, 46.227], [-10, -25, 0]), true);
  // Antipode in South Pacific (~170W, 25S) should be hidden
  assert.equal(isPointVisibleOnHemisphere([-170, -25], [-10, -25, 0]), false);
});

test('computeSectionNavProgress returns normalized 0..1 progress across ordered sections', () => {
  const sections = ['hero', 'about', 'experience', 'committees', 'registration'] as const;
  assert.equal(computeSectionNavProgress('hero', [...sections]), 0);
  assert.equal(computeSectionNavProgress('experience', [...sections]), 0.5);
  assert.equal(computeSectionNavProgress('registration', [...sections]), 1);
});

test('validateRegistration enforces required fields and delegation bounds', () => {
  const invalid = validateRegistration({
    track: 'delegation',
    fullName: '',
    email: 'not-an-email',
    institution: '',
    countryOrCity: 'G',
    preferredCommitteeId: '',
    delegationSize: 1,
    experienceLevel: 'First Session',
    motivationNote: '',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.email);
  assert.ok(invalid.errors.institution);
  assert.ok(invalid.errors.countryOrCity);
  assert.ok(invalid.errors.preferredCommitteeId);
  assert.ok(invalid.errors.delegationSize);

  const valid = validateRegistration({
    track: 'individual',
    fullName: 'Amira Al-Mansoor',
    email: 'amira@oxford.edu',
    institution: 'University of Oxford',
    countryOrCity: 'Oxford, United Kingdom',
    preferredCommitteeId: 'unsc',
    delegationSize: 1,
    experienceLevel: 'Experienced Delegate',
    motivationNote: 'Focused on maritime security.',
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('generateDossierCode creates deterministic formatted reference code', () => {
  const code = generateDossierCode('Amira Al-Mansoor', 'unsc');
  assert.match(code, /^LIS-I-UNSC-AMI-\d{4}$/);
});
