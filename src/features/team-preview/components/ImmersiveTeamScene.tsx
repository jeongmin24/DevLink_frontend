import { useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createMemberLaptop } from "../lib/memberLaptop.js";
import { loadAgentCompanionAsset } from '../lib/agentCompanionAsset'
import type { AgentCompanion, AgentCompanionAsset } from '../lib/agentCompanionAsset'
import type { PreviewMember } from '../data/previewData'

interface ImmersiveTeamSceneProps {
  teamName: string
  members: PreviewMember[]
  loading: boolean;
  selectedMemberId: string
  focusedMemberId: string | null
  scrollState: RefObject<{ progress: number }>
  onRenderRequestChange: (requestRender: () => void) => void
  onSelectMember: (id: string) => void
  paused: boolean
  topView: boolean;
  onAvailabilityChange: (available: boolean) => void
}

const MOBILE_BREAKPOINT = 680
const LABEL_SIDE_SWITCH_THRESHOLD = 20;
const TOP_VIEW_POLAR = 0.025;
const TEAM_REVEAL_SECONDS = 0.72;
const MEMBER_REVEAL_RISE = 0.24;
const TEAM_CHARACTER_HEIGHT = 2.1;
const TEAM_CHARACTER_CENTER_Y = 0.24;

async function loadTeamCharacter(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/character.glb`,
  );
  const group = new THREE.Group();
  group.name = "TeamCharacter";
  group.add(gltf.scene);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  if (bounds.isEmpty() || !Number.isFinite(size.y) || size.y <= 0) {
    disposeObjectResources(group);
    throw new Error("팀 캐릭터의 크기를 확인하지 못했습니다.");
  }
  gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
  group.scale.setScalar(TEAM_CHARACTER_HEIGHT / size.y);
  group.rotation.y = -0.28;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.fog = false;
    }
  });
  return group;
}

function disposeObjectResources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const images = new Set<ImageBitmap>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      if (object instanceof THREE.SkinnedMesh && object.skeleton.boneTexture) textures.add(object.skeleton.boneTexture)
    } else if (object instanceof THREE.Sprite) materials.add(object.material)
  })
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value)
    }
  }
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => {
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) images.add(texture.image);
  });
  images.forEach((image) => image.close());
}

export default function ImmersiveTeamScene({ teamName, members, loading, selectedMemberId, focusedMemberId, scrollState, onRenderRequestChange, onSelectMember, paused, topView, onAvailabilityChange }: ImmersiveTeamSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const labelsLayer = useRef<HTMLDivElement>(null)
  const teamLabel = useRef<HTMLDivElement>(null)
  const memberLabels = useRef(new Map<string, HTMLButtonElement>())
  const wake = useRef<() => void>(() => {})
  const control = useRef({ teamName, members, loading, selectedMemberId, focusedMemberId, scrollState, onSelectMember, paused, topView, onAvailabilityChange });

  useEffect(() => {
    control.current = { teamName, members, loading, selectedMemberId, focusedMemberId, scrollState, onSelectMember, paused, topView, onAvailabilityChange };
    wake.current()
  }, [teamName, members, loading, selectedMemberId, focusedMemberId, scrollState, onSelectMember, paused, topView, onAvailabilityChange]);

  useEffect(() => {
    onRenderRequestChange(() => wake.current())
    return () => onRenderRequestChange(() => {})
  }, [onRenderRequestChange])

  useEffect(() => {
    const element = host.current
    const labelsElement = labelsLayer.current
    if (!element) return
    const stage = element.closest<HTMLElement>(".immersive-team-preview");
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      control.current.onAvailabilityChange(false)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0xf3f4f6, 0)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2('#f3f4f6', 0.04)
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80)
    const world = new THREE.Group()
    scene.add(world)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    let environment: THREE.WebGLRenderTarget | undefined
    try {
      environment = pmrem.fromScene(room, 0.04)
      scene.environment = environment.texture
      scene.environmentIntensity = 0.5
    } catch {
      scene.environment = null
    }
    room.dispose()
    pmrem.dispose()

    scene.add(new THREE.HemisphereLight("#ffffff", "#dce0e6", 1.4));
    const key = new THREE.DirectionalLight("#ffffff", 2.6);
    key.position.set(-3, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = key.shadow.camera.bottom = -7
    key.shadow.camera.right = key.shadow.camera.top = 7
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 24
    key.shadow.bias = -0.0003
    key.shadow.normalBias = 0.02
    key.shadow.radius = 4
    scene.add(key)
    const rim = new THREE.DirectionalLight('#ffffff', 0.75)
    rim.position.set(5, 3, -4)
    scene.add(rim)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), new THREE.MeshStandardMaterial({ color: '#f3f4f6', metalness: 0, roughness: 1 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.86
    floor.receiveShadow = true
    world.add(floor)

    const floorShadows = new THREE.Mesh(floor.geometry, new THREE.ShadowMaterial({
      color: "#242832",
      opacity: 0.24,
      depthWrite: false,
    }));
    floorShadows.position.z = 0.002;
    floorShadows.receiveShadow = true;
    floor.add(floorShadows);

    const core = new THREE.Group()
    core.position.y = TEAM_CHARACTER_CENTER_Y;
    world.add(core)

    const selectables: THREE.Mesh[] = [];
    let companionAsset: AgentCompanionAsset | null = null;
    let teamCharacter: THREE.Group | null = null;
    let loadingAgent: AgentCompanion | null = null;
    const loadingAgentAppearance = {
      fadeMeshes: [] as THREE.Mesh[],
      fadeMaterials: new Set<THREE.Material>(),
      opacity: 1,
    };
    function createMemberNodes(teamMembers: PreviewMember[]) {
      const asset = companionAsset;
      if (!asset) return [];
      return teamMembers.map((member, index) => {
        const node = new THREE.Group();
        const memberObject = createMemberLaptop();
        const hitBounds = new THREE.Box3().setFromObject(memberObject);
        const hitSize = hitBounds.getSize(new THREE.Vector3()).addScalar(0.04);
        const hitCenter = hitBounds.getCenter(new THREE.Vector3());
        const memberYaw = Math.PI / 2 - (index / teamMembers.length * Math.PI * 2 + 0.35);
        memberObject.rotation.y = memberYaw;
        const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
        const hitArea = new THREE.Mesh(new THREE.BoxGeometry(hitSize.x, hitSize.y, hitSize.z), hitMaterial);
        hitArea.position.copy(hitCenter).applyAxisAngle(new THREE.Vector3(0, 1, 0), memberYaw);
        hitArea.rotation.y = memberYaw;
        hitArea.userData.memberId = member.id;
        selectables.push(hitArea);
        node.add(memberObject, hitArea);
        const fadeMeshes: THREE.Mesh[] = [];
        const fadeMaterials = new Set<THREE.Material>();
        memberObject.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          fadeMeshes.push(object);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) fadeMaterials.add(material);
        });
        const satellites: AgentCompanion[] = member.agents.map((agent, agentIndex) => {
          const satellite = asset.create(agent.online, index * 2 + agentIndex);
          satellite.group.position.set(Math.cos(agentIndex * 2.2) * 0.84, 0.1 + agentIndex * 0.13, Math.sin(agentIndex * 2.2) * 0.84);
          satellite.group.rotation.y = -agentIndex * 2.2;
          satellite.group.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.castShadow = true;
              object.receiveShadow = true;
              fadeMeshes.push(object);
              for (const material of Array.isArray(object.material) ? object.material : [object.material]) fadeMaterials.add(material);
            }
          });
          node.add(satellite.group);
          return satellite;
        });
        world.add(node);
        return { node, member, index, satellites, fadeMeshes, fadeMaterials, opacity: 1, selection: 0 };
      });
    }
    let sceneMembers = control.current.members;
    let memberNodes = createMemberNodes(sceneMembers);

    let disposed = false
    let assetFailed = false;
    let contextLost = false
    let running = false
    let width = 1
    let height = 1
    let elapsed = 0
    let previous = performance.now()
    let entrance = control.current.paused ? 1 : 0
    let azimuth = 0.16
    let targetAzimuth = 0.16
    let polar = 1.08
    let targetPolar = 1.08
    let lastFocusId: string | null = null
    let lastSelectedId = ''
    let lastRenderedScroll = -1
    let cameraInitialized = false
    let teamReveal = 0;
    let lastReveal = -1;
    let lastTeamName = control.current.teamName;
    let viewOffsetX = 0
    let viewOffsetY = 0
    let layoutDirty = true
    let pointerDown: { x: number; y: number; moved: boolean } | null = null
    const pointer = new THREE.Vector2()
    const raycaster = new THREE.Raycaster()
    const target = new THREE.Vector3()
    const cameraTarget = new THREE.Vector3()
    const desiredPosition = new THREE.Vector3()
    const focusPosition = new THREE.Vector3()
    const orbitOffset = new THREE.Vector3()
    const labelPoint = new THREE.Vector3()
    const labelCenter = new THREE.Vector3()
    const createLabelPlacement = (item: (typeof memberNodes)[number]) => ({
      item,
      label: null as HTMLButtonElement | null,
      side: 0,
      x: 0,
      y: 0,
      originalY: 0,
      halfWidth: 45,
      halfHeight: 20,
      visible: true,
    });
    let labelPlacements = memberNodes.map(createLabelPlacement);
    const labelLayout = { minY: 110, maxY: 500, panelLeft: 0, panelRight: 0, panelTop: 0, panelBottom: 0, hasPanel: false }
    const focusFrame = { left: 20, right: 800, top: 100, bottom: 600, width: 780, height: 500, centerX: 410, centerY: 350 }
    const teamBox = { x: 0, y: 0, halfWidth: 80, halfHeight: 25, visible: false }
    let observedPanel: HTMLElement | null = null
    const panelObserver = new ResizeObserver(() => { layoutDirty = true; start() })

    function updateMembers(nextMembers: PreviewMember[], force = false) {
      if (!force && sceneMembers === nextMembers) return;
      const labelSides = new Map(labelPlacements.map((placement) => [placement.item.member.id, placement.side]));
      for (const { node, satellites } of memberNodes) {
        for (const satellite of satellites) satellite.dispose();
        world.remove(node);
        disposeObjectResources(node);
      }
      selectables.length = 0;
      sceneMembers = nextMembers;
      memberNodes = createMemberNodes(sceneMembers);
      labelPlacements = memberNodes.map((item) => ({ ...createLabelPlacement(item), side: labelSides.get(item.member.id) ?? 0 }));
      layoutDirty = true;
    }

    function fadeObject(item: {
      fadeMeshes: THREE.Mesh[];
      fadeMaterials: Set<THREE.Material>;
      opacity: number;
    }, opacity: number) {
      if (item.opacity === opacity) return;
      const fading = opacity < 1;
      const transparencyChanged = fading !== (item.opacity < 1);
      for (const material of item.fadeMaterials) {
        const baseOpacity = typeof material.userData.agentBaseOpacity === "number" ? material.userData.agentBaseOpacity : 1;
        material.opacity = baseOpacity * opacity;
        if (transparencyChanged) {
          material.transparent = material.userData.agentBaseTransparent === true || fading;
          material.depthWrite = material.userData.agentBaseDepthWrite !== false && !fading;
          material.needsUpdate = true;
        }
      }
      for (const mesh of item.fadeMeshes) {
        mesh.visible = opacity > 0;
        mesh.castShadow = opacity >= 0.85;
      }
      item.opacity = opacity;
    }

    function measureLabels() {
      const mobile = width <= MOBILE_BREAKPOINT
      const hostBounds = element!.getBoundingClientRect()
      const panel = element!.closest('.immersive-team-preview')?.querySelector<HTMLElement>('.itp-selection') ?? null
      if (panel !== observedPanel) {
        if (observedPanel) panelObserver.unobserve(observedPanel)
        observedPanel = panel
        if (panel) panelObserver.observe(panel)
      }
      const panelBounds = panel?.getBoundingClientRect()
      labelLayout.minY = mobile ? Math.min(220, height * 0.27) : 110
      labelLayout.panelTop = panelBounds ? panelBounds.top - hostBounds.top : height
      labelLayout.panelBottom = panelBounds ? panelBounds.bottom - hostBounds.top : height
      labelLayout.panelLeft = panelBounds ? panelBounds.left - hostBounds.left : width
      labelLayout.panelRight = panelBounds ? panelBounds.right - hostBounds.left : width
      labelLayout.hasPanel = panelBounds !== undefined
      labelLayout.maxY = Math.max(labelLayout.minY + 72, mobile ? Math.min(height - 285, labelLayout.panelTop - 12) : height - 115)
      const bottomSheet = labelLayout.hasPanel && labelLayout.panelRight - labelLayout.panelLeft > width * 0.66
      focusFrame.left = bottomSheet ? 16 : 20
      focusFrame.right = Math.max(focusFrame.left + 100, labelLayout.hasPanel && !bottomSheet ? labelLayout.panelLeft - 20 : width - focusFrame.left)
      focusFrame.top = bottomSheet ? 90 : 100
      focusFrame.bottom = Math.max(focusFrame.top + 80, bottomSheet ? labelLayout.panelTop - 16 : height - 130)
      focusFrame.width = focusFrame.right - focusFrame.left
      focusFrame.height = focusFrame.bottom - focusFrame.top
      focusFrame.centerX = (focusFrame.left + focusFrame.right) * 0.5
      focusFrame.centerY = (focusFrame.top + focusFrame.bottom) * 0.5
      if (control.current.focusedMemberId !== null) {
        labelLayout.minY = focusFrame.top + 8
        labelLayout.maxY = focusFrame.bottom - 8
      }
      const teamElement = teamLabel.current
      if (teamElement && !teamElement.hidden) {
        teamBox.halfWidth = teamElement.offsetWidth / 2 || 80
        teamBox.halfHeight = teamElement.offsetHeight / 2 || 25
      }
      for (const placement of labelPlacements) {
        placement.label = memberLabels.current.get(placement.item.member.id) ?? null
        if (placement.label && !placement.label.hidden) {
          placement.halfWidth = placement.label.offsetWidth / 2 || 45
          placement.halfHeight = placement.label.offsetHeight / 2 || 20
        }
      }
      layoutDirty = false
    }

    function updateLabels() {
      if (labelsLayer.current) labelsLayer.current.style.visibility = 'visible'
      if (layoutDirty) measureLabels()
      const mobile = width <= MOBILE_BREAKPOINT
      const focused = control.current.focusedMemberId !== null
      const canSelect = teamReveal >= 0.65 && control.current.scrollState.current.progress <= 0.12;
      const { minY, maxY } = labelLayout
      const teamElement = teamLabel.current
      teamBox.visible = control.current.focusedMemberId === null
      if (teamElement) teamElement.style.visibility = teamBox.visible ? 'visible' : 'hidden'
      core.localToWorld(labelPoint.set(0, TEAM_CHARACTER_HEIGHT / 2 + 0.3, 0)).project(camera);
      if (teamElement && teamBox.visible) {
        const x = THREE.MathUtils.clamp((labelPoint.x * 0.5 + 0.5) * width, teamBox.halfWidth + 16, width - teamBox.halfWidth - 16)
        const y = THREE.MathUtils.clamp((-labelPoint.y * 0.5 + 0.5) * height, minY, maxY)
        teamElement.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
        teamBox.x = x
        teamBox.y = y
      }
      core.getWorldPosition(labelCenter).project(camera)
      const centerX = (labelCenter.x * 0.5 + 0.5) * width
      for (const placement of labelPlacements) {
        const label = placement.label
        placement.visible = label !== null && (control.current.focusedMemberId === null || control.current.focusedMemberId === placement.item.member.id)
        if (!label || !placement.visible) continue
        placement.item.node.localToWorld(labelPoint.set(0, 0.1, 0)).project(camera)
        const { halfWidth, halfHeight } = placement
        const screenX = (labelPoint.x * 0.5 + 0.5) * width
        const screenY = (-labelPoint.y * 0.5 + 0.5) * height
        const distanceFromCenter = screenX - centerX;
        if (placement.side === 0) {
          placement.side = !focused && distanceFromCenter < 0 ? -1 : 1;
        } else if (!focused && distanceFromCenter * placement.side < -LABEL_SIDE_SWITCH_THRESHOLD) {
          placement.side *= -1;
        }
        const side = placement.side;
        const minX = focused ? focusFrame.left + halfWidth + 6 : halfWidth + 14
        const maxX = focused ? focusFrame.right - halfWidth - 6 : width - halfWidth - 14
        const x = THREE.MathUtils.clamp(screenX + side * (halfWidth + (mobile ? 20 : 33)), minX, Math.max(minX, maxX))
        let y = THREE.MathUtils.clamp(screenY, minY + halfHeight, maxY - halfHeight)
        if (!focused && !mobile && labelLayout.hasPanel) {
          if (x + halfWidth + 10 > labelLayout.panelLeft && x - halfWidth - 10 < labelLayout.panelRight && y + halfHeight + 10 > labelLayout.panelTop && y - halfHeight - 10 < labelLayout.panelBottom) {
            y = Math.max(minY + halfHeight, labelLayout.panelTop - halfHeight - 14)
          }
        }
        label.dataset.side = side < 0 ? 'left' : 'right'
        label.style.pointerEvents = canSelect ? "" : "none";
        label.tabIndex = canSelect ? 0 : -1;
        placement.x = x
        placement.y = y
        placement.originalY = screenY
      }
      for (let pass = 0; pass < 4; pass++) {
        for (let index = 0; index < labelPlacements.length; index++) {
          const a = labelPlacements[index]
          if (!a.visible) continue
          if (teamBox.visible && Math.abs(a.x - teamBox.x) < a.halfWidth + teamBox.halfWidth + 10 && Math.abs(a.y - teamBox.y) < a.halfHeight + teamBox.halfHeight + 9) {
            a.y = THREE.MathUtils.clamp(teamBox.y + teamBox.halfHeight + a.halfHeight + 12, minY + a.halfHeight, maxY - a.halfHeight)
          }
          for (let next = index + 1; next < labelPlacements.length; next++) {
            const b = labelPlacements[next]
            if (!b.visible) continue
            const overlap = a.halfHeight + b.halfHeight + 10 - Math.abs(a.y - b.y)
            if (Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth + 8 && overlap > 0) {
              const direction = a.originalY <= b.originalY ? -1 : 1
              a.y = THREE.MathUtils.clamp(a.y + direction * overlap * 0.5, minY + a.halfHeight, maxY - a.halfHeight)
              b.y = THREE.MathUtils.clamp(b.y - direction * overlap * 0.5, minY + b.halfHeight, maxY - b.halfHeight)
            }
          }
        }
      }
      for (const placement of labelPlacements) {
        if (placement.visible && placement.label) placement.label.style.transform = `translate3d(${placement.x}px,${placement.y}px,0) translate(-50%,-50%)`
      }
    }

    function frame(now: number) {
      if (disposed || assetFailed || contextLost) return
      const delta = Math.min((now - previous) / 1000, 0.05)
      previous = now
      const frozen = control.current.paused
      const blend = frozen ? 1 : 1 - Math.exp(-delta * 5)
      const progress = THREE.MathUtils.clamp(control.current.scrollState.current.progress, 0, 1)
      const focusId = control.current.focusedMemberId
      const lookingDown = control.current.topView;
      const loading = control.current.loading || !companionAsset || !teamCharacter;
      updateMembers(control.current.members);
      if (lastFocusId !== focusId || lastSelectedId !== control.current.selectedMemberId || lastTeamName !== control.current.teamName) layoutDirty = true;
      lastSelectedId = control.current.selectedMemberId
      lastTeamName = control.current.teamName;
      if (layoutDirty) measureLabels()
      if (!frozen) elapsed += delta
      if (loading) {
        teamReveal = 0;
      } else if (frozen || progress >= 0.12 || lastRenderedScroll >= 1) {
        teamReveal = 1;
      } else {
        teamReveal = Math.min(1, teamReveal + delta / TEAM_REVEAL_SECONDS);
      }
      const reveal = teamReveal * teamReveal * (3 - 2 * teamReveal);
      const loadingWeight = 1 - reveal;
      if (lastReveal !== reveal) {
        stage?.style.setProperty("--itp-team-reveal", String(reveal));
        if (lastReveal === -1 || (lastReveal >= 0.25) !== (reveal >= 0.25)) {
          stage?.style.setProperty("--itp-team-reveal-visibility", reveal >= 0.25 ? "visible" : "hidden");
        }
        lastReveal = reveal;
      }
      entrance = THREE.MathUtils.lerp(entrance, 1, frozen ? 1 : 1 - Math.exp(-delta * 2.4))
      world.scale.setScalar((0.96 + entrance * 0.04) * (1 - progress * 0.14))
      world.position.y = -0.025 + entrance * 0.025 + progress * 0.16
      core.position.y = TEAM_CHARACTER_CENTER_Y + Math.sin(elapsed * 0.4) * 0.008;
      if (loadingAgent) {
        const orbit = elapsed * 0.72;
        const opacity = 1 - THREE.MathUtils.smoothstep(teamReveal, 0, 0.45);
        loadingAgent.group.visible = opacity > 0;
        fadeObject(loadingAgentAppearance, opacity);
        loadingAgent.group.position.set(
          Math.cos(orbit) * 1.35,
          core.position.y + 0.18 + Math.sin(elapsed * 1.5) * 0.055,
          Math.sin(orbit) * 1.35,
        );
        loadingAgent.group.rotation.y = -orbit;
        loadingAgent.body.rotation.z = Math.sin(elapsed * 0.55) * 0.018;
      }
      const memberRadius = 2.62;
      for (const item of memberNodes) {
        const selected = item.member.id === control.current.selectedMemberId
        item.selection = THREE.MathUtils.lerp(item.selection, selected ? 1 : 0, blend)
        const angle = item.index / sceneMembers.length * Math.PI * 2 + 0.35;
        const fadeStart = Math.min(item.index * 0.045, 0.25);
        const memberReveal = THREE.MathUtils.smoothstep(teamReveal, fadeStart, 1);
        const height = -0.12 + Math.sin(elapsed * 0.5 + item.index) * 0.006 + item.selection * 0.012
          - (1 - memberReveal) * MEMBER_REVEAL_RISE;
        const scale = 1 + item.selection * 0.035;
        item.node.position.set(Math.cos(angle) * memberRadius, height, Math.sin(angle) * memberRadius);
        item.node.scale.setScalar(scale);
        fadeObject(item, memberReveal);
        item.satellites.forEach((satellite, satelliteIndex) => {
          const orbit = elapsed * 0.08 + satelliteIndex * 2.2 + item.index * 0.24
          satellite.group.position.set(Math.cos(orbit) * 0.84, 0.1 + Math.sin(elapsed * 0.7 + satellite.phase) * 0.022, Math.sin(orbit) * 0.84)
          satellite.group.rotation.y = -orbit
          satellite.body.rotation.z = Math.sin(elapsed * 0.55 + satellite.phase) * 0.018
        })
      }
      const focusedNode = focusId ? memberNodes.find((item) => item.member.id === focusId) : undefined
      if (lastFocusId !== focusId) {
        targetAzimuth = focusedNode ? Math.atan2(focusedNode.node.position.x, focusedNode.node.position.z) : 0.16
        targetPolar = focusedNode ? 1.2 : 1.08
        pointer.set(0, 0)
        lastFocusId = focusId
      }
      const orientationBlend = frozen ? 1 : 1 - Math.exp(-delta * 10)
      const desiredAzimuth = targetAzimuth + (lookingDown ? 0 : pointer.x * 0.045);
      const desiredPolar = lookingDown ? TOP_VIEW_POLAR : targetPolar + pointer.y * 0.025 - progress * 0.14;
      azimuth = THREE.MathUtils.lerp(azimuth, desiredAzimuth, orientationBlend);
      polar = THREE.MathUtils.lerp(polar, desiredPolar, orientationBlend);
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))
      let radius: number
      if (focusedNode) {
        focusPosition.copy(focusedNode.node.position).multiplyScalar(world.scale.x).add(world.position)
        focusPosition.y += 0.05
        target.copy(focusPosition)
        const widthFraction = THREE.MathUtils.clamp(focusFrame.width / width, 0.12, 1)
        const heightFraction = THREE.MathUtils.clamp(focusFrame.height / height, 0.12, 1)
        const horizontalFit = 1.45 / (tangent * camera.aspect * widthFraction)
        const verticalFit = 0.9 / (tangent * heightFraction)
        radius = Math.max(4.25, horizontalFit, verticalFit)
      } else {
        target.set(0, 0.05 + progress * 0.08, 0)
        const horizontalFit = 3.95 / (tangent * camera.aspect)
        const verticalFit = (lookingDown ? 3.95 : 3.15) / tangent;
        radius = Math.max(11.4, horizontalFit, verticalFit) * (1 - loadingWeight * 0.14);
      }
      radius *= 1 + progress * 0.18
      orbitOffset.set(Math.sin(azimuth) * Math.sin(polar) * radius, Math.cos(polar) * radius, Math.cos(azimuth) * Math.sin(polar) * radius)
      desiredPosition.copy(target).add(orbitOffset)
      const cameraBlend = frozen || !cameraInitialized ? 1 : 1 - Math.exp(-delta * 6)
      camera.position.lerp(desiredPosition, cameraBlend)
      cameraTarget.lerp(target, cameraBlend)
      const targetOffsetX = focusedNode ? width * 0.5 - focusFrame.centerX : 0
      const targetOffsetY = focusedNode ? height * 0.5 - focusFrame.centerY : 0
      viewOffsetX = THREE.MathUtils.lerp(viewOffsetX, targetOffsetX, cameraBlend)
      viewOffsetY = THREE.MathUtils.lerp(viewOffsetY, targetOffsetY, cameraBlend)
      if (!focusedNode && Math.abs(viewOffsetX) < 0.1 && Math.abs(viewOffsetY) < 0.1) {
        viewOffsetX = 0
        viewOffsetY = 0
        camera.clearViewOffset()
      } else {
        camera.setViewOffset(width, height, viewOffsetX, viewOffsetY, width, height)
      }
      cameraInitialized = true
      camera.lookAt(cameraTarget)
      renderer.render(scene, camera)
      if (!loading && teamCharacter && teamReveal >= 0.25) updateLabels();
      else if (labelsElement) labelsElement.style.visibility = "hidden";
      if (lastRenderedScroll === -1 && companionAsset && teamCharacter) control.current.onAvailabilityChange(true);
      lastRenderedScroll = progress
      if (frozen || progress >= 1) { renderer.setAnimationLoop(null); running = false }
    }

    function start() {
      if (disposed || assetFailed || contextLost || document.hidden || running || (control.current.scrollState.current.progress >= 1 && lastRenderedScroll >= 1)) return
      running = true
      previous = performance.now()
      renderer.setAnimationLoop(frame)
    }
    wake.current = start
    function resize() {
      width = Math.max(element!.clientWidth, 1)
      height = Math.max(element!.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.fov = width <= MOBILE_BREAKPOINT ? 43 : 37
      camera.updateProjectionMatrix()
      layoutDirty = true
      start()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    function hit(event: PointerEvent) {
      if (control.current.loading || teamReveal < 0.65 || control.current.scrollState.current.progress > 0.12) return undefined;
      const bounds = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1), camera)
      return raycaster.intersectObjects(selectables, false).find(({ object }) => object.visible)?.object.userData.memberId as string | undefined;
    }
    function down(event: PointerEvent) {
      if (event.button !== 0 || control.current.loading || teamReveal < 0.65 || control.current.scrollState.current.progress > 0.12) return;
      pointerDown = { x: event.clientX, y: event.clientY, moved: false }
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    function move(event: PointerEvent) {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, (event.clientY - bounds.top) / bounds.height * 2 - 1)
      if (pointerDown) {
        const x = event.clientX - pointerDown.x
        const y = event.clientY - pointerDown.y
        if (Math.abs(x) + Math.abs(y) > 4) pointerDown.moved = true
        if (pointerDown.moved) {
          targetAzimuth -= x * 0.004
          if (!control.current.topView) {
            targetPolar = THREE.MathUtils.clamp(targetPolar - y * 0.0025, 0.72, 1.36);
          }
          pointerDown.x = event.clientX
          pointerDown.y = event.clientY
        }
      } else renderer.domElement.style.cursor = hit(event) ? 'pointer' : 'grab'
      start()
    }
    function up(event: PointerEvent) {
      if (pointerDown && !pointerDown.moved) {
        const memberId = hit(event)
        if (memberId) control.current.onSelectMember(memberId)
      }
      pointerDown = null
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
      renderer.domElement.style.cursor = 'grab'
    }
    function cancel() { pointerDown = null; pointer.set(0, 0); renderer.domElement.style.cursor = 'grab'; start() }
    function visibility() {
      if (document.hidden) { renderer.setAnimationLoop(null); running = false } else start()
    }
    function lost(event: Event) {
      event.preventDefault()
      contextLost = true
      renderer.setAnimationLoop(null)
      running = false
      if (labelsLayer.current) labelsLayer.current.style.visibility = 'hidden'
      control.current.onAvailabilityChange(false)
    }
    function restored() {
      contextLost = false
      lastRenderedScroll = -1;
      start()
    }
    const canvas = renderer.domElement
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('pointerleave', cancel)
    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', restored)
    document.addEventListener('visibilitychange', visibility)

    void Promise.allSettled([loadAgentCompanionAsset(), loadTeamCharacter()]).then((results) => {
      const [agentResult, characterResult] = results;
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        if (agentResult.status === "fulfilled") agentResult.value.dispose();
        if (characterResult.status === "fulfilled") disposeObjectResources(characterResult.value);
        throw failure.reason;
      }
      if (agentResult.status !== "fulfilled" || characterResult.status !== "fulfilled") return;
      if (disposed) {
        agentResult.value.dispose();
        disposeObjectResources(characterResult.value);
        return;
      }
      companionAsset = agentResult.value;
      teamCharacter = characterResult.value;
      core.add(teamCharacter);
      loadingAgent = companionAsset.create(true, 0);
      loadingAgent.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        loadingAgentAppearance.fadeMeshes.push(object);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) loadingAgentAppearance.fadeMaterials.add(material);
      });
      world.add(loadingAgent.group);
      updateMembers(control.current.members, true);
      lastRenderedScroll = -1;
      start();
    }).catch(() => {
      if (disposed) return;
      assetFailed = true;
      renderer.setAnimationLoop(null);
      running = false;
      if (labelsElement) labelsElement.style.visibility = 'hidden';
      control.current.onAvailabilityChange(false);
    });

    return () => {
      disposed = true
      stage?.style.removeProperty("--itp-team-reveal");
      stage?.style.removeProperty("--itp-team-reveal-visibility");
      if (labelsElement) labelsElement.style.visibility = 'hidden'
      wake.current = () => {}
      renderer.setAnimationLoop(null)
      observer.disconnect()
      panelObserver.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('pointerleave', cancel)
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', restored)
      document.removeEventListener('visibilitychange', visibility)
      loadingAgent?.dispose();
      for (const { satellites } of memberNodes) {
        for (const satellite of satellites) satellite.dispose();
      }
      disposeObjectResources(scene)
      companionAsset?.dispose();
      key.shadow.dispose()
      environment?.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, []);

  return <div className="itp-canvas" ref={host} role="group" aria-label="팀 허브와 팀원별 노드, 작은 AI 동료가 함께하는 3D 공간. 드래그로 회전하고 팀원 또는 이름을 선택할 수 있습니다.">
    <div className="itp-scene-labels" ref={labelsLayer} style={{ visibility: 'hidden' }} aria-label="팀과 팀원 이름">
      {!loading && <div className="itp-team-scene-label" ref={teamLabel} hidden={focusedMemberId !== null} style={{ visibility: focusedMemberId !== null ? 'hidden' : undefined }}>{teamName}</div>}
      {members.map((member) => <button
        key={member.id}
        ref={(element) => { if (element) memberLabels.current.set(member.id, element); else memberLabels.current.delete(member.id) }}
        className={`itp-scene-member-label${selectedMemberId === member.id ? ' is-selected' : ''}`}
        type="button"
        aria-pressed={selectedMemberId === member.id}
        hidden={focusedMemberId !== null && focusedMemberId !== member.id}
        aria-label={`${member.name} 팀원 선택`}
        onClick={() => { if (control.current.scrollState.current.progress <= 0.12) control.current.onSelectMember(member.id) }}
        style={{ visibility: focusedMemberId !== null && focusedMemberId !== member.id ? 'hidden' : undefined } as CSSProperties}
      ><span>{member.name}</span></button>)}
    </div>
  </div>
}
