import * as THREE from 'three';
import {
  createBookPagesTexture,
  createBrushedMetalTexture,
  createContactShadowTexture,
  createGlobeTextures,
  createPlaqueTexture,
  createShieldFrontTexture,
} from './medallionTextures';

export type MonumentPieceId =
  | 'plinth'
  | 'book'
  | 'laurels'
  | 'globe'
  | 'pillar'
  | 'shield';

export interface PieceMeta {
  id: MonumentPieceId;
  title: string;
  subtitle: string;
  actionHint: string;
}

export const MONUMENT_PIECE_META: Record<MonumentPieceId, PieceMeta> = {
  plinth: {
    id: 'plinth',
    title: 'Stepped Navy & Brass Plinth',
    subtitle: 'Foundational museum pedestal with Session I brass plaque',
    actionHint: 'Click plinth to separate or assemble all 6 pieces',
  },
  book: {
    id: 'book',
    title: 'Open Gilded Tome',
    subtitle: 'Archival scholarship & treaty precedent supporting the assembly',
    actionHint: 'Click book to open covers & folio pages wider',
  },
  laurels: {
    id: 'laurels',
    title: 'Sovereign Laurel Wreaths',
    subtitle: 'Sculpted satin-brass olive arcs framing global inquiry',
    actionHint: 'Click laurels to fan the olive wreaths outward',
  },
  globe: {
    id: 'globe',
    title: 'Relief World Globe',
    subtitle: 'Continental brass topography & inlaid meridian rings',
    actionHint: 'Click globe to spin it inside its meridian cage',
  },
  pillar: {
    id: 'pillar',
    title: 'Classical Brass Podium',
    subtitle: 'Parliamentary speaker column & diplomatic dais',
    actionHint: 'Click podium to elevate the speaker lectern',
  },
  shield: {
    id: 'shield',
    title: 'Heraldic LISMUN Shield',
    subtitle: 'Crimson chief & sculpted architectural crest',
    actionHint: 'Click shield to pop it forward for close inspection',
  },
};

export interface BuiltMonument {
  rootGroup: THREE.Group;
  pieceGroups: Record<MonumentPieceId, THREE.Group>;
  pieceMaterials: Record<MonumentPieceId, THREE.MeshStandardMaterial[]>;
  leftBookWing: THREE.Group;
  rightBookWing: THREE.Group;
  leftWreathGroup: THREE.Group;
  rightWreathGroup: THREE.Group;
  globeSphere: THREE.Mesh;
  guideMaterials: THREE.MeshBasicMaterial[];
  shadowMesh: THREE.Mesh;
  dispose: () => void;
}

function tagPieceRayTarget(obj: THREE.Object3D, pieceId: MonumentPieceId): void {
  obj.traverse((child) => {
    child.userData.pieceId = pieceId;
  });
}

function normalizePlanarUVs(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;

  const pos = geometry.attributes.position;
  const spanX = Math.max(box.max.x - box.min.x, 1e-5);
  const spanY = Math.max(box.max.y - box.min.y, 1e-5);

  const uvArray = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uvArray[i * 2] = (x - box.min.x) / spanX;
    uvArray[i * 2 + 1] = (y - box.min.y) / spanY;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
}

function createShieldShape(width: number, height: number): THREE.Shape {
  const hw = width / 2;
  const hh = height / 2;
  const sideBottom = -hh * 0.16;

  const shape = new THREE.Shape();
  shape.moveTo(-hw, hh);
  shape.lineTo(hw, hh);
  shape.lineTo(hw, sideBottom);
  shape.bezierCurveTo(hw, -hh * 0.58, hw * 0.42, -hh * 0.86, 0, -hh);
  shape.bezierCurveTo(-hw * 0.42, -hh * 0.86, -hw, -hh * 0.58, -hw, sideBottom);
  shape.closePath();
  return shape;
}

