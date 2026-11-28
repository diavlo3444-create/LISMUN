import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';
import {
  EXECUTIVE_BOARD_MEMBERS,
  type ChessPieceType,
  type ExecutiveBoardMember,
} from '../../data/executiveBoardData';
import { prefersReducedMotion } from '../../utils/atlasAnimations';
import {
  createChessPieceKit,
  getSquareSurfaceY,
  getSquareWorldXZ,
} from './chessPieceGeometry';

interface ExecutiveChessboardCanvasProps {
  selectedMemberId: string | null;
  highlightedPieceType: ChessPieceType | null;
  activeDepartment?: string | null;
  onSelectMember: (member: ExecutiveBoardMember | null) => void;
  onResetView?: () => void;
  onFallbackRequested?: () => void;
}

const SOFTWARE_GL_REGEX =
  /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

// Pre-allocated math helpers outside render loop
const _raycaster = new THREE.Raycaster();
_raycaster.layers.set(1);
const _pointer = new THREE.Vector2();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();

function detectSoftwareWebGL(): { available: boolean; isSoftware: boolean } {
  try {
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ||
      probe.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    if (!gl) return { available: false, isSoftware: true };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER)
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { available: true, isSoftware: SOFTWARE_GL_REGEX.test(rendererStr) };
  } catch {
    return { available: false, isSoftware: true };
  }
}

function getBoardOverviewPose(width: number, height: number) {
  const aspect = Math.max(0.5, width / Math.max(1, height));
  const distFactor =
    aspect < 0.72
      ? 1.92
      : aspect < 0.92
        ? 1.56
        : aspect < 1.18
          ? 1.28
          : aspect < 1.38
            ? 1.12
            : 1.04;

  return {
    pos: new THREE.Vector3(0.35 * distFactor, 9.8 * distFactor, 12.1 * distFactor),
    look: new THREE.Vector3(0, -0.18, 0.45),
  };
}

export const ExecutiveChessboardCanvas: React.FC<
  ExecutiveChessboardCanvasProps
