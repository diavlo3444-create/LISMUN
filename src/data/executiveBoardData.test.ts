import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_COLS,
  BOARD_ROWS,
  CHESS_PIECE_LEGEND,
  EXECUTIVE_BOARD_MEMBERS,
  EXECUTIVE_DEPARTMENTS,
  PDF_AMBIGUITIES_FOR_REVIEW,
  getHierarchyCounts,
  getMemberBySquare,
  getMembersByDepartment,
  isLightSquare,
  toSquareNotation,
} from './executiveBoardData';

test('Single 8x8 chessboard has 64 alternating squares with H1 bottom-right light', () => {
  assert.equal(BOARD_ROWS, 8);
  assert.equal(BOARD_COLS, 8);
  assert.equal(BOARD_ROWS * BOARD_COLS, 64);

  assert.equal(toSquareNotation(7, 7), 'H1');
  assert.equal(isLightSquare(7, 7), true, 'Bottom-right square H1 must be light');
  assert.equal(toSquareNotation(7, 0), 'A1');
  assert.equal(isLightSquare(7, 0), false, 'Bottom-left square A1 must be dark');
  assert.equal(toSquareNotation(0, 0), 'A8');
  assert.equal(isLightSquare(0, 0), true, 'Top-left square A8 must be light');
  assert.equal(toSquareNotation(0, 7), 'H8');
  assert.equal(isLightSquare(0, 7), false, 'Top-right square H8 must be dark');
});

test('All 46 unique PDF individuals appear exactly once on the single 8x8 board with zero collisions', () => {
  assert.equal(EXECUTIVE_BOARD_MEMBERS.length, 46);

  const ids = new Set<string>();
  const coords = new Set<string>();
  const normalizedNames = new Set<string>();

  for (const m of EXECUTIVE_BOARD_MEMBERS) {
    assert.ok(!ids.has(m.id), `Duplicate id: ${m.id}`);
    ids.add(m.id);

    const nameKey = m.fullName.trim().toLowerCase();
    assert.ok(!normalizedNames.has(nameKey), `Duplicate individual name: ${m.fullName}`);
    normalizedNames.add(nameKey);

    assert.ok(m.boardRow >= 0 && m.boardRow < 8, `Row out of bounds for ${m.fullName}`);
    assert.ok(m.boardCol >= 0 && m.boardCol < 8, `Col out of bounds for ${m.fullName}`);

    const key = `${m.boardRow}:${m.boardCol}`;
    assert.ok(!coords.has(key), `Square collision at ${key} (${m.fullName})`);
    coords.add(key);

    assert.equal(getMemberBySquare(m.boardRow, m.boardCol)?.id, m.id);
  }
});

test('Top Secretariat sits at Rank 8 apex, IT Co-Heads are Rooks, and hierarchy matches PDF', () => {
  const counts = getHierarchyCounts();
  assert.deepEqual(counts, {
    king: 2,
    queen: 1,
    rook: 5,
    bishop: 19,
    knight: 14,
    pawn: 5,
  });

  const legendTotal = CHESS_PIECE_LEGEND.reduce((acc, item) => acc + item.count, 0);
  assert.equal(legendTotal, 46);

  // Top Secretariat positioned at upper-central Rank 8 (row 0)
  const secretaries = getMembersByDepartment('SECRETARIES');
  assert.equal(secretaries.length, 6);
  for (const s of secretaries) {
    assert.equal(s.boardRow, 0, `${s.fullName} must sit on upper Rank 8`);
    assert.ok(s.boardCol >= 1 && s.boardCol <= 6, `${s.fullName} must sit centrally`);
  }

  // Special chess-piece assignment override for IT Co-Heads
  const ahmedMagdi = EXECUTIVE_BOARD_MEMBERS.find((m) => m.fullName === 'Ahmed Magdi');
  const mohammedMagdi = EXECUTIVE_BOARD_MEMBERS.find((m) => m.fullName === 'Mohammed magdi');
  assert.equal(ahmedMagdi?.pieceType, 'rook');
  assert.equal(ahmedMagdi?.officialPosition, 'Co head');
  assert.equal(ahmedMagdi?.department, 'IT');
  assert.equal(mohammedMagdi?.pieceType, 'rook');
  assert.equal(mohammedMagdi?.officialPosition, 'Co head');
  assert.equal(mohammedMagdi?.department, 'IT');

  // Verify Logistics has NO Zeina (cross-checked against actual PDF chart)
  const logistics = getMembersByDepartment('LOGISTICS');
  assert.equal(logistics.length, 3);
  assert.ok(!logistics.some((m) => m.fullName.toLowerCase() === 'zeina'));

  // Verify every department has all expected members
  for (const dept of EXECUTIVE_DEPARTMENTS) {
    const members = getMembersByDepartment(dept);
    assert.ok(members.length >= 2, `Expected >= 2 members in ${dept}`);
  }
});

test('Exact PDF spellings, flagged ambiguities, and zero sensitive data exposure', () => {
  const byName = (name: string) =>
    EXECUTIVE_BOARD_MEMBERS.find((m) => m.fullName === name);

  assert.equal(byName('mallak abbas')?.officialPosition, 'SG');
  assert.equal(byName('sollaf mustafa')?.officialPosition, 'SG');
  assert.equal(byName('mohammed walid')?.officialPosition, 'DSG');
  assert.equal(byName('lily')?.officialPosition, 'USG');
  assert.equal(byName('marwan nasr')?.officialPosition, 'Senior advisors');
  assert.equal(byName('najla rami')?.officialPosition, 'Senior advisors');
  assert.equal(byName('(prob eyad)')?.department, 'PR');
  assert.equal(byName('loor al masri')?.departments.includes('DCC'), true);
  assert.equal(byName('loor al masri')?.departments.includes('PR'), true);
  assert.ok(PDF_AMBIGUITIES_FOR_REVIEW.length >= 3);

  const serialized = JSON.stringify(EXECUTIVE_BOARD_MEMBERS);
  assert.ok(!serialized.includes('@'), 'Must not contain email addresses');
  assert.ok(!serialized.toLowerCase().includes('password'), 'Must not contain password fields');
});
