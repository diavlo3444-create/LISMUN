import * as THREE from 'three';
import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { getWorldLandFeature } from './worldGeometry';

export interface GlobeTextureSet {
  colorMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export function createGlobeTextures(maxAnisotropy: number): GlobeTextureSet {
  const width = 1024;
  const height = 512;
  const mapW = 512;
  const mapH = 256;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = mapW;
  bumpCanvas.height = mapH;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = mapW;
  roughCanvas.height = mapH;

  const cCtx = colorCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');

  const landGeo = getWorldLandFeature();
  const colorProj = geoEquirectangular().fitSize([width, height], {
    type: 'Sphere',
  });
  const mapProj = geoEquirectangular().fitSize([mapW, mapH], {
    type: 'Sphere',
  });

  if (cCtx && bCtx && rCtx) {
    const colorPath = geoPath(colorProj, cCtx);
    const bumpPath = geoPath(mapProj, bCtx);
    const roughPath = geoPath(mapProj, rCtx);
    const graticule = geoGraticule10();

    // 1. Ocean deep royal-navy radial-latitude gradient
    const oceanGrad = cCtx.createLinearGradient(0, 0, 0, height);
    oceanGrad.addColorStop(0, '#071b36');
    oceanGrad.addColorStop(0.5, '#0d2b52');
    oceanGrad.addColorStop(1, '#071b36');
    cCtx.fillStyle = oceanGrad;
    cCtx.fillRect(0, 0, width, height);

    // Subtle inlaid graticule lines matching official LISMUN globe
    cCtx.beginPath();
    colorPath(graticule);
    cCtx.strokeStyle = 'rgba(72, 134, 198, 0.34)';
    cCtx.lineWidth = 1.1;
    cCtx.stroke();

    // Bump & roughness ocean baselines
    bCtx.fillStyle = '#242424';
    bCtx.fillRect(0, 0, mapW, mapH);

    rCtx.fillStyle = '#929292'; // satin ocean finish
    rCtx.fillRect(0, 0, mapW, mapH);

    // 2. Sculpted raised champagne-gold landmasses
    cCtx.beginPath();
    colorPath(landGeo);
    cCtx.fillStyle = '#d3b57d';
    cCtx.fill();
    cCtx.strokeStyle = '#92733c';
    cCtx.lineWidth = 1.4;
    cCtx.stroke();

    // Raised continental plateau in bump map with soft coastline bevel
    bCtx.beginPath();
    bumpPath(landGeo);
    bCtx.strokeStyle = '#a0a0a0';
    bCtx.lineWidth = 2.4;
    bCtx.stroke();
    bCtx.fillStyle = '#f2f2f2';
    bCtx.fill();

    // Polished metallic luster on continents vs satin ocean
    rCtx.beginPath();
    roughPath(landGeo);
    rCtx.fillStyle = '#383838';
    rCtx.fill();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAnisotropy;
  colorMap.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAnisotropy;
  roughnessMap.needsUpdate = true;

  return { colorMap, bumpMap, roughnessMap };
}

export function createShieldFrontTexture(
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 384;
  const height = 480;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const navyGrad = ctx.createLinearGradient(0, 132, 0, height);
    navyGrad.addColorStop(0, '#0e223d');
    navyGrad.addColorStop(1, '#071426');
    ctx.fillStyle = navyGrad;
    ctx.fillRect(0, 0, width, height);

    const chiefHeight = Math.round(height * 0.28);
    const crimsonGrad = ctx.createLinearGradient(0, 0, 0, chiefHeight);
    crimsonGrad.addColorStop(0, '#8d1e29');
    crimsonGrad.addColorStop(1, '#6f141d');
    ctx.fillStyle = crimsonGrad;
    ctx.fillRect(0, 0, width, chiefHeight);

    ctx.fillStyle = '#d5bd8b';
    ctx.fillRect(0, chiefHeight - 3, width, 5);

    ctx.fillStyle = '#f2ece0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 54px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('LISMUN', width / 2, chiefHeight * 0.56);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createPlaqueTexture(
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 512;
  const height = 160;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const brassGrad = ctx.createLinearGradient(0, 0, width, height);
    brassGrad.addColorStop(0, '#d8be89');
    brassGrad.addColorStop(0.5, '#c29f5b');
    brassGrad.addColorStop(1, '#a98443');
    ctx.fillStyle = brassGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(34, 24, 12, 0.72)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    ctx.strokeStyle = 'rgba(255, 242, 210, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(18, 18, width - 36, height - 36);

    ctx.fillStyle = '#1b140b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 46px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('LISMUN', width / 2, 66);

    ctx.fillStyle = '#2d2111';
    ctx.font = '600 17px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('SESSION I · THE LIVING ATLAS', width / 2, 114);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBookPagesTexture(
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 384;
  const height = 384;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const paperGrad = ctx.createLinearGradient(0, 0, width, 0);
    paperGrad.addColorStop(0, '#cfc3ab');
    paperGrad.addColorStop(0.14, '#ebe3d1');
    paperGrad.addColorStop(0.85, '#f2ebdc');
    paperGrad.addColorStop(1, '#d8ccb3');
    ctx.fillStyle = paperGrad;
    ctx.fillRect(0, 0, width, height);

    for (let x = 6; x < width; x += 12) {
      ctx.fillStyle = 'rgba(130, 108, 72, 0.08)';
      ctx.fillRect(x, 0, 2, height);
    }
    for (let y = 18; y < height - 18; y += 18) {
      ctx.fillStyle = 'rgba(30, 44, 68, 0.09)';
      ctx.fillRect(36, y, width - 72, 1.5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createBrushedMetalTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#7c7c7c';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) {
      const lum = 108 + Math.floor(((Math.sin(y * 0.77) + 1) * 0.5) * 38);
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, size, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.08,
      size / 2,
      size / 2,
      size * 0.49
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
    grad.addColorStop(0.5, 'rgba(3, 9, 20, 0.46)');
    grad.addColorStop(0.82, 'rgba(3, 9, 20, 0.14)');
    grad.addColorStop(1, 'rgba(3, 9, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
