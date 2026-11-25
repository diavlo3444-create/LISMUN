import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateIntroFramePose,
  INTRO_ASSEMBLY_END_SEC,
  INTRO_SHOWCASE_HANDOFF_SEC,
  INTRO_TOTAL_DURATION_SEC,
} from './introChoreography';

test('evaluateIntroFramePose starts with only plinth emerging and upper pieces hidden', () => {
  const start = evaluateIntroFramePose(0.05);
  assert.equal(start.plinth.visible, true);
  assert.ok(start.plinth.y < 0);
  assert.equal(start.book.visible, false);
  assert.equal(start.laurels.visible, false);
  assert.equal(start.globe.visible, false);
  assert.equal(start.pillar.visible, false);
  assert.equal(start.shield.visible, false);
  assert.equal(start.activeStageRoman, 'I');
  assert.equal(start.isShowcaseReady, false);
  assert.equal(start.overlayOpacity, 1);
});

test('evaluateIntroFramePose stages pieces sequentially from base to keystone shield', () => {
  const midLaurels = evaluateIntroFramePose(0.95);
  assert.equal(midLaurels.plinth.visible, true);
  assert.equal(midLaurels.book.visible, true);
  assert.equal(midLaurels.laurels.visible, true);
  assert.equal(midLaurels.globe.visible, false);
  assert.ok(midLaurels.leftWreathOffsetX < 0);
  assert.ok(midLaurels.rightWreathOffsetX > 0);

  const midShield = evaluateIntroFramePose(2.0);
  assert.equal(midShield.globe.visible, true);
  assert.equal(midShield.pillar.visible, true);
  assert.equal(midShield.shield.visible, true);
  assert.equal(midShield.activeStageRoman, 'VI');
  assert.equal(midShield.isShowcaseReady, false);
  assert.ok(midShield.shield.z > 0.77);
});

test('evaluateIntroFramePose converges exactly to Hero monument resting pose and fades cleanly', () => {
  const assembled = evaluateIntroFramePose(INTRO_ASSEMBLY_END_SEC + 0.05);
  assert.equal(assembled.assemblyProgress, 1);
  assert.equal(assembled.plinth.y, 0);
  assert.equal(assembled.book.y, 0.84);
  assert.equal(assembled.bookWingAngle, 0.22);
  assert.equal(assembled.leftWreathOffsetX, 0);
  assert.equal(assembled.rightWreathOffsetX, 0);
  assert.equal(assembled.globe.y, 2.08);
  assert.equal(assembled.pillar.y, 0.89);
  assert.equal(assembled.shield.y, 2.38);
  assert.equal(assembled.shield.z, 0.77);
  assert.deepEqual(assembled.cameraPos, [0.55, 2.32, 6.45]);
  assert.equal(assembled.overlayOpacity, 1);
  assert.equal(assembled.isComplete, false);

  const ready = evaluateIntroFramePose(INTRO_SHOWCASE_HANDOFF_SEC);
  assert.equal(ready.isShowcaseReady, true);

  const finished = evaluateIntroFramePose(INTRO_TOTAL_DURATION_SEC);
  assert.equal(finished.overlayOpacity, 0);
  assert.equal(finished.isComplete, true);
});