> = ({
  selectedMemberId,
  highlightedPieceType,
  activeDepartment = null,
  onSelectMember,
  onResetView,
  onFallbackRequested,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const selectedIdRef = useRef<string | null>(selectedMemberId);
  selectedIdRef.current = selectedMemberId;
  const highlightedTypeRef = useRef<ChessPieceType | null>(highlightedPieceType);
  highlightedTypeRef.current = highlightedPieceType;
  const activeDeptRef = useRef<string | null>(
    activeDepartment && activeDepartment !== 'ALL' ? activeDepartment : null
  );
  activeDeptRef.current =
    activeDepartment && activeDepartment !== 'ALL' ? activeDepartment : null;
  const onSelectRef = useRef(onSelectMember);
  onSelectRef.current = onSelectMember;
  const onFallbackRef = useRef(onFallbackRequested);
  onFallbackRef.current = onFallbackRequested;

  const [hoveredMember, setHoveredMember] =
    useState<ExecutiveBoardMember | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const cameraActionsRef = useRef<{
    zoomBy: (factor: number) => void;
    focusMember: (member: ExecutiveBoardMember | null) => void;
    focusOverview: () => void;
    requestTick: () => void;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const containerEl = containerRef.current;
    if (!mount || !containerEl) return;

    const probe = detectSoftwareWebGL();
    if (!probe.available) {
      onFallbackRef.current?.();
      return;
    }

    const isSoftwareGl = probe.isSoftware;
    const reducedMotion = prefersReducedMotion();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      onFallbackRef.current?.();
      return;
    }

    const initW = Math.max(300, containerEl.clientWidth);
    const initH = Math.max(320, containerEl.clientHeight);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(initW, initH);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x030914, 1);

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y pinch-zoom';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030914);
    scene.fog = new THREE.FogExp2(0x030914, 0.0022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(36, initW / initH, 0.2, 160);
    const overview = getBoardOverviewPose(initW, initH);
    camera.position.copy(overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(overview.look);
    controls.enableDamping = !isSoftwareGl && !reducedMotion;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 3.0;
    controls.maxDistance = 42.0;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI * 0.44;
    controls.rotateSpeed = 0.72;
    controls.zoomSpeed = 0.9;
    controls.update();

    // Warm / Cool Diplomatic Studio Lighting Rig centered on the single 8x8 board (<= 1 shadow caster)
    const hemi = new THREE.HemisphereLight(0x83b5ed, 0x081020, 1.0);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe6ba, 2.25);
    keyLight.position.set(6.5, 16, 11);
    keyLight.target.position.set(0, 0, 0);
    scene.add(keyLight.target);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 42;
      keyLight.shadow.camera.left = -7.5;
      keyLight.shadow.camera.right = 7.5;
      keyLight.shadow.camera.top = 7.5;
      keyLight.shadow.camera.bottom = -7.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x83b5ed, 1.15);
    rimLight.position.set(-7, 7, -10);
    rimLight.target.position.set(0, 0, 0);
    scene.add(rimLight.target);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      const warmFillWest = new THREE.PointLight(0xd5bd8b, 2.1, 22, 1.4);
      warmFillWest.position.set(-4.2, 4.2, 4.5);
      scene.add(warmFillWest);

      const warmFillEast = new THREE.PointLight(0xd5bd8b, 2.0, 22, 1.4);
      warmFillEast.position.set(4.2, 4.2, -4.5);
      scene.add(warmFillEast);
    }

    // Soft radial-fade plinth shadow beneath the single 8x8 chessboard
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 256;
    floorCanvas.height = 256;
    const fctx = floorCanvas.getContext('2d');
    if (fctx) {
      const grad = fctx.createRadialGradient(128, 128, 28, 128, 128, 124);
      grad.addColorStop(0, 'rgba(255,255,255,0.65)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      fctx.fillStyle = grad;
      fctx.fillRect(0, 0, 256, 256);
    }
    const floorAlphaTex = new THREE.CanvasTexture(floorCanvas);

    const floorGeo = new THREE.PlaneGeometry(14.5, 14.5);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x01040a,
      transparent: true,
      alphaMap: floorAlphaTex,
      depthWrite: false,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -0.37, 0);
    scene.add(floorMesh);

    const maxAnisotropy = isSoftwareGl
      ? 1
      : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const kit = createChessPieceKit(maxAnisotropy, isSoftwareGl);
    const { rootGroup: boardStructure, departmentHighlights } =
      kit.buildBoardStructure();
    scene.add(boardStructure);

    interface PieceRig {
      member: ExecutiveBoardMember;
      group: THREE.Group;
      hitMesh: THREE.Mesh;
      haloRing: THREE.Mesh;
      pieceRoot: THREE.Group;
      baseY: number;
      currentLift: number;
      currentHaloOpacity: number;
    }

    const pieceRigs: PieceRig[] = [];
    const hitMeshes: THREE.Mesh[] = [];
    const rigById = new Map<string, PieceRig>();

    for (const member of EXECUTIVE_BOARD_MEMBERS) {
      const built = kit.buildMemberPiece(member);
      scene.add(built.group);
      const rig: PieceRig = {
        member,
        ...built,
        currentLift: 0,
        currentHaloOpacity: 0,
      };
      pieceRigs.push(rig);
      hitMeshes.push(built.hitMesh);
      rigById.set(member.id, rig);
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Camera transition state
    let cameraAnimating = false;
    let isUpdatingControls = false;
    let hoveredId: string | null = null;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTickMs = performance.now();

    function scheduleSoftwareFinish(done: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(done, 24);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      let polls = 0;
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        polls += 1;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && polls < 8) {
          frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(done, 24);
        }
      };
      frameId = window.setTimeout(poll, 6);
    }

    function stepAndRender() {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min(0.05, Math.max(0.001, (now - lastTickMs) / 1000));
      lastTickMs = now;

      let needsMoreFrames = false;

      if (cameraAnimating) {
        if (reducedMotion || isSoftwareGl) {
          camera.position.copy(_targetCamPos);
          controls.target.copy(_targetLookAt);
          cameraAnimating = false;
        } else {
          const lambda = 6.5;
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            _targetCamPos.x,
            lambda,
            delta
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            _targetCamPos.y,
            lambda,
            delta
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            _targetCamPos.z,
            lambda,
            delta
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            _targetLookAt.x,
            lambda,
            delta
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            _targetLookAt.y,
            lambda,
            delta
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            _targetLookAt.z,
            lambda,
            delta
          );

          const posDist = camera.position.distanceTo(_targetCamPos);
          const tgtDist = controls.target.distanceTo(_targetLookAt);
          if (posDist < 0.015 && tgtDist < 0.015) {
            camera.position.copy(_targetCamPos);
            controls.target.copy(_targetLookAt);
            cameraAnimating = false;
          } else {
            needsMoreFrames = true;
          }
        }
      }

      const activeSelectedId = selectedIdRef.current;
      const activeLegendType = highlightedTypeRef.current;
      const activeDept = activeDeptRef.current;

      for (const [deptName, hlMat] of departmentHighlights.entries()) {
        const targetZoneOpacity = activeDept === deptName ? 0.24 : 0;
        if (reducedMotion || isSoftwareGl) {
          hlMat.opacity = targetZoneOpacity;
        } else {
          hlMat.opacity = THREE.MathUtils.damp(
            hlMat.opacity,
            targetZoneOpacity,
            10,
            delta
          );
          if (Math.abs(hlMat.opacity - targetZoneOpacity) > 0.008) {
            needsMoreFrames = true;
          }
        }
      }

      for (const rig of pieceRigs) {
        const isSelected = rig.member.id === activeSelectedId;
        const isHovered = rig.member.id === hoveredId;
        const isLegendMatch =
          activeLegendType !== null &&
          rig.member.pieceType === activeLegendType;
        const isDeptMatch =
          activeDept !== null &&
          (rig.member.departments.includes(activeDept) ||
            rig.member.department === activeDept);

        const targetLift = isSelected
          ? 0.2
          : isHovered
            ? 0.08
            : isLegendMatch || isDeptMatch
              ? 0.055
              : 0;
        const targetHalo = isSelected
          ? 0.92
          : isHovered
            ? 0.62
            : isLegendMatch || isDeptMatch
              ? 0.48
              : 0;

        const haloMat = rig.haloRing.material as THREE.MeshBasicMaterial;
        haloMat.color.setHex(
          isSelected
            ? 0xf0dfb8
            : isLegendMatch || isDeptMatch
              ? 0x83b5ed
              : 0xd5bd8b
        );

        if (reducedMotion || isSoftwareGl) {
          rig.currentLift = targetLift;
          rig.currentHaloOpacity = targetHalo;
        } else {
          rig.currentLift = THREE.MathUtils.damp(
            rig.currentLift,
            targetLift,
            10,
            delta
          );
          rig.currentHaloOpacity = THREE.MathUtils.damp(
            rig.currentHaloOpacity,
            targetHalo,
            10,
            delta
          );
          if (
            Math.abs(rig.currentLift - targetLift) > 0.004 ||
            Math.abs(rig.currentHaloOpacity - targetHalo) > 0.01
          ) {
            needsMoreFrames = true;
          }
        }

        rig.pieceRoot.position.y = rig.currentLift;
        haloMat.opacity = rig.currentHaloOpacity;
        const ringScale = isSelected ? 1.12 : 1.0;
        rig.haloRing.scale.setScalar(ringScale);
      }

      isUpdatingControls = true;
      controls.update();
      isUpdatingControls = false;
      renderer.render(scene, camera);

      if (needsMoreFrames) {
        requestRender();
      }
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        stepAndRender();
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) scheduleSoftwareFinish(done);
        else done();
      });
    }

    function focusOverviewCamera() {
      const w = containerEl?.clientWidth || initW;
      const h = containerEl?.clientHeight || initH;
      const ov = getBoardOverviewPose(w, h);
      _targetCamPos.copy(ov.pos);
      _targetLookAt.copy(ov.look);
      if (containerEl) {
        containerEl.dataset.cameraMode = 'overview';
      }
      cameraAnimating = true;
      requestRender();
    }

    function focusMemberCamera(member: ExecutiveBoardMember | null) {
      if (!member) {
        focusOverviewCamera();
        return;
      }
      const { x, z } = getSquareWorldXZ(member.boardRow, member.boardCol);
      const y = getSquareSurfaceY();

      const framing =
        member.pieceType === 'king'
          ? { lookY: 0.88, camY: 2.88, zDist: 3.65, xDist: 1.9 }
          : member.pieceType === 'queen'
            ? { lookY: 0.78, camY: 2.68, zDist: 3.4, xDist: 1.75 }
            : member.pieceType === 'pawn'
              ? { lookY: 0.48, camY: 2.15, zDist: 2.85, xDist: 1.45 }
              : { lookY: 0.66, camY: 2.48, zDist: 3.15, xDist: 1.65 };

      _targetLookAt.set(x, y + framing.lookY, z);

      const zOffset =
        member.side === 'gold' ? framing.zDist : framing.zDist + 0.15;
      const xOffset = x >= 0 ? -framing.xDist : framing.xDist;
      _targetCamPos.set(x + xOffset, y + framing.camY, z + zOffset);
      if (containerEl) containerEl.dataset.cameraMode = 'member';

      cameraAnimating = true;
      requestRender();
    }

    cameraActionsRef.current = {
      zoomBy: (factor: number) => {
        cameraAnimating = false;
        const offset = camera.position.clone().sub(controls.target);
        const nextDist = THREE.MathUtils.clamp(
          offset.length() * factor,
          controls.minDistance,
          controls.maxDistance
        );
        offset.setLength(nextDist);
        camera.position.copy(controls.target).add(offset);
        isUpdatingControls = true;
        controls.update();
        isUpdatingControls = false;
        requestRender();
      },
      focusMember: focusMemberCamera,
      focusOverview: focusOverviewCamera,
      requestTick: requestRender,
    };

    const handleControlsStart = () => {
      cameraAnimating = false;
    };
    const handleControlsChange = () => {
      if (!isUpdatingControls) {
        requestRender();
      }
    };
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);

    // Raycast tap / hover
    let downX = 0;
    let downY = 0;
    let lastMoveCheck = 0;

    const updatePointerNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    };

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (dx * dx + dy * dy > 36) return;

      updatePointerNdc(e.clientX, e.clientY);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.memberId as string | undefined;
        const rig = hitId ? rigById.get(hitId) : undefined;
        if (rig) {
          onSelectRef.current(rig.member);
          focusMemberCamera(rig.member);
          return;
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMoveCheck < 45) return;
      lastMoveCheck = now;

      updatePointerNdc(e.clientX, e.clientY);
      _raycaster.setFromCamera(_pointer, camera);
      const hits = _raycaster.intersectObjects(hitMeshes, false);
      const nextHover =
        hits.length > 0
          ? ((hits[0].object.userData.memberId as string | undefined) ?? null)
          : null;

      if (nextHover !== hoveredId) {
        hoveredId = nextHover;
        renderer.domElement.style.cursor = hoveredId ? 'pointer' : 'grab';
        const rig = hoveredId ? rigById.get(hoveredId) : undefined;
        setHoveredMember(rig ? rig.member : null);
        requestRender();
      }
    };

    const handlePointerLeave = () => {
      if (hoveredId !== null) {
        hoveredId = null;
        renderer.domElement.style.cursor = 'grab';
        setHoveredMember(null);
        requestRender();
      }
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored
    );
    renderer.domElement.style.cursor = 'grab';

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      const w = Math.max(260, containerEl.clientWidth);
      const h = Math.max(300, containerEl.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (!selectedIdRef.current && !cameraAnimating) {
        const ov = getBoardOverviewPose(w, h);
        camera.position.copy(ov.pos);
        controls.target.copy(ov.look);
        isUpdatingControls = true;
        controls.update();
        isUpdatingControls = false;
      }
      requestRender();
    });
    resizeObserver.observe(containerEl);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener(
        'pointerleave',
        handlePointerLeave
      );
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored
      );
      floorGeo.dispose();
      floorMat.dispose();
      floorAlphaTex.dispose();
      envTex.dispose();
      kit.dispose();
      renderer.dispose();
      cameraActionsRef.current = null;
    };
  }, []);

  // Sync external member selection with 3D camera
  useEffect(() => {
    const actions = cameraActionsRef.current;
    if (!actions) return;
    if (selectedMemberId !== null) {
      const member =
        EXECUTIVE_BOARD_MEMBERS.find((m) => m.id === selectedMemberId) ?? null;
      actions.focusMember(member);
    } else {
      actions.focusOverview();
    }
  }, [selectedMemberId]);

  useEffect(() => {
    cameraActionsRef.current?.requestTick();
  }, [highlightedPieceType, activeDepartment]);

  return (
    <div
      ref={containerRef}
      data-testid="executive-chessboard-stage"
      data-selected-member={selectedMemberId ?? ''}
      data-active-department={activeDepartment ?? 'ALL'}
      className="relative h-[460px] w-full overflow-hidden border border-[#B89A62]/35 bg-[#030914] sm:h-[540px] lg:h-[600px]"
    >
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={mountRef}
        className="h-full w-full"
        aria-label="Interactive 3D Executive Board Chessboard. Single 8 by 8 chessboard housing all 46 Executive Board members. Drag to orbit, scroll to zoom, and click any chess piece to inspect the Executive Board member."
      />

      {contextLost && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#030914]/95 p-6 text-center">
          <p className="font-display text-2xl text-[#E8E1D2]">
            3D Viewport Paused
          </p>
          <p className="mt-2 max-w-md text-xs text-[#E8E1D2]/75">
            Graphics context was suspended. Use the Board Directory below or switch to the Architectural Grid view.
          </p>
          <button
            type="button"
            onClick={() => onFallbackRequested?.()}
            className="mt-4 border border-[#D5BD8B]/50 bg-[#0D1E36] px-4 py-2 font-sans text-xs font-semibold tracking-[0.08em] text-[#E8E1D2] uppercase"
          >
            Open Board Grid View
          </button>
        </div>
      )}

      {/* Subtle hover readout bar */}
      {hoveredMember && (
        <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-[85%] border border-[#B89A62]/45 bg-[#040D1B]/95 px-3.5 py-2">
          <p className="font-mono text-[10px] tracking-[0.14em] text-[#83B5ED] uppercase">
            {hoveredMember.department} · Square {hoveredMember.squareNotation}
          </p>
          <p className="mt-0.5 truncate font-display text-lg font-medium text-[#E8E1D2]">
            {hoveredMember.fullName}
          </p>
          <p className="truncate font-sans text-[11px] text-[#D5BD8B]">
            {hoveredMember.officialPosition}
          </p>
        </div>
      )}

      {/* Compact Bottom Camera Dock */}
      <div className="absolute right-2.5 bottom-2.5 left-2.5 z-10 flex items-center justify-between gap-1.5 sm:right-4 sm:bottom-4 sm:left-4 sm:gap-2">
        <span className="hidden border border-[#B89A62]/30 bg-[#040D1B]/95 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-[#E8E1D2]/75 uppercase sm:inline-block">
          Drag to Orbit · Scroll to Zoom · Click Piece to Inspect
        </span>
        <span className="border border-[#B89A62]/30 bg-[#040D1B]/95 px-2 py-1.5 font-mono text-[9.5px] tracking-[0.06em] text-[#E8E1D2]/75 uppercase whitespace-nowrap sm:hidden">
          Drag · Zoom · Tap
        </span>

        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => cameraActionsRef.current?.zoomBy(0.84)}
            aria-label="Zoom in on chessboard"
            className="inline-flex h-8 w-8 items-center justify-center border border-[#B89A62]/35 bg-[#040D1B]/95 text-[#E8E1D2] transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B] sm:h-9 sm:w-9"
          >
            <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={() => cameraActionsRef.current?.zoomBy(1.18)}
            aria-label="Zoom out of chessboard"
            className="inline-flex h-8 w-8 items-center justify-center border border-[#B89A62]/35 bg-[#040D1B]/95 text-[#E8E1D2] transition-colors hover:border-[#D5BD8B] hover:text-[#D5BD8B] sm:h-9 sm:w-9"
          >
            <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              onSelectMember(null);
              if (onResetView) {
                onResetView();
              } else {
                cameraActionsRef.current?.focusOverview();
              }
            }}
            aria-label="Reset to full chessboard view"
            className="inline-flex h-8 items-center gap-1 border border-[#B89A62]/45 bg-[#071426]/95 px-2 font-mono text-[9.5px] tracking-[0.1em] text-[#D5BD8B] uppercase transition-colors hover:border-[#D5BD8B] hover:bg-[#0D1E36] whitespace-nowrap shrink-0 sm:h-9 sm:gap-1.5 sm:px-3 sm:text-[10px] sm:tracking-[0.14em]"
          >
            {selectedMemberId ? (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="sm:hidden">Full</span>
                <span className="hidden sm:inline">Full Board</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="sm:hidden">Reset</span>
                <span className="hidden sm:inline">Reset View</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveChessboardCanvas;
