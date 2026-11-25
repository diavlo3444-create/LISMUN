import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Layers, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { prefersReducedMotion } from '../utils/atlasAnimations';
import {
  evaluateIntroFramePose,
  INTRO_SHOWCASE_HANDOFF_SEC,
  type PiecePoseState,
} from '../utils/introChoreography';
import {
  buildLismunMonument,
  MONUMENT_PIECE_META,
  type MonumentPieceId,
} from '../utils/sculptureBuilder';

interface ThreeMonumentProps {
  onOpenRegistration: () => void;
  introComplete?: boolean;
  introRunId?: number;
  onIntroComplete?: () => void;
}

const SOFTWARE_GL_REGEX =
  /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

const PIECE_IDS: MonumentPieceId[] = [
  'plinth',
  'book',
  'laurels',
  'globe',
  'pillar',
  'shield',
];

// Pre-allocated math helpers outside render loop (zero per-frame GC)
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _defaultCamPos = new THREE.Vector3(0.55, 2.32, 6.45);
const _defaultTarget = new THREE.Vector3(0, 1.55, 0.05);

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      probe.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    if (!gl) return true;

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER)
    );

    const loseExt = gl.getExtension('WEBGL_lose_context');
    loseExt?.loseContext();

    return SOFTWARE_GL_REGEX.test(rendererStr);
  } catch {
    return true;
  }
}

function applyPiecePose(group: THREE.Group, pose: PiecePoseState): void {
  group.visible = pose.visible;
  if (!pose.visible) return;
  group.scale.setScalar(pose.scale);
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
}