function createLaurelLeafGeometry(): THREE.ExtrudeGeometry {
  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0);
  leaf.bezierCurveTo(-0.048, 0.055, -0.044, 0.145, 0, 0.21);
  leaf.bezierCurveTo(0.044, 0.145, 0.048, 0.055, 0, 0);
  leaf.closePath();

  const geo = new THREE.ExtrudeGeometry(leaf, {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.007,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.center();
  return geo;
}

function createArchedPageBlockGeometry(side: 'left' | 'right'): THREE.ExtrudeGeometry {
  const dir = side === 'right' ? 1 : -1;
  const page = new THREE.Shape();

  page.moveTo(0.01 * dir, 0.02);
  page.bezierCurveTo(0.32 * dir, 0.18, 0.66 * dir, 0.18, 0.96 * dir, 0.08);
  page.lineTo(0.98 * dir, -0.03);
  page.bezierCurveTo(0.66 * dir, 0.03, 0.32 * dir, 0.03, 0.01 * dir, -0.045);
  page.closePath();

  const geo = new THREE.ExtrudeGeometry(page, {
    depth: 1.12,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 12,
  });
  geo.translate(0, 0, -0.56);
  normalizePlanarUVs(geo);
  return geo;
}

function createWreathSide(
  side: 'left' | 'right',
  stemMat: THREE.Material,
  leafMat: THREE.Material,
  leafGeo: THREE.BufferGeometry,
  disposableGeos: THREE.BufferGeometry[]
): THREE.Group {
  const dir = side === 'right' ? 1 : -1;
  const group = new THREE.Group();

  const stemPoints = [
    new THREE.Vector3(0.24 * dir, 0.0, 0.06),
    new THREE.Vector3(0.84 * dir, 0.24, -0.02),
    new THREE.Vector3(1.19 * dir, 0.78, -0.11),
    new THREE.Vector3(1.18 * dir, 1.38, -0.17),
    new THREE.Vector3(0.92 * dir, 1.88, -0.21),
    new THREE.Vector3(0.56 * dir, 2.15, -0.22),
  ];

  const curve = new THREE.CatmullRomCurve3(stemPoints);
  const stemGeo = new THREE.TubeGeometry(curve, 28, 0.024, 8, false);
  disposableGeos.push(stemGeo);
  const stemMesh = new THREE.Mesh(stemGeo, stemMat);
  group.add(stemMesh);

  const steps = 11;
  const totalLeaves = steps * 2;
  const instanced = new THREE.InstancedMesh(leafGeo, leafMat, totalLeaves);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const tiltQuat = new THREE.Quaternion();

  let idx = 0;
  for (let i = 0; i < steps; i++) {
    const t = 0.08 + (i / (steps - 1)) * 0.86;
    curve.getPointAt(t, pos);
    curve.getTangentAt(t, tangent).normalize();

    outward.set(tangent.y * dir, -tangent.x * dir, 0).normalize();
    const sizeScale = 0.72 + Math.sin(t * Math.PI) * 0.34;

    dummy.position.copy(pos).addScaledVector(outward, 0.055);
    quat.setFromUnitVectors(up, tangent);
    tiltQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.42 * dir);
    dummy.quaternion.copy(quat).multiply(tiltQuat);
    dummy.rotateY(0.28 * dir);
    dummy.scale.set(sizeScale, sizeScale, sizeScale);
    dummy.updateMatrix();
    instanced.setMatrixAt(idx++, dummy.matrix);

    dummy.position.copy(pos).addScaledVector(outward, -0.05);
    quat.setFromUnitVectors(up, tangent);
    tiltQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.36 * dir);
    dummy.quaternion.copy(quat).multiply(tiltQuat);
    dummy.rotateY(-0.22 * dir);
    dummy.scale.set(sizeScale * 0.9, sizeScale * 0.9, sizeScale * 0.9);
    dummy.updateMatrix();
    instanced.setMatrixAt(idx++, dummy.matrix);
  }

  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  group.add(instanced);

  return group;
}

