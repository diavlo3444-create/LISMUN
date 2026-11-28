import * as THREE from 'three';
import {
  BOARD_COLS,
  BOARD_ROWS,
  DEPARTMENT_ZONES,
  FILE_LETTERS,
  isLightSquare,
  type ChessPieceType,
  type ChessSide,
  type ExecutiveBoardMember,
} from '../../data/executiveBoardData';

export const SQUARE_SIZE = 1.0;
export const BOARD_SIZE = BOARD_COLS * SQUARE_SIZE; // 8.0 x 8.0 exact single 8x8 grid
export const BOARD_BASE_Y = 0.0;

export function getSquareSurfaceY(): number {
  return BOARD_BASE_Y;
}

export function getSquareWorldXZ(
  row: number,
  col: number
): { x: number; z: number } {
  const x = (col - (BOARD_COLS - 1) / 2) * SQUARE_SIZE;
  const z = (row - (BOARD_ROWS - 1) / 2) * SQUARE_SIZE;
  return { x, z };
}

function createMicroGrainCanvasTexture(
  kind: 'stone' | 'metal'
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);

    if (kind === 'metal') {
      for (let y = 0; y < size; y++) {
        const delta = Math.round(
          Math.sin(y * 0.45) * 10 + ((y * 37) % 19) - 9
        );
        const v = Math.max(96, Math.min(168, 128 + delta));
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(0, y, size, 1);
      }
    } else {
      for (let i = 0; i < 650; i++) {
        const x = (i * 73) % size;
        const y = (i * 139) % size;
        const r = 1 + (i % 3);
        const v = 116 + ((i * 29) % 28);
        ctx.fillStyle = `rgba(${v},${v},${v},0.22)`;
        ctx.fillRect(x, y, r * 2, r);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.1,
      size / 2,
      size / 2,
      size * 0.5
    );
    grad.addColorStop(0, 'rgba(2, 5, 12, 0.72)');
    grad.addColorStop(0.55, 'rgba(2, 5, 12, 0.34)');
    grad.addColorStop(1, 'rgba(2, 5, 12, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

function createCoordinateStripTexture(
  labels: readonly string[],
  horizontal: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const w = horizontal ? 1024 : 128;
  const h = horizontal ? 96 : 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#071324';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#D5BD8B';
    ctx.font = '600 34px Georgia, "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const count = labels.length;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      if (horizontal) {
        ctx.fillText(labels[i], t * w, h * 0.52);
      } else {
        ctx.fillText(labels[i], w * 0.5, t * h);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBoardPlaqueTexture(
  title: string,
  maxAnisotropy: number,
  accentColor = '#D5BD8B'
): THREE.CanvasTexture {
  const w = 1024;
  const h = 112;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#071324';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(213, 189, 139, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 14, w - 36, h - 28);

    ctx.fillStyle = accentColor;
    ctx.font = '600 28px Georgia, "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title.toUpperCase(), w / 2, h / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSideTierStripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 128;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#061120';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#83B5ED';
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const labels = [
      { rowCenter: 0.5, text: 'APEX' },
      { rowCenter: 2.0, text: 'TIER I' },
      { rowCenter: 4.0, text: 'TIER II' },
      { rowCenter: 7.0, text: 'TIER III' },
    ];
    for (const item of labels) {
      const y = (item.rowCenter / 8) * h;
      ctx.fillText(item.text, w / 2, y);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildLathe(
  points: Array<[number, number]>,
  segments = 28
): THREE.LatheGeometry {
  const vecs = points.map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(vecs, segments);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Recognizable Staunton Knight horse head profile extruded with generous bevels.
 * Nose/snout points toward +X in local space.
 */
function buildKnightHeadGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, 0.0);
  shape.lineTo(0.18, 0.0);
  // Chest curve up to jaw
  shape.bezierCurveTo(0.21, 0.16, 0.16, 0.34, 0.08, 0.48);
  // Lower jaw & extended snout
  shape.lineTo(0.30, 0.50);
  shape.quadraticCurveTo(0.36, 0.58, 0.30, 0.67);
  // Bridge of nose to brow
  shape.lineTo(0.13, 0.77);
  // Two crisp pointed ears
  shape.lineTo(0.10, 0.90);
  shape.lineTo(0.02, 0.81);
  shape.lineTo(-0.05, 0.90);
  shape.lineTo(-0.09, 0.77);
  // Proud arched horse mane sweeping down to neck base
  shape.bezierCurveTo(-0.27, 0.62, -0.30, 0.30, -0.18, 0.0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.048,
    bevelSize: 0.036,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geo.translate(0, 0, -0.07);
  geo.computeVertexNormals();
  return geo;
}

function buildKnightManeCrestGeometry(): THREE.ExtrudeGeometry {
  const mane = new THREE.Shape();
  mane.moveTo(-0.18, 0.04);
  mane.bezierCurveTo(-0.30, 0.30, -0.27, 0.62, -0.09, 0.77);
  mane.lineTo(-0.13, 0.79);
  mane.bezierCurveTo(-0.34, 0.63, -0.37, 0.29, -0.22, 0.02);
  mane.closePath();

  const geo = new THREE.ExtrudeGeometry(mane, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -0.025);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Recognizable Staunton Bishop slotted mitre head with unmistakable diagonal V-cleft.
 */
function buildBishopMitreGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Base of mitre above collar
  shape.moveTo(-0.125, 0.0);
  shape.lineTo(0.125, 0.0);
  // Right cheek curving up into cleft lower lip (+X side has signature Staunton cleft)
  shape.bezierCurveTo(0.185, 0.09, 0.175, 0.19, 0.13, 0.25);
  // Diagonal notch inward
  shape.lineTo(0.025, 0.205);
  shape.lineTo(0.095, 0.305);
  // Upper crown lobe meeting pointed apex
  shape.bezierCurveTo(0.065, 0.365, 0.035, 0.405, 0.0, 0.43);
  // Left smooth almond curve back down to base
  shape.bezierCurveTo(-0.09, 0.37, -0.185, 0.24, -0.175, 0.12);
  shape.bezierCurveTo(-0.17, 0.05, -0.145, 0.015, -0.125, 0.0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.048,
    bevelSize: 0.036,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geo.translate(0, 0, -0.075);
  geo.computeVertexNormals();
  return geo;
}

function buildKingCrossGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const arm = 0.042;
  const span = 0.135;
  const top = 0.245;
  s.moveTo(-arm, 0);
  s.lineTo(arm, 0);
  s.lineTo(arm, 0.095);
  s.lineTo(span, 0.095);
  s.lineTo(span, 0.165);
  s.lineTo(arm, 0.165);
  s.lineTo(arm, top);
  s.lineTo(-arm, top);
  s.lineTo(-arm, 0.165);
  s.lineTo(-span, 0.165);
  s.lineTo(-span, 0.095);
  s.lineTo(-arm, 0.095);
  s.closePath();

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.042,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.021);
  geo.computeVertexNormals();
  return geo;
}

export interface ChessPieceKit {
  buildMemberPiece: (member: ExecutiveBoardMember) => {
    group: THREE.Group;
    hitMesh: THREE.Mesh;
    haloRing: THREE.Mesh;
    pieceRoot: THREE.Group;
    baseY: number;
  };
  buildBoardStructure: () => {
    rootGroup: THREE.Group;
    departmentHighlights: Map<string, THREE.MeshBasicMaterial>;
  };
  dispose: () => void;
}

export function createChessPieceKit(
  maxAnisotropy = 4,
  isSoftwareGl = false
): ChessPieceKit {
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTex.push(t);
    return t;
  };

  // Procedural surface textures
  const brushedMap = trackTex(createMicroGrainCanvasTexture('metal'));
  const stoneMap = trackTex(createMicroGrainCanvasTexture('stone'));
  const contactShadowTex = trackTex(createContactShadowTexture());
  const filesTex = trackTex(
    createCoordinateStripTexture(FILE_LETTERS, true, maxAnisotropy)
  );
  const ranksTex = trackTex(
    createCoordinateStripTexture(
      ['8', '7', '6', '5', '4', '3', '2', '1'],
      false,
      maxAnisotropy
    )
  );

  // Piece Materials (high-contrast Light Champagne Gold vs Rich Lapis-Navy Lacquer)
  const goldPrimaryMat = trackMat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0xe3c991,
          metalness: 0.84,
          roughness: 0.26,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xe3c991,
          metalness: 0.84,
          roughness: 0.26,
          roughnessMap: brushedMap,
          clearcoat: 0.25,
          clearcoatRoughness: 0.18,
        })
  );
  const goldAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b7a3d,
      metalness: 0.85,
      roughness: 0.42,
    })
  );

  const navyPrimaryMat = trackMat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0x133362,
          metalness: 0.28,
          roughness: 0.24,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x133362,
          metalness: 0.28,
          roughness: 0.2,
          clearcoat: 0.92,
          clearcoatRoughness: 0.12,
          bumpMap: stoneMap,
          bumpScale: 0.004,
        })
  );
  const navyAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9c08a,
      metalness: 0.9,
      roughness: 0.26,
    })
  );

  const feltBaseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x061020,
      metalness: 0.04,
      roughness: 0.9,
    })
  );

  const crimsonJewelMat = trackMat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0x99202d,
          metalness: 0.25,
          roughness: 0.22,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x99202d,
          metalness: 0.25,
          roughness: 0.16,
          clearcoat: 0.88,
          clearcoatRoughness: 0.1,
        })
  );

  // Board Materials
  const darkSquareMat = trackMat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0x25201b,
          metalness: 0.02,
          roughness: 0.72,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x25201b,
          metalness: 0.02,
          roughness: 0.72,
          clearcoat: 0.08,
          clearcoatRoughness: 0.55,
          bumpMap: stoneMap,
          bumpScale: 0.002,
        })
  );
  const lightSquareMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe7dfca,
      metalness: 0.0,
      roughness: 0.78,
      roughnessMap: isSoftwareGl ? null : brushedMap,
    })
  );
  const frameWalnutNavyMat = trackMat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0x24170f,
          metalness: 0.0,
          roughness: 0.62,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x24170f,
          metalness: 0.0,
          roughness: 0.62,
          clearcoat: 0.16,
          clearcoatRoughness: 0.42,
        })
  );
  const frameBrassTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9af7a,
      metalness: 0.88,
      roughness: 0.26,
    })
  );
  const babyBlueRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x83b5ed,
      emissive: 0x4b87c9,
      emissiveIntensity: 0.85,
      metalness: 0.3,
      roughness: 0.25,
    })
  );
  const shadowDiscMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
  );
  const hitProxyMat = trackMat(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })
  );

  // Shared Component Geometries
  const shadowDiscGeo = trackGeo(new THREE.CircleGeometry(0.4, 24));
  shadowDiscGeo.rotateX(-Math.PI / 2);

  const haloRingGeo = trackGeo(new THREE.RingGeometry(0.34, 0.43, 32));
  haloRingGeo.rotateX(-Math.PI / 2);

  const hitCylinderGeo = trackGeo(
    new THREE.CylinderGeometry(0.4, 0.42, 1.5, 14)
  );
  const feltDiscGeo = trackGeo(
    new THREE.CylinderGeometry(0.33, 0.34, 0.032, 24)
  );
  const baseTrimRingGeo = trackGeo(new THREE.TorusGeometry(0.315, 0.015, 8, 28));
  baseTrimRingGeo.rotateX(Math.PI / 2);

  // ── 1. KING (Tallest: 1.62u with distinct Cross Finial & Crown) ──
  const kingBodyGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.33, 0.03],
      [0.34, 0.09],
      [0.28, 0.145],
      [0.30, 0.185],
      [0.22, 0.26],
      [0.17, 0.52],
      [0.14, 0.86],
      [0.16, 0.98],
      [0.245, 1.04],
      [0.175, 1.10],
      [0.225, 1.25],
      [0.165, 1.31],
      [0.08, 1.35],
      [0.0, 1.36],
    ])
  );
  const kingCrossGeo = trackGeo(buildKingCrossGeometry());
  const kingOrbGeo = trackGeo(new THREE.SphereGeometry(0.068, 18, 14));
  const kingCollarGeo = trackGeo(new THREE.TorusGeometry(0.225, 0.026, 12, 28));
  kingCollarGeo.rotateX(Math.PI / 2);
  const jewelGeo = trackGeo(new THREE.OctahedronGeometry(0.035, 0));

  // ── 2. QUEEN (1.40u with 8-Spiked Coronet Crown & Dome Finial) ──
  const queenBodyGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.32, 0.03],
      [0.33, 0.085],
      [0.27, 0.14],
      [0.29, 0.18],
      [0.21, 0.25],
      [0.155, 0.50],
      [0.13, 0.80],
      [0.15, 0.92],
      [0.215, 0.98],
      [0.15, 1.03],
      [0.23, 1.19],
      [0.165, 1.21],
      [0.065, 1.23],
      [0.0, 1.24],
    ])
  );
  const queenSpikeGeo = trackGeo(new THREE.ConeGeometry(0.034, 0.13, 6));
  const queenTipGeo = trackGeo(new THREE.SphereGeometry(0.032, 12, 10));
  const queenCrownOrbGeo = trackGeo(new THREE.SphereGeometry(0.066, 16, 14));
  const queenCollarGeo = trackGeo(new THREE.TorusGeometry(0.20, 0.024, 12, 28));
  queenCollarGeo.rotateX(Math.PI / 2);

  // ── 3. ROOK (0.98u Stocky Castle Tower with 6 Deep Crenelated Merlons) ──
  const rookBodyGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.315, 0.03],
      [0.325, 0.08],
      [0.275, 0.135],
      [0.29, 0.17],
      [0.225, 0.23],
      [0.205, 0.50],
      [0.19, 0.72],
      [0.245, 0.78],
      [0.255, 0.89],
      [0.185, 0.89],
      [0.185, 0.82],
      [0.0, 0.82],
    ])
  );
  const rookMerlonGeo = trackGeo(new THREE.BoxGeometry(0.105, 0.12, 0.08));
  const rookCollarGeo = trackGeo(new THREE.TorusGeometry(0.235, 0.022, 10, 26));
  rookCollarGeo.rotateX(Math.PI / 2);

  // ── 4. BISHOP (1.24u Slim Stem + Slotted Mitre Crown + Finial Orb) ──
  const bishopBaseGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.30, 0.03],
      [0.31, 0.08],
      [0.25, 0.13],
      [0.265, 0.165],
      [0.195, 0.23],
      [0.145, 0.48],
      [0.125, 0.71],
      [0.185, 0.76],
      [0.13, 0.80],
      [0.0, 0.80],
    ])
  );
  const bishopMitreGeo = trackGeo(buildBishopMitreGeometry());
  const bishopFinialGeo = trackGeo(new THREE.SphereGeometry(0.048, 14, 12));
  const bishopCollarGeo = trackGeo(new THREE.TorusGeometry(0.18, 0.022, 10, 26));
  bishopCollarGeo.rotateX(Math.PI / 2);

  // ── 5. KNIGHT (1.14u Bold Sculpted Horse Head facing across the board) ──
  const knightBaseGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.305, 0.03],
      [0.315, 0.08],
      [0.255, 0.13],
      [0.275, 0.17],
      [0.215, 0.23],
      [0.19, 0.30],
      [0.0, 0.30],
    ])
  );
  const knightHeadGeo = trackGeo(buildKnightHeadGeometry());
  const knightManeGeo = trackGeo(buildKnightManeCrestGeometry());
  const knightCollarGeo = trackGeo(new THREE.TorusGeometry(0.20, 0.022, 10, 26));
  knightCollarGeo.rotateX(Math.PI / 2);

  // ── 6. PAWN (0.72u Compact Tapered Body + Simple Spherical Head) ──
  const pawnBodyGeo = trackGeo(
    buildLathe([
      [0.0, 0.03],
      [0.26, 0.03],
      [0.27, 0.075],
      [0.215, 0.12],
      [0.23, 0.15],
      [0.16, 0.21],
      [0.12, 0.36],
      [0.095, 0.48],
      [0.15, 0.52],
      [0.09, 0.55],
      [0.0, 0.56],
    ])
  );
  const pawnOrbGeo = trackGeo(new THREE.SphereGeometry(0.155, 20, 16));
  const pawnCollarGeo = trackGeo(new THREE.TorusGeometry(0.145, 0.018, 10, 24));
  pawnCollarGeo.rotateX(Math.PI / 2);

  function assembleSilhouette(
    pieceType: ChessPieceType,
    side: ChessSide
  ): THREE.Group {
    const pieceGroup = new THREE.Group();
    const primaryMat = side === 'gold' ? goldPrimaryMat : navyPrimaryMat;
    const accentMat = side === 'gold' ? goldAccentMat : navyAccentMat;

    const felt = new THREE.Mesh(feltDiscGeo, feltBaseMat);
    felt.position.y = 0.016;
    felt.castShadow = true;
    felt.receiveShadow = true;
    pieceGroup.add(felt);

    if (side === 'navy') {
      const baseRim = new THREE.Mesh(baseTrimRingGeo, accentMat);
      baseRim.position.y = 0.034;
      pieceGroup.add(baseRim);
    }

    if (pieceType === 'king') {
      const body = new THREE.Mesh(kingBodyGeo, primaryMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pieceGroup.add(body);

      const collar = new THREE.Mesh(kingCollarGeo, accentMat);
      collar.position.y = 1.04;
      pieceGroup.add(collar);

      const orb = new THREE.Mesh(kingOrbGeo, accentMat);
      orb.position.y = 1.38;
      orb.castShadow = true;
      pieceGroup.add(orb);

      const cross = new THREE.Mesh(kingCrossGeo, accentMat);
      cross.position.y = 1.42;
      cross.castShadow = true;
      pieceGroup.add(cross);

      const jewel = new THREE.Mesh(jewelGeo, crimsonJewelMat);
      jewel.position.set(0, 1.04, 0.23);
      pieceGroup.add(jewel);
    } else if (pieceType === 'queen') {
      const body = new THREE.Mesh(queenBodyGeo, primaryMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pieceGroup.add(body);

      const collar = new THREE.Mesh(queenCollarGeo, accentMat);
      collar.position.y = 0.98;
      pieceGroup.add(collar);

      const orb = new THREE.Mesh(queenCrownOrbGeo, accentMat);
      orb.position.y = 1.29;
      orb.castShadow = true;
      pieceGroup.add(orb);

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rx = Math.cos(a) * 0.21;
        const rz = Math.sin(a) * 0.21;

        const spike = new THREE.Mesh(queenSpikeGeo, accentMat);
        spike.position.set(rx, 1.23, rz);
        pieceGroup.add(spike);

        const tip = new THREE.Mesh(queenTipGeo, accentMat);
        tip.position.set(rx, 1.30, rz);
        pieceGroup.add(tip);
      }

      const jewel = new THREE.Mesh(jewelGeo, crimsonJewelMat);
      jewel.position.set(0, 0.98, 0.21);
      pieceGroup.add(jewel);
    } else if (pieceType === 'rook') {
      const body = new THREE.Mesh(rookBodyGeo, primaryMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pieceGroup.add(body);

      const collar = new THREE.Mesh(rookCollarGeo, accentMat);
      collar.position.y = 0.78;
      pieceGroup.add(collar);

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const merlon = new THREE.Mesh(rookMerlonGeo, accentMat);
        merlon.position.set(Math.cos(a) * 0.205, 0.94, Math.sin(a) * 0.205);
        merlon.rotation.y = -a;
        merlon.castShadow = true;
        pieceGroup.add(merlon);
      }
    } else if (pieceType === 'bishop') {
      const base = new THREE.Mesh(bishopBaseGeo, primaryMat);
      base.castShadow = true;
      base.receiveShadow = true;
      pieceGroup.add(base);

      const collar = new THREE.Mesh(bishopCollarGeo, accentMat);
      collar.position.y = 0.76;
      pieceGroup.add(collar);

      const mitre = new THREE.Mesh(bishopMitreGeo, primaryMat);
      mitre.position.y = 0.79;
      // Angle cleft cleanly toward front-right 3/4 view so diagonal notch reads clearly
      mitre.rotation.y = -Math.PI * 0.28;
      mitre.castShadow = true;
      mitre.receiveShadow = true;
      pieceGroup.add(mitre);

      const finial = new THREE.Mesh(bishopFinialGeo, accentMat);
      finial.position.y = 1.25;
      finial.castShadow = true;
      pieceGroup.add(finial);
    } else if (pieceType === 'knight') {
      const base = new THREE.Mesh(knightBaseGeo, primaryMat);
      base.castShadow = true;
      base.receiveShadow = true;
      pieceGroup.add(base);

      const collar = new THREE.Mesh(knightCollarGeo, accentMat);
      collar.position.y = 0.30;
      pieceGroup.add(collar);

      const headYaw =
        side === 'gold' ? Math.PI / 2 - 0.18 : -Math.PI / 2 + 0.18;
      const head = new THREE.Mesh(knightHeadGeo, primaryMat);
      head.position.y = 0.295;
      head.rotation.y = headYaw;
      head.castShadow = true;
      head.receiveShadow = true;
      pieceGroup.add(head);

      const mane = new THREE.Mesh(knightManeGeo, accentMat);
      mane.position.y = 0.295;
      mane.rotation.y = headYaw;
      pieceGroup.add(mane);
    } else {
      const body = new THREE.Mesh(pawnBodyGeo, primaryMat);
      body.castShadow = true;
      body.receiveShadow = true;
      pieceGroup.add(body);

      const collar = new THREE.Mesh(pawnCollarGeo, accentMat);
      collar.position.y = 0.52;
      pieceGroup.add(collar);

      const orb = new THREE.Mesh(pawnOrbGeo, primaryMat);
      orb.position.y = 0.675;
      orb.castShadow = true;
      orb.receiveShadow = true;
      pieceGroup.add(orb);
    }

    return pieceGroup;
  }

  function buildMemberPiece(member: ExecutiveBoardMember) {
    const group = new THREE.Group();
    const { x, z } = getSquareWorldXZ(member.boardRow, member.boardCol);
    const baseY = getSquareSurfaceY();
    group.position.set(x, baseY, z);

    const shadow = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    shadow.position.y = 0.005;
    group.add(shadow);

    const haloMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xd5bd8b,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const haloRing = new THREE.Mesh(haloRingGeo, haloMat);
    haloRing.position.y = 0.011;
    group.add(haloRing);

    const pieceRoot = assembleSilhouette(member.pieceType, member.side);
    group.add(pieceRoot);

    const hitMesh = new THREE.Mesh(hitCylinderGeo, hitProxyMat);
    hitMesh.position.y = 0.72;
    hitMesh.layers.set(1);
    hitMesh.userData.memberId = member.id;
    group.add(hitMesh);

    return { group, hitMesh, haloRing, pieceRoot, baseY };
  }

  function buildBoardStructure(): {
    rootGroup: THREE.Group;
    departmentHighlights: Map<string, THREE.MeshBasicMaterial>;
  } {
    const rootGroup = new THREE.Group();
    const departmentHighlights = new Map<string, THREE.MeshBasicMaterial>();

    const subPlinthGeo = trackGeo(
      new THREE.BoxGeometry(BOARD_SIZE + 1.55, 0.24, BOARD_SIZE + 1.65)
    );
    const upperFrameGeo = trackGeo(
      new THREE.BoxGeometry(BOARD_SIZE + 1.06, 0.14, BOARD_SIZE + 1.12)
    );
    const seamGlowGeo = trackGeo(
      new THREE.BoxGeometry(BOARD_SIZE + 1.14, 0.02, BOARD_SIZE + 1.2)
    );
    const goldBorderGeo = trackGeo(
      new THREE.BoxGeometry(BOARD_SIZE + 0.14, 0.022, BOARD_SIZE + 0.14)
    );
    const squareGeo = trackGeo(
      new THREE.BoxGeometry(SQUARE_SIZE - 0.014, 0.05, SQUARE_SIZE - 0.014)
    );
    const meridianGeo = trackGeo(
      new THREE.BoxGeometry(BOARD_SIZE + 0.04, 0.006, 0.024)
    );

    const fileStripMat = trackMat(new THREE.MeshBasicMaterial({ map: filesTex }));
    const fileStripGeo = trackGeo(new THREE.PlaneGeometry(BOARD_SIZE, 0.32));
    fileStripGeo.rotateX(-Math.PI / 2);

    const rankStripMat = trackMat(new THREE.MeshBasicMaterial({ map: ranksTex }));
    const rankStripGeo = trackGeo(new THREE.PlaneGeometry(0.32, BOARD_SIZE));
    rankStripGeo.rotateX(-Math.PI / 2);

    const eastTierTex = trackTex(createSideTierStripTexture(maxAnisotropy));
    const eastTierMat = trackMat(new THREE.MeshBasicMaterial({ map: eastTierTex }));
    const eastTierGeo = trackGeo(new THREE.PlaneGeometry(0.36, BOARD_SIZE));
    eastTierGeo.rotateX(-Math.PI / 2);

    const southPlaqueGeo = trackGeo(new THREE.PlaneGeometry(5.8, 0.32));
    const northCrownGeo = trackGeo(new THREE.PlaneGeometry(4.4, 0.28));
    northCrownGeo.rotateX(-Math.PI / 2);
    const redCompassGeo = trackGeo(new THREE.OctahedronGeometry(0.055, 0));

    // Single 8x8 board squares via 2 InstancedMeshes (32 light + 32 dark)
    const lightInstanced = new THREE.InstancedMesh(squareGeo, lightSquareMat, 32);
    lightInstanced.receiveShadow = true;
    const darkInstanced = new THREE.InstancedMesh(squareGeo, darkSquareMat, 32);
    darkInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let lightIdx = 0;
    let darkIdx = 0;

    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const localX = (c - (BOARD_COLS - 1) / 2) * SQUARE_SIZE;
        const localZ = (r - (BOARD_ROWS - 1) / 2) * SQUARE_SIZE;
        dummy.position.set(localX, -0.025, localZ);
        dummy.updateMatrix();
        if (isLightSquare(r, c)) {
          lightInstanced.setMatrixAt(lightIdx++, dummy.matrix);
        } else {
          darkInstanced.setMatrixAt(darkIdx++, dummy.matrix);
        }
      }
    }
    lightInstanced.instanceMatrix.needsUpdate = true;
    darkInstanced.instanceMatrix.needsUpdate = true;
    rootGroup.add(lightInstanced);
    rootGroup.add(darkInstanced);

    // Architectural stepped plinth & brass/baby-blue trim
    const subPlinth = new THREE.Mesh(subPlinthGeo, frameWalnutNavyMat);
    subPlinth.position.y = -0.26;
    subPlinth.receiveShadow = true;
    rootGroup.add(subPlinth);

    const upperFrame = new THREE.Mesh(upperFrameGeo, frameWalnutNavyMat);
    upperFrame.position.y = -0.09;
    upperFrame.receiveShadow = true;
    rootGroup.add(upperFrame);

    const seamGlow = new THREE.Mesh(seamGlowGeo, babyBlueRimMat);
    seamGlow.position.y = -0.152;
    rootGroup.add(seamGlow);

    const goldBorder = new THREE.Mesh(goldBorderGeo, frameBrassTrimMat);
    goldBorder.position.y = -0.018;
    goldBorder.receiveShadow = true;
    rootGroup.add(goldBorder);

    // Department selection remains a subtle translucent square overlay; the board itself stays a clean chessboard.
    for (const zone of DEPARTMENT_ZONES) {
      const spanW = (zone.colMax - zone.colMin + 1) * SQUARE_SIZE - 0.05;
      const spanD = (zone.rowMax - zone.rowMin + 1) * SQUARE_SIZE - 0.05;
      const centerCol = (zone.colMin + zone.colMax) / 2;
      const centerRow = (zone.rowMin + zone.rowMax) / 2;
      const cx = (centerCol - (BOARD_COLS - 1) / 2) * SQUARE_SIZE;
      const cz = (centerRow - (BOARD_ROWS - 1) / 2) * SQUARE_SIZE;

      // Subtle filter-highlight overlay for the whole department block (opacity 0 at rest)
      const hlGeo = trackGeo(new THREE.PlaneGeometry(spanW, spanD));
      hlGeo.rotateX(-Math.PI / 2);
      const hlMat = trackMat(
        new THREE.MeshBasicMaterial({
          color: zone.accentSide === 'gold' ? 0xd5bd8b : 0x83b5ed,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        })
      );
      const hlPlane = new THREE.Mesh(hlGeo, hlMat);
      hlPlane.position.set(cx, 0.002, cz);
      rootGroup.add(hlPlane);
      departmentHighlights.set(zone.department, hlMat);
    }

    // Coordinate & outer bezel markings (strictly outside the 64 squares)
    const fileStrip = new THREE.Mesh(fileStripGeo, fileStripMat);
    fileStrip.position.set(0, 0.002, BOARD_SIZE / 2 + 0.25);
    rootGroup.add(fileStrip);

    const rankStrip = new THREE.Mesh(rankStripGeo, rankStripMat);
    rankStrip.position.set(-BOARD_SIZE / 2 - 0.25, 0.002, 0);
    rootGroup.add(rankStrip);

    return { rootGroup, departmentHighlights };
  }

  return {
    buildMemberPiece,
    buildBoardStructure,
    dispose: () => {
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}