export const ThreeMonument: React.FC<ThreeMonumentProps> = ({
  onOpenRegistration,
  introComplete = true,
  introRunId = 0,
  onIntroComplete,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const assemblyRuleRef = useRef<HTMLDivElement>(null);

  const introCompleteRef = useRef(introComplete);
  const onIntroCompleteRef = useRef(onIntroComplete);
  onIntroCompleteRef.current = onIntroComplete;

  const [isExploded, setIsExploded] = useState(false);
  const [hoveredPiece, setHoveredPiece] = useState<MonumentPieceId | null>(null);
  const [activePiece, setActivePiece] = useState<MonumentPieceId | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [shieldPopped, setShieldPopped] = useState(false);
  const [laurelsSpread, setLaurelsSpread] = useState(false);
  const [pillarRaised, setPillarRaised] = useState(false);
  const [globeSpinCount, setGlobeSpinCount] = useState(0);
  const [isGrabbing, setIsGrabbing] = useState(false);

  const [assemblyStage, setAssemblyStage] = useState({
    roman: 'I',
    label: 'Stepped Navy & Brass Plinth',
  });

  const controlRef = useRef({
    introElapsed: introComplete ? INTRO_SHOWCASE_HANDOFF_SEC : 0,
    introSignaled: introComplete,
    lastRoman: 'I',
    explodeTarget: 0,
    explodeCurrent: 0,
    isExploded: false,
    hoveredPiece: null as MonumentPieceId | null,
    bookOpen: false,
    bookOpenCurrent: 0,
    shieldPopped: false,
    shieldPopCurrent: 0,
    laurelsSpread: false,
    laurelsSpreadCurrent: 0,
    pillarRaised: false,
    pillarRaisedCurrent: 0,
    globeSpinVel: 0,
    hoverAlpha: {
      plinth: 0,
      book: 0,
      laurels: 0,
      globe: 0,
      pillar: 0,
      shield: 0,
    } as Record<MonumentPieceId, number>,
    resettingCamera: false,
    manualPauseUntil: 0,
    toggleExplode: () => {},
    resetAll: () => {},
    skipAssembly: () => {},
    restartAssembly: () => {},
    snapRestPose: () => {},
  });

  useEffect(() => {
    const container = containerRef.current;
    const mount = mountRef.current;
    if (!container || !mount) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const reducedMotion = prefersReducedMotion();

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });

    const maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
    );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';
    mount.appendChild(renderer.domElement);

    const initialW = Math.max(mount.clientWidth, 280);
    const initialH = Math.max(mount.clientHeight, 300);
    renderer.setSize(initialW, initialH, false);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      35,
      initialW / initialH,
      0.1,
      40
    );
    camera.position.copy(_defaultCamPos);

    // Softened museum studio environment reflections (eliminates mirror glare)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envMap = pmremGenerator.fromScene(roomEnv, 0.14).texture;
    scene.environment = envMap;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Diffused warm gallery lighting rig
    const keyLight = new THREE.DirectionalLight(0xffe8c2, 1.32);
    keyLight.position.set(3.8, 5.4, 4.6);
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x9fb8da, 0x050b16, 1.05);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0xc29e5a, 0.85);
    rimLight.position.set(-4.2, 2.8, -4.4);
    scene.add(rimLight);

    const warmFillLight = new THREE.PointLight(0xf6cf88, 1.15, 14, 2);
    warmFillLight.position.set(1.8, 2.35, 3.2);
    scene.add(warmFillLight);

    // Build articulated freestanding 3D sculptural LISMUN monument + stepped plinth
    const monument = buildLismunMonument(maxAnisotropy);
    scene.add(monument.rootGroup);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 360-degree OrbitControls (enabled seamlessly once shield locks in)
    const controls = new OrbitControls(camera, renderer.domElement);
    // Allow vertical thumb-scrolling past the Hero on mobile while keeping 360-degree drag orbiting
    renderer.domElement.style.touchAction = 'pan-y';
    controls.target.copy(_defaultTarget);
    controls.enabled = introCompleteRef.current;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.rotateSpeed = 0.82;
    controls.autoRotate =
      introCompleteRef.current && !isSoftwareGl && !reducedMotion;
    controls.autoRotateSpeed = 0.56;
    controls.minPolarAngle = Math.PI * 0.24;
    controls.maxPolarAngle = Math.PI * 0.57;
    controls.update();

    const state = controlRef.current;

    const applyRestPoseFromAssembly = () => {
      const rest = evaluateIntroFramePose(INTRO_SHOWCASE_HANDOFF_SEC);
      applyPiecePose(monument.pieceGroups.plinth, rest.plinth);
      applyPiecePose(monument.pieceGroups.book, rest.book);
      monument.leftBookWing.rotation.z = -rest.bookWingAngle;
      monument.rightBookWing.rotation.z = rest.bookWingAngle;

      applyPiecePose(monument.pieceGroups.laurels, rest.laurels);
      monument.leftWreathGroup.position.set(0, 0, 0);
      monument.leftWreathGroup.rotation.z = 0;
      monument.rightWreathGroup.position.set(0, 0, 0);
      monument.rightWreathGroup.rotation.z = 0;

      applyPiecePose(monument.pieceGroups.globe, rest.globe);
      monument.globeSphere.rotation.y = rest.globeSphereRotY;

      applyPiecePose(monument.pieceGroups.pillar, rest.pillar);
      applyPiecePose(monument.pieceGroups.shield, rest.shield);

      const shadowMat = monument.shadowMesh.material as THREE.MeshBasicMaterial;
      shadowMat.opacity = rest.shadowOpacity;

      camera.position.copy(_defaultCamPos);
      controls.target.copy(_defaultTarget);
      controls.update();
    };

    const handleControlsStart = () => {
      if (!introCompleteRef.current) return;
      isOrbiting = true;
      state.resettingCamera = false;
      state.manualPauseUntil = performance.now() + 2800;
      setIsGrabbing(true);
      wakeActiveLoop();
    };

    const handleControlsEnd = () => {
      isOrbiting = false;
      setIsGrabbing(false);
    };

    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('end', handleControlsEnd);

    state.toggleExplode = () => {
      if (!introCompleteRef.current) return;
      const next = !state.isExploded;
      state.isExploded = next;
      state.explodeTarget = next ? 1 : 0;
      if (reducedMotion) {
        state.explodeCurrent = state.explodeTarget;
      }
      setIsExploded(next);
      setActivePiece(next ? 'plinth' : null);
      wakeActiveLoop();
    };

    state.resetAll = () => {
      state.isExploded = false;
      state.explodeTarget = 0;
      state.bookOpen = false;
      state.shieldPopped = false;
      state.laurelsSpread = false;
      state.pillarRaised = false;
      state.globeSpinVel = 0;
      state.hoveredPiece = null;

      setIsExploded(false);
      setBookOpen(false);
      setShieldPopped(false);
      setLaurelsSpread(false);
      setPillarRaised(false);
      setHoveredPiece(null);
      setActivePiece(null);

      if (reducedMotion || isSoftwareGl) {
        camera.position.copy(_defaultCamPos);
        controls.target.copy(_defaultTarget);
        controls.update();
      } else {
        state.resettingCamera = true;
      }
      wakeActiveLoop();
    };

    state.snapRestPose = () => {
      state.introElapsed = INTRO_SHOWCASE_HANDOFF_SEC;
      state.introSignaled = true;
      introCompleteRef.current = true;
      controls.enabled = true;
      applyRestPoseFromAssembly();
      container.dataset.introStage = 'I–VI';
      container.dataset.assemblyProgress = '1.000';
      renderer.render(scene, camera);
      wakeActiveLoop();
    };

    state.skipAssembly = () => {
      state.snapRestPose();
      onIntroCompleteRef.current?.();
    };

    state.restartAssembly = () => {
      state.isExploded = false;
      state.explodeTarget = 0;
      state.explodeCurrent = 0;
      state.bookOpen = false;
      state.bookOpenCurrent = 0;
      state.shieldPopped = false;
      state.shieldPopCurrent = 0;
      state.laurelsSpread = false;
      state.laurelsSpreadCurrent = 0;
      state.pillarRaised = false;
      state.pillarRaisedCurrent = 0;
      state.globeSpinVel = 0;
      state.hoveredPiece = null;
      state.resettingCamera = false;
      state.introElapsed = 0;
      state.introSignaled = false;
      state.lastRoman = 'I';

      setIsExploded(false);
      setBookOpen(false);
      setShieldPopped(false);
      setLaurelsSpread(false);
      setPillarRaised(false);
      setHoveredPiece(null);
      setActivePiece(null);
      setAssemblyStage({ roman: 'I', label: 'Stepped Navy & Brass Plinth' });

      controls.enabled = false;
      controls.autoRotate = false;
      introCompleteRef.current = false;
      wakeActiveLoop();
    };

    const pickPieceAtPointer = (
      clientX: number,
      clientY: number
    ): MonumentPieceId | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObject(monument.rootGroup, true);
      return (hits[0]?.object?.userData?.pieceId ??
        null) as MonumentPieceId | null;
    };

    // Throttled hover raycasting + click-to-trigger per-piece mechanics
    let pointerStartX = 0;
    let pointerStartY = 0;
    let activePointerId = -1;
    let lastHoverRaycast = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (!introCompleteRef.current) return;
      activePointerId = e.pointerId;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!introCompleteRef.current || activePointerId !== -1) return;
      const now = performance.now();
      if (now - lastHoverRaycast < 42) return;
      lastHoverRaycast = now;

      const hit = pickPieceAtPointer(e.clientX, e.clientY);
      if (hit !== state.hoveredPiece) {
        state.hoveredPiece = hit;
        setHoveredPiece(hit);
        wakeActiveLoop();
      }
    };

    const onPointerLeave = () => {
      if (state.hoveredPiece !== null) {
        state.hoveredPiece = null;
        setHoveredPiece(null);
        wakeActiveLoop();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (activePointerId !== e.pointerId) return;
      activePointerId = -1;
      if (!introCompleteRef.current) return;

      const travel = Math.hypot(
        e.clientX - pointerStartX,
        e.clientY - pointerStartY
      );
      if (travel >= 6) return;

      const hitPiece = pickPieceAtPointer(e.clientX, e.clientY);
      if (!hitPiece) {
        if (state.isExploded) {
          state.toggleExplode();
        }
        return;
      }

      setActivePiece(hitPiece);
      wakeActiveLoop();

      switch (hitPiece) {
        case 'globe':
          state.globeSpinVel = 15.0;
          setGlobeSpinCount((c) => c + 1);
          break;
        case 'shield':
          state.shieldPopped = !state.shieldPopped;
          setShieldPopped(state.shieldPopped);
          break;
        case 'book':
          state.bookOpen = !state.bookOpen;
          setBookOpen(state.bookOpen);
          break;
        case 'laurels':
          state.laurelsSpread = !state.laurelsSpread;
          setLaurelsSpread(state.laurelsSpread);
          break;
        case 'pillar':
          state.pillarRaised = !state.pillarRaised;
          setPillarRaised(state.pillarRaised);
          break;
        case 'plinth':
          state.toggleExplode();
          break;
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Offscreen, context-safety, & adaptive 60fps-active / 30fps-idle loop
    let isInView = true;
    let isDisposed = false;
    let isContextLost = false;
    let isOrbiting = false;
    let rafId = 0;
    let afterDrawTimer = 0;
    let idleTimer = 0;
    let lastTime = performance.now();

    const stopLoop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (afterDrawTimer) {
        window.clearTimeout(afterDrawTimer);
        afterDrawTimer = 0;
      }
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = 0;
      }
    };

    const wakeActiveLoop = () => {
      if (isDisposed || !isInView || document.hidden || isContextLost) return;
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = 0;
      }
      if (!rafId && !afterDrawTimer) {
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };

    const afterDraw = (cb: (ts: number) => void) => {
      const gl = renderer.getContext();
      if (
        gl &&
        'fenceSync' in gl &&
        typeof (gl as WebGL2RenderingContext).fenceSync === 'function'
      ) {
        const gl2 = gl as WebGL2RenderingContext;
        const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl2.deleteSync(sync);
        }
      }
      afterDrawTimer = window.setTimeout(() => {
        afterDrawTimer = 0;
        if (isInView && !document.hidden && !isDisposed && !isContextLost) {
          rafId = requestAnimationFrame(cb);
        }
      }, 72);
    };

    const tick = (now: number) => {
      rafId = 0;
      if (isDisposed || !isInView || document.hidden || isContextLost) return;

      const dt = Math.min(Math.max((now - lastTime) / 1000, 0.001), 0.06);
      lastTime = now;

      let needsHighRate = false;

      if (!introCompleteRef.current) {
        // PHASE A: In-place 6-piece assembly inside the Hero 3D canvas
        needsHighRate = true;
        controls.enabled = false;
        controls.autoRotate = false;
        state.introElapsed += dt;

        const pose = evaluateIntroFramePose(state.introElapsed);

        applyPiecePose(monument.pieceGroups.plinth, pose.plinth);
        applyPiecePose(monument.pieceGroups.book, pose.book);
        monument.leftBookWing.rotation.z = -pose.bookWingAngle;
        monument.rightBookWing.rotation.z = pose.bookWingAngle;

        applyPiecePose(monument.pieceGroups.laurels, pose.laurels);
        monument.leftWreathGroup.position.set(pose.leftWreathOffsetX, 0, 0);
        monument.leftWreathGroup.rotation.z = pose.leftWreathTiltZ;
        monument.rightWreathGroup.position.set(pose.rightWreathOffsetX, 0, 0);
        monument.rightWreathGroup.rotation.z = pose.rightWreathTiltZ;

        applyPiecePose(monument.pieceGroups.globe, pose.globe);
        monument.globeSphere.rotation.y = pose.globeSphereRotY;

        applyPiecePose(monument.pieceGroups.pillar, pose.pillar);
        applyPiecePose(monument.pieceGroups.shield, pose.shield);

        const shadowMat = monument.shadowMesh
          .material as THREE.MeshBasicMaterial;
        shadowMat.opacity = pose.shadowOpacity;

        camera.position.set(
          pose.cameraPos[0],
          pose.cameraPos[1],
          pose.cameraPos[2]
        );
        camera.lookAt(_defaultTarget);

        if (assemblyRuleRef.current) {
          assemblyRuleRef.current.style.transform = `scaleX(${Math.max(0.04, pose.assemblyProgress).toFixed(3)})`;
        }

        if (state.lastRoman !== pose.activeStageRoman) {
          state.lastRoman = pose.activeStageRoman;
          container.dataset.introStage = pose.activeStageRoman;
          setAssemblyStage({
            roman: pose.activeStageRoman,
            label: pose.activeStageLabel,
          });
        }

        if (pose.isShowcaseReady && !state.introSignaled) {
          state.introSignaled = true;
          introCompleteRef.current = true;
          container.dataset.introStage = 'I–VI';
          container.dataset.assemblyProgress = '1.000';
          applyRestPoseFromAssembly();
          controls.enabled = true;
          controls.update();
          onIntroCompleteRef.current?.();
        }
      } else {
        // PHASE B: Live interactive 360-degree showcase in exact same position
        controls.enabled = true;
        controls.autoRotate =
          !isSoftwareGl &&
          !reducedMotion &&
          now > state.manualPauseUntil &&
          !state.resettingCamera &&
          state.hoveredPiece === null;

        const dampSpeed = reducedMotion ? 40 : 6.4;
        state.explodeCurrent = THREE.MathUtils.damp(
          state.explodeCurrent,
          state.explodeTarget,
          dampSpeed,
          dt
        );
        state.bookOpenCurrent = THREE.MathUtils.damp(
          state.bookOpenCurrent,
          state.bookOpen ? 1 : 0,
          dampSpeed,
          dt
        );
        state.shieldPopCurrent = THREE.MathUtils.damp(
          state.shieldPopCurrent,
          state.shieldPopped ? 1 : 0,
          dampSpeed,
          dt
        );
        state.laurelsSpreadCurrent = THREE.MathUtils.damp(
          state.laurelsSpreadCurrent,
          state.laurelsSpread ? 1 : 0,
          dampSpeed,
          dt
        );
        state.pillarRaisedCurrent = THREE.MathUtils.damp(
          state.pillarRaisedCurrent,
          state.pillarRaised ? 1 : 0,
          dampSpeed,
          dt
        );

        let anyHoverTransition = false;
        for (const id of PIECE_IDS) {
          const target = state.hoveredPiece === id ? 1 : 0;
          state.hoverAlpha[id] = THREE.MathUtils.damp(
            state.hoverAlpha[id],
            target,
            10.5,
            dt
          );
          const h = state.hoverAlpha[id];
          if (Math.abs(target - h) > 0.004) {
            anyHoverTransition = true;
          }
          const mats = monument.pieceMaterials[id];
          for (let i = 0; i < mats.length; i++) {
            mats[i].emissive.setRGB(0.14 * h, 0.095 * h, 0.025 * h);
          }
        }

        const p = state.explodeCurrent;
        const b = state.bookOpenCurrent;
        const sh = state.shieldPopCurrent;
        const la = state.laurelsSpreadCurrent;
        const pi = state.pillarRaisedCurrent;
        const ha = state.hoverAlpha;

        monument.pieceGroups.plinth.position.y = ha.plinth * 0.035;

        monument.pieceGroups.book.position.y =
          0.84 + p * 0.24 + b * 0.16 + ha.book * 0.06;
        const wingAngle = 0.22 - b * 0.2;
        monument.leftBookWing.rotation.z = -wingAngle;
        monument.rightBookWing.rotation.z = wingAngle;

        const wreathX = p * 0.46 + la * 0.24 + ha.laurels * 0.05;
        const wreathY = p * 0.14 + la * 0.08 + ha.laurels * 0.05;
        const wreathTilt = la * 0.15;
        monument.leftWreathGroup.position.set(-wreathX, wreathY, 0);
        monument.leftWreathGroup.rotation.z = wreathTilt;
        monument.rightWreathGroup.position.set(wreathX, wreathY, 0);
        monument.rightWreathGroup.rotation.z = -wreathTilt;

        if (Math.abs(state.globeSpinVel) > 0.01) {
          monument.globeSphere.rotation.y += state.globeSpinVel * dt;
          state.globeSpinVel *= Math.exp(-2.1 * dt);
        }
        monument.pieceGroups.globe.position.y =
          2.08 + p * 0.28 + ha.globe * 0.075;
        monument.pieceGroups.globe.position.z = -0.22 - p * 0.46;

        monument.pieceGroups.pillar.position.y =
          0.89 + p * 0.3 + pi * 0.24 + ha.pillar * 0.07;
        monument.pieceGroups.pillar.position.z = 0.74 + p * 0.34;

        monument.pieceGroups.shield.position.y =
          2.38 + p * 0.62 + sh * 0.14 + ha.shield * 0.08;
        monument.pieceGroups.shield.position.z =
          0.77 + p * 0.54 + sh * 0.42 + ha.shield * 0.05;
        monument.pieceGroups.shield.rotation.x = -sh * 0.14;

        monument.guideMaterials.forEach((mat) => {
          mat.opacity = p * 0.35;
        });

        if (state.resettingCamera) {
          camera.position.lerp(_defaultCamPos, 1 - Math.exp(-5.5 * dt));
          controls.target.lerp(_defaultTarget, 1 - Math.exp(-5.5 * dt));
          if (camera.position.distanceTo(_defaultCamPos) < 0.02) {
            camera.position.copy(_defaultCamPos);
            controls.target.copy(_defaultTarget);
            state.resettingCamera = false;
          }
        }

        const anySpringActive =
          isOrbiting ||
          state.resettingCamera ||
          now < state.manualPauseUntil ||
          anyHoverTransition ||
          Math.abs(state.globeSpinVel) > 0.02 ||
          Math.abs(state.explodeTarget - state.explodeCurrent) > 0.002 ||
          Math.abs((state.bookOpen ? 1 : 0) - state.bookOpenCurrent) > 0.002 ||
          Math.abs((state.shieldPopped ? 1 : 0) - state.shieldPopCurrent) > 0.002 ||
          Math.abs((state.laurelsSpread ? 1 : 0) - state.laurelsSpreadCurrent) > 0.002 ||
          Math.abs((state.pillarRaised ? 1 : 0) - state.pillarRaisedCurrent) > 0.002;

        needsHighRate = anySpringActive;
        controls.update();
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else if (needsHighRate) {
        rafId = requestAnimationFrame(tick);
      } else if (controls.autoRotate) {
        // Gentle slow idle turntable spin at ~30fps to minimize GPU usage
        idleTimer = window.setTimeout(() => {
          idleTimer = 0;
          if (!isDisposed && isInView && !document.hidden && !isContextLost) {
            rafId = requestAnimationFrame(tick);
          }
        }, 33);
      }
    };

    const startLoop = () => {
      if (isDisposed || rafId || afterDrawTimer || isContextLost) return;
      lastTime = performance.now();
      rafId = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        isInView = visible;
        if (visible && !document.hidden && !isContextLost) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(container);

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else if (isInView && !isContextLost) {
        startLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      stopLoop();
    };
    const onContextRestored = () => {
      isContextLost = false;
      if (isInView && !document.hidden) {
        startLoop();
      }
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      onContextRestored
    );

    const syncMobileCameraFraming = (w: number, h: number) => {
      const aspect = w / h;
      const targetFov = w < 420 || aspect < 1.0 ? 40 : 35;
      if (camera.fov !== targetFov) {
        camera.fov = targetFov;
      }
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    };

    syncMobileCameraFraming(initialW, initialH);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.max(entry.contentRect.width, 240);
      const h = Math.max(entry.contentRect.height, 260);
      syncMobileCameraFraming(w, h);
      renderer.setPixelRatio(
        isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5)
      );
      renderer.setSize(w, h, false);
      if (isInView && !document.hidden && !isContextLost) {
        renderer.render(scene, camera);
      }
    });
    resizeObserver.observe(mount);

    if (!introCompleteRef.current) {
      const startPose = evaluateIntroFramePose(0);
      applyPiecePose(monument.pieceGroups.plinth, startPose.plinth);
      applyPiecePose(monument.pieceGroups.book, startPose.book);
      applyPiecePose(monument.pieceGroups.laurels, startPose.laurels);
      applyPiecePose(monument.pieceGroups.globe, startPose.globe);
      applyPiecePose(monument.pieceGroups.pillar, startPose.pillar);
      applyPiecePose(monument.pieceGroups.shield, startPose.shield);
      camera.position.set(
        startPose.cameraPos[0],
        startPose.cameraPos[1],
        startPose.cameraPos[2]
      );
      camera.lookAt(_defaultTarget);
      container.dataset.introStage = startPose.activeStageRoman;
      container.dataset.assemblyProgress = '0.000';
    } else {
      applyRestPoseFromAssembly();
      container.dataset.introStage = 'I–VI';
      container.dataset.assemblyProgress = '1.000';
    }

    renderer.render(scene, camera);
    startLoop();

    return () => {
      isDisposed = true;
      stopLoop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        onContextRestored
      );

      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('end', handleControlsEnd);
      controls.dispose();

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);

      monument.dispose();
      envMap.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Synchronize external Skip Intro or reduced-motion completion
  useEffect(() => {
    if (introComplete && !introCompleteRef.current) {
      controlRef.current.snapRestPose();
    } else {
      introCompleteRef.current = introComplete;
    }
  }, [introComplete]);

  // Synchronize Replay Atlas Intro trigger from Footer
  useEffect(() => {
    if (introRunId > 0) {
      controlRef.current.restartAssembly();
    }
  }, [introRunId]);

  const hasAnyActiveState =
    isExploded ||
    bookOpen ||
    shieldPopped ||
    laurelsSpread ||
    pillarRaised ||
    globeSpinCount > 0;

  const focusedId = hoveredPiece ?? activePiece;
  const focusedMeta = focusedId ? MONUMENT_PIECE_META[focusedId] : null;

  return (
    <div
      ref={containerRef}
      data-testid="hero-monument"
      data-intro-complete={introComplete ? 'true' : 'false'}
      data-intro-stage={introComplete ? 'I–VI' : assemblyStage.roman}
      data-assembly-progress={introComplete ? '1.000' : '0.000'}
      data-monument-exploded={isExploded ? 'true' : 'false'}
      data-hovered-piece={hoveredPiece ?? 'none'}
      data-active-piece={activePiece ?? 'none'}
      data-book-open={bookOpen ? 'true' : 'false'}
      data-shield-popped={shieldPopped ? 'true' : 'false'}
      data-laurels-spread={laurelsSpread ? 'true' : 'false'}
      data-pillar-raised={pillarRaised ? 'true' : 'false'}
      data-globe-spins={String(globeSpinCount)}
      className="relative flex w-full max-w-[490px] flex-col items-center select-none"
    >
      {/* Freestanding 3D Sculpture WebGL Mount (Exact same coordinates for assembly & showcase) */}
      <div
        ref={mountRef}
        aria-label="Interactive 3D sculptural LISMUN monument on a stepped navy and brass plinth. Drag to orbit 360 degrees, hover to lift pieces, and click the globe, shield, book, laurels, pillar, or plinth to animate each component."
        className={`relative h-[340px] w-full sm:h-[400px] lg:h-[450px] ${
          !introComplete
            ? 'cursor-default'
            : isGrabbing
              ? 'cursor-grabbing'
              : hoveredPiece
                ? 'cursor-pointer'
                : 'cursor-grab'
        }`}
      />

      {/* Unified Dock Beneath Plinth: Assembly Pace -> Seamless Showcase Controls */}
      <div className="mt-1 flex min-h-[84px] w-full max-w-[440px] flex-col items-center text-center">
        {!introComplete ? (
          <div
            data-testid="hero-assembly-dock"
            className="flex flex-col items-center gap-2.5 transition-opacity duration-300"
          >
            <p className="font-mono text-[10.5px] tracking-[0.22em] text-[#D5BD8B] uppercase">
              {assemblyStage.roman} · {assemblyStage.label}
            </p>
            <div className="h-px w-36 overflow-hidden bg-[#263D59]/60">
              <div
                ref={assemblyRuleRef}
                aria-hidden="true"
                className="h-full w-full origin-left bg-[#D5BD8B]"
                style={{ transform: 'scaleX(0.04)' }}
              />
            </div>
            <button
              type="button"
              data-testid="skip-intro-btn"
              onClick={() => controlRef.current.skipAssembly()}
              className="mt-1 inline-flex items-center gap-2 border border-[#B89A62]/45 bg-[#071426]/85 px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] text-[#E8E1D2]/85 uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#E8E1D2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
            >
              <span>Skip Intro</span>
              <ArrowRight className="h-3 w-3 text-[#D5BD8B]" />
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center">
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                data-testid="monument-explode-btn"
                onClick={() => controlRef.current.toggleExplode()}
                className="inline-flex items-center gap-2 border border-[#B89A62]/45 bg-[#071426]/85 px-3.5 py-1.5 font-mono text-[10.5px] tracking-[0.18em] text-[#D5BD8B] uppercase transition-colors hover:border-[#D5BD8B] hover:text-[#E8E1D2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>
                  {isExploded ? 'Assemble Emblem' : 'Separate Pieces'}
                </span>
              </button>

              <button
                type="button"
                data-testid="monument-reset-btn"
                onClick={() => controlRef.current.resetAll()}
                className="inline-flex items-center gap-1.5 border border-[#263D59]/70 bg-[#071426]/60 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.16em] text-[#E8E1D2]/75 uppercase transition-colors hover:border-[#B89A62]/60 hover:text-[#E8E1D2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Pose</span>
              </button>

              {hasAnyActiveState && (
                <button
                  type="button"
                  data-testid="monument-register-btn"
                  onClick={onOpenRegistration}
                  className="inline-flex items-center gap-1.5 border border-[#D5BD8B]/65 bg-[#0D1E36] px-3.5 py-1.5 font-mono text-[10.5px] tracking-[0.18em] text-[#E8E1D2] uppercase transition-colors hover:bg-[#132948] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D5BD8B]"
                >
                  <span>Register</span>
                  <ArrowRight className="h-3 w-3 text-[#D5BD8B]" />
                </button>
              )}
            </div>

            <div
              data-testid="monument-caption"
              className="mt-3 min-h-[2.6rem] text-center"
            >
              {focusedMeta ? (
                <>
                  <p className="font-mono text-[10.5px] tracking-[0.2em] text-[#D5BD8B] uppercase">
                    {focusedMeta.title}
                  </p>
                  <p className="mt-0.5 font-sans text-xs text-[#E8E1D2]/72">
                    {hoveredPiece
                      ? focusedMeta.actionHint
                      : focusedMeta.subtitle}
                  </p>
                </>
              ) : (
                <p className="font-mono text-[10.5px] tracking-[0.19em] text-[#B89A62]/80 uppercase">
                  Drag 360° to Orbit · Hover to Lift · Click Any Piece to
                  Animate
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