export function buildLismunMonument(maxAnisotropy: number): BuiltMonument {
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];

  const brushedRoughTex = createBrushedMetalTexture();
  const shadowTex = createContactShadowTexture();
  const plaqueTex = createPlaqueTexture(maxAnisotropy);
  const shieldFrontTex = createShieldFrontTexture(maxAnisotropy);
  const bookPagesTex = createBookPagesTexture(maxAnisotropy);
  const globeTexSet = createGlobeTextures(maxAnisotropy);

  disposableTex.push(
    brushedRoughTex,
    shadowTex,
    plaqueTex,
    shieldFrontTex,
    bookPagesTex,
    globeTexSet.colorMap,
    globeTexSet.bumpMap,
    globeTexSet.roughnessMap
  );

  // Calibrated warm satin antique brass & soft diffused lacquer materials (MeshStandardMaterial for fast GPU shaders)
  const makeObsidianNavy = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x071528,
      metalness: 0.16,
      roughness: 0.48,
      envMapIntensity: 0.58,
    });
    disposableMats.push(m);
    return m;
  };

  const makeSatinNavy = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x0d213d,
      metalness: 0.14,
      roughness: 0.5,
      envMapIntensity: 0.58,
    });
    disposableMats.push(m);
    return m;
  };

  const makeSatinBrass = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xc9a86a,
      metalness: 0.86,
      roughness: 0.36,
      roughnessMap: brushedRoughTex,
      envMapIntensity: 0.74,
    });
    disposableMats.push(m);
    return m;
  };

  const makeAntiqueBrass = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xb28d4b,
      metalness: 0.84,
      roughness: 0.44,
      roughnessMap: brushedRoughTex,
      envMapIntensity: 0.66,
    });
    disposableMats.push(m);
    return m;
  };

  const makeBurnishedBronze = () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0x8a6935,
      metalness: 0.8,
      roughness: 0.48,
      envMapIntensity: 0.6,
    });
    disposableMats.push(m);
    return m;
  };

  const rootGroup = new THREE.Group();

  // ---------------------------------------------------------------------------
  // 1. STEPPED NAVY & BRASS MUSEUM PLINTH
  // ---------------------------------------------------------------------------
  const plinthNavy = makeObsidianNavy();
  const plinthSatinNavy = makeSatinNavy();
  const plinthBrass = makeSatinBrass();
  const plinthAntiqueBrass = makeAntiqueBrass();
  const plaqueMat = new THREE.MeshStandardMaterial({
    map: plaqueTex,
    metalness: 0.68,
    roughness: 0.44,
    envMapIntensity: 0.6,
  });
  disposableMats.push(plaqueMat);

  const plinthGroup = new THREE.Group();

  const tier1Geo = new THREE.CylinderGeometry(1.66, 1.82, 0.24, 8);
  const tier1Mesh = new THREE.Mesh(tier1Geo, plinthNavy);
  tier1Mesh.position.y = 0.12;
  tier1Mesh.rotation.y = Math.PI / 8;
  plinthGroup.add(tier1Mesh);

  const brassStepGeo = new THREE.CylinderGeometry(1.52, 1.63, 0.07, 8);
  const brassStepMesh = new THREE.Mesh(brassStepGeo, plinthBrass);
  brassStepMesh.position.y = 0.275;
  brassStepMesh.rotation.y = Math.PI / 8;
  plinthGroup.add(brassStepMesh);

  const tier2Geo = new THREE.CylinderGeometry(1.36, 1.48, 0.3, 8);
  const tier2Mesh = new THREE.Mesh(tier2Geo, plinthSatinNavy);
  tier2Mesh.position.y = 0.46;
  tier2Mesh.rotation.y = Math.PI / 8;
  plinthGroup.add(tier2Mesh);

  const topBrassCapGeo = new THREE.CylinderGeometry(1.32, 1.38, 0.06, 8);
  const topBrassCapMesh = new THREE.Mesh(topBrassCapGeo, plinthAntiqueBrass);
  topBrassCapMesh.position.y = 0.64;
  topBrassCapMesh.rotation.y = Math.PI / 8;
  plinthGroup.add(topBrassCapMesh);

  const plaqueGeo = new THREE.BoxGeometry(0.92, 0.22, 0.045);
  const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaqueMesh.position.set(0, 0.46, 1.32);
  plaqueMesh.rotation.x = -0.22;
  plinthGroup.add(plaqueMesh);

  const cradleBarGeo = new THREE.BoxGeometry(0.24, 0.08, 1.12);
  const cradleBarMesh = new THREE.Mesh(cradleBarGeo, plinthBrass);
  cradleBarMesh.position.set(0, 0.7, 0.24);
  plinthGroup.add(cradleBarMesh);

  const cradleWingGeo = new THREE.BoxGeometry(0.68, 0.04, 0.96);
  const leftCradleWing = new THREE.Mesh(cradleWingGeo, plinthAntiqueBrass);
  leftCradleWing.position.set(-0.36, 0.74, 0.24);
  leftCradleWing.rotation.z = -0.18;
  plinthGroup.add(leftCradleWing);

  const rightCradleWing = new THREE.Mesh(cradleWingGeo, plinthAntiqueBrass);
  rightCradleWing.position.set(0.36, 0.74, 0.24);
  rightCradleWing.rotation.z = 0.18;
  plinthGroup.add(rightCradleWing);

  disposableGeos.push(
    tier1Geo,
    brassStepGeo,
    tier2Geo,
    topBrassCapGeo,
    plaqueGeo,
    cradleBarGeo,
    cradleWingGeo
  );
  tagPieceRayTarget(plinthGroup, 'plinth');
  rootGroup.add(plinthGroup);

  // ---------------------------------------------------------------------------
  // 2. ARTICULATED 3D OPEN GILDED BOOK
  // ---------------------------------------------------------------------------
  const bookBrass = makeSatinBrass();
  const bookNavy = makeObsidianNavy();
  const bookSpineCapMat = makeSatinNavy();
  const parchmentPagesMat = new THREE.MeshStandardMaterial({
    map: bookPagesTex,
    metalness: 0.03,
    roughness: 0.78,
    envMapIntensity: 0.45,
  });
  disposableMats.push(parchmentPagesMat);

  const bookGroup = new THREE.Group();
  bookGroup.position.set(0, 0.84, 0.24);

  const spineGeo = new THREE.CylinderGeometry(0.085, 0.085, 1.22, 24);
  const spineMesh = new THREE.Mesh(spineGeo, bookBrass);
  spineMesh.rotation.x = Math.PI / 2;
  spineMesh.position.y = -0.05;
  bookGroup.add(spineMesh);

  const spineCapGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.08, 24);
  const spineCapMesh = new THREE.Mesh(spineCapGeo, bookSpineCapMat);
  spineCapMesh.rotation.x = Math.PI / 2;
  spineCapMesh.position.set(0, -0.045, 0.62);
  bookGroup.add(spineCapMesh);

  // Articulated left & right book wings (covers + pages + gilt edges pivot together)
  const coverGeo = new THREE.BoxGeometry(1.06, 0.042, 1.22);
  const giltEdgeGeo = new THREE.BoxGeometry(0.03, 0.105, 1.12);
  const leftPageGeo = createArchedPageBlockGeometry('left');
  const rightPageGeo = createArchedPageBlockGeometry('right');

  const leftBookWing = new THREE.Group();
  leftBookWing.position.set(-0.04, -0.04, 0);
  leftBookWing.rotation.z = -0.22; // Rests cleanly inside cradle; flattens to ~ -0.02 when opened wider

  const leftCover = new THREE.Mesh(coverGeo, bookNavy);
  leftCover.position.set(-0.52, 0, 0);
  leftBookWing.add(leftCover);

  const leftPageMesh = new THREE.Mesh(leftPageGeo, parchmentPagesMat);
  leftPageMesh.position.set(-0.01, 0.05, 0);
  leftBookWing.add(leftPageMesh);

  const leftGilt = new THREE.Mesh(giltEdgeGeo, bookBrass);
  leftGilt.position.set(-0.99, 0.065, 0);
  leftBookWing.add(leftGilt);
  bookGroup.add(leftBookWing);

  const rightBookWing = new THREE.Group();
  rightBookWing.position.set(0.04, -0.04, 0);
  rightBookWing.rotation.z = 0.22;

  const rightCover = new THREE.Mesh(coverGeo, bookNavy);
  rightCover.position.set(0.52, 0, 0);
  rightBookWing.add(rightCover);

  const rightPageMesh = new THREE.Mesh(rightPageGeo, parchmentPagesMat);
  rightPageMesh.position.set(0.01, 0.05, 0);
  rightBookWing.add(rightPageMesh);

  const rightGilt = new THREE.Mesh(giltEdgeGeo, bookBrass);
  rightGilt.position.set(0.99, 0.065, 0);
  rightBookWing.add(rightGilt);
  bookGroup.add(rightBookWing);

  disposableGeos.push(
    spineGeo,
    spineCapGeo,
    coverGeo,
    leftPageGeo,
    rightPageGeo,
    giltEdgeGeo
  );
  tagPieceRayTarget(bookGroup, 'book');
  rootGroup.add(bookGroup);

  // ---------------------------------------------------------------------------
  // 3. DUAL SCULPTED 3D LAUREL WREATHS
  // ---------------------------------------------------------------------------
  const laurelStemMat = makeBurnishedBronze();
  const laurelLeafMat = makeAntiqueBrass();

  const laurelsGroup = new THREE.Group();
  laurelsGroup.position.set(0, 0.92, 0.05);

  const leafGeo = createLaurelLeafGeometry();
  disposableGeos.push(leafGeo);

  const leftWreathGroup = createWreathSide(
    'left',
    laurelStemMat,
    laurelLeafMat,
    leafGeo,
    disposableGeos
  );
  const rightWreathGroup = createWreathSide(
    'right',
    laurelStemMat,
    laurelLeafMat,
    leafGeo,
    disposableGeos
  );

  laurelsGroup.add(leftWreathGroup, rightWreathGroup);
  tagPieceRayTarget(laurelsGroup, 'laurels');
  rootGroup.add(laurelsGroup);

  // ---------------------------------------------------------------------------
  // 4. SCULPTED 3D WORLD GLOBE WITH CONTINENT RELIEF & BRASS MERIDIANS
  // ---------------------------------------------------------------------------
  const globeBrass = makeSatinBrass();
  const globeAntiqueBrass = makeAntiqueBrass();
  const globeMat = new THREE.MeshStandardMaterial({
    map: globeTexSet.colorMap,
    bumpMap: globeTexSet.bumpMap,
    bumpScale: 0.032,
    roughnessMap: globeTexSet.roughnessMap,
    metalness: 0.26,
    roughness: 0.72,
    envMapIntensity: 0.66,
  });
  disposableMats.push(globeMat);

  const globeGroup = new THREE.Group();
  globeGroup.position.set(0, 2.08, -0.22);

  const sphereGeo = new THREE.SphereGeometry(0.84, 36, 28);
  const globeSphere = new THREE.Mesh(sphereGeo, globeMat);
  globeSphere.rotation.y = -Math.PI * 0.56;
  globeGroup.add(globeSphere);

  const hoopGeo = new THREE.TorusGeometry(0.846, 0.011, 8, 48);
  const equatorHoop = new THREE.Mesh(hoopGeo, globeBrass);
  equatorHoop.rotation.x = Math.PI / 2;
  globeGroup.add(equatorHoop);

  const meridianCount = 3;
  for (let i = 0; i < meridianCount; i++) {
    const mHoop = new THREE.Mesh(hoopGeo, globeBrass);
    mHoop.rotation.y = (i / meridianCount) * Math.PI;
    globeGroup.add(mHoop);
  }

  const tropicGeo = new THREE.TorusGeometry(0.735, 0.009, 8, 44);
  const northTropic = new THREE.Mesh(tropicGeo, globeAntiqueBrass);
  northTropic.rotation.x = Math.PI / 2;
  northTropic.position.y = 0.42;
  globeGroup.add(northTropic);

  const southTropic = new THREE.Mesh(tropicGeo, globeAntiqueBrass);
  southTropic.rotation.x = Math.PI / 2;
  southTropic.position.y = -0.42;
  globeGroup.add(southTropic);

  disposableGeos.push(sphereGeo, hoopGeo, tropicGeo);
  tagPieceRayTarget(globeGroup, 'globe');
  rootGroup.add(globeGroup);

  // ---------------------------------------------------------------------------
  // 5. CLASSICAL BRASS PODIUM PILLAR
  // ---------------------------------------------------------------------------
  const pillarBrass = makeSatinBrass();
  const pillarAntiqueBrass = makeAntiqueBrass();
  const pillarBronze = makeBurnishedBronze();

  const pillarGroup = new THREE.Group();
  pillarGroup.position.set(0, 0.89, 0.74);

  const footGeo = new THREE.BoxGeometry(0.36, 0.065, 0.24);
  const footMesh = new THREE.Mesh(footGeo, pillarBrass);
  footMesh.position.y = 0.032;
  pillarGroup.add(footMesh);

  const shaftShape = new THREE.Shape();
  shaftShape.moveTo(-0.11, 0.06);
  shaftShape.lineTo(0.11, 0.06);
  shaftShape.lineTo(0.145, 0.74);
  shaftShape.lineTo(-0.145, 0.74);
  shaftShape.closePath();

  const shaftGeo = new THREE.ExtrudeGeometry(shaftShape, {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.012,
    bevelSegments: 2,
  });
  shaftGeo.translate(0, 0, -0.075);
  const shaftMesh = new THREE.Mesh(shaftGeo, pillarBronze);
  pillarGroup.add(shaftMesh);

  const capitalShape = new THREE.Shape();
  capitalShape.moveTo(-0.15, 0.73);
  capitalShape.lineTo(0.15, 0.73);
  capitalShape.lineTo(0.31, 0.93);
  capitalShape.lineTo(0.31, 1.0);
  capitalShape.lineTo(-0.31, 1.0);
  capitalShape.lineTo(-0.31, 0.93);
  capitalShape.closePath();

  const capitalGeo = new THREE.ExtrudeGeometry(capitalShape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.014,
    bevelSegments: 2,
  });
  capitalGeo.translate(0, 0, -0.1);
  const capitalMesh = new THREE.Mesh(capitalGeo, pillarAntiqueBrass);
  pillarGroup.add(capitalMesh);

  const corniceLowerGeo = new THREE.BoxGeometry(0.68, 0.038, 0.25);
  const corniceLower = new THREE.Mesh(corniceLowerGeo, pillarBrass);
  corniceLower.position.y = 1.025;
  pillarGroup.add(corniceLower);

  const corniceUpperGeo = new THREE.BoxGeometry(0.74, 0.034, 0.27);
  const corniceUpper = new THREE.Mesh(corniceUpperGeo, pillarBrass);
  corniceUpper.position.y = 1.075;
  pillarGroup.add(corniceUpper);

  const postGeo = new THREE.CylinderGeometry(0.035, 0.042, 0.24, 16);
  const postMesh = new THREE.Mesh(postGeo, pillarBrass);
  postMesh.position.set(0, 1.19, -0.02);
  pillarGroup.add(postMesh);

  disposableGeos.push(
    footGeo,
    shaftGeo,
    capitalGeo,
    corniceLowerGeo,
    corniceUpperGeo,
    postGeo
  );
  tagPieceRayTarget(pillarGroup, 'pillar');
  rootGroup.add(pillarGroup);

  // ---------------------------------------------------------------------------
  // 6. MULTI-LAYERED HERALDIC LISMUN SHIELD CREST
  // ---------------------------------------------------------------------------
  const shieldBrass = makeSatinBrass();
  const shieldAntiqueBrass = makeAntiqueBrass();
  const shieldFrontMat = new THREE.MeshStandardMaterial({
    map: shieldFrontTex,
    metalness: 0.1,
    roughness: 0.42,
    envMapIntensity: 0.64,
  });
  const ivoryInlayMat = new THREE.MeshStandardMaterial({
    color: 0xede6d8,
    metalness: 0.06,
    roughness: 0.4,
    envMapIntensity: 0.54,
  });
  disposableMats.push(shieldFrontMat, ivoryInlayMat);

  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(0, 2.38, 0.77);

  const bezelShape = createShieldShape(0.66, 0.8);
  const bezelGeo = new THREE.ExtrudeGeometry(bezelShape, {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
    curveSegments: 16,
  });
  bezelGeo.translate(0, 0, -0.0375);
  const bezelMesh = new THREE.Mesh(bezelGeo, shieldBrass);
  shieldGroup.add(bezelMesh);

  const faceShape = createShieldShape(0.6, 0.74);
  const faceGeo = new THREE.ExtrudeGeometry(faceShape, {
    depth: 0.09,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 16,
  });
  faceGeo.translate(0, 0, -0.045);
  normalizePlanarUVs(faceGeo);
  const faceMesh = new THREE.Mesh(faceGeo, shieldFrontMat);
  faceMesh.position.z = 0.008;
  shieldGroup.add(faceMesh);

  const bracketLeftShape = new THREE.Shape();
  bracketLeftShape.moveTo(-0.125, 0.055);
  bracketLeftShape.lineTo(-0.02, 0.055);
  bracketLeftShape.lineTo(-0.02, 0.022);
  bracketLeftShape.lineTo(-0.055, 0.022);
  bracketLeftShape.lineTo(-0.055, -0.095);
  bracketLeftShape.lineTo(-0.02, -0.095);
  bracketLeftShape.lineTo(-0.02, -0.128);
  bracketLeftShape.lineTo(-0.125, -0.128);
  bracketLeftShape.closePath();

  const bracketLeftGeo = new THREE.ExtrudeGeometry(bracketLeftShape, {
    depth: 0.024,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  const bracketLeftMesh = new THREE.Mesh(bracketLeftGeo, ivoryInlayMat);
  bracketLeftMesh.position.z = 0.052;
  shieldGroup.add(bracketLeftMesh);

  const bracketRightMesh = new THREE.Mesh(bracketLeftGeo, ivoryInlayMat);
  bracketRightMesh.scale.x = -1;
  bracketRightMesh.position.z = 0.052;
  shieldGroup.add(bracketRightMesh);

  const starShape = new THREE.Shape();
  const outerR = 0.052;
  const innerR = 0.017;
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const ang = (i / 8) * Math.PI * 2;
    const sx = Math.cos(ang) * r;
    const sy = Math.sin(ang) * r - 0.036;
    if (i === 0) starShape.moveTo(sx, sy);
    else starShape.lineTo(sx, sy);
  }
  starShape.closePath();

  const starGeo = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  const starMesh = new THREE.Mesh(starGeo, ivoryInlayMat);
  starMesh.position.z = 0.053;
  shieldGroup.add(starMesh);

  const backBadgeGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 24);
  const backBadge = new THREE.Mesh(backBadgeGeo, shieldAntiqueBrass);
  backBadge.rotation.x = Math.PI / 2;
  backBadge.position.set(0, -0.04, -0.055);
  shieldGroup.add(backBadge);

  disposableGeos.push(
    bezelGeo,
    faceGeo,
    bracketLeftGeo,
    starGeo,
    backBadgeGeo
  );
  tagPieceRayTarget(shieldGroup, 'shield');
  rootGroup.add(shieldGroup);

  // ---------------------------------------------------------------------------
  // 7. ARCHITECTURAL ALIGNMENT GUIDE PINS (Visible subtly when separated)
  // ---------------------------------------------------------------------------
  const guideMaterials: THREE.MeshBasicMaterial[] = [];
  const guidePinMat = new THREE.MeshBasicMaterial({
    color: 0xc9a86a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  guideMaterials.push(guidePinMat);

  const spineGuideGeo = new THREE.CylinderGeometry(0.006, 0.006, 2.3, 8);
  const spineGuide = new THREE.Mesh(spineGuideGeo, guidePinMat);
  spineGuide.position.set(0, 1.85, 0.74);
  rootGroup.add(spineGuide);

  const globeGuideGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.5, 8);
  const globeGuide = new THREE.Mesh(globeGuideGeo, guidePinMat);
  globeGuide.rotation.x = Math.PI / 2;
  globeGuide.position.set(0, 2.12, -0.1);
  rootGroup.add(globeGuide);

  disposableGeos.push(spineGuideGeo, globeGuideGeo);
  disposableMats.push(guidePinMat);

  // ---------------------------------------------------------------------------
  // 8. GROUND CONTACT SHADOW PLANE
  // ---------------------------------------------------------------------------
  const shadowGeo = new THREE.CircleGeometry(2.55, 36);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.002;
  rootGroup.add(shadowMesh);

  disposableGeos.push(shadowGeo);
  disposableMats.push(shadowMat);

  const pieceMaterials: Record<MonumentPieceId, THREE.MeshStandardMaterial[]> = {
    plinth: [plinthNavy, plinthSatinNavy, plinthBrass, plinthAntiqueBrass, plaqueMat],
    book: [bookBrass, bookNavy, bookSpineCapMat, parchmentPagesMat],
    laurels: [laurelStemMat, laurelLeafMat],
    globe: [globeMat, globeBrass, globeAntiqueBrass],
    pillar: [pillarBrass, pillarAntiqueBrass, pillarBronze],
    shield: [shieldBrass, shieldAntiqueBrass, shieldFrontMat, ivoryInlayMat],
  };

  return {
    rootGroup,
    pieceGroups: {
      plinth: plinthGroup,
      book: bookGroup,
      laurels: laurelsGroup,
      globe: globeGroup,
      pillar: pillarGroup,
      shield: shieldGroup,
    },
    pieceMaterials,
    leftBookWing,
    rightBookWing,
    leftWreathGroup,
    rightWreathGroup,
    globeSphere,
    guideMaterials,
    shadowMesh,
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
      disposableTex.forEach((t) => t.dispose());
    },
  };
}
