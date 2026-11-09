import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadAgentCompanionAsset } from "./lib/agentCompanionAsset";
import type { AgentCompanion, AgentCompanionAsset } from "./lib/agentCompanionAsset";

function mountPreview() {
  const stage = document.querySelector<HTMLElement>("#stage");
  if (!stage) return;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    document.querySelector<HTMLElement>("#error")!.hidden = false;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor("#ece7e0");
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-label", "왼쪽 온라인 로봇과 오른쪽 오프라인 로봇. 드래그로 회전할 수 있습니다.");
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minDistance = 0.9;
  controls.maxDistance = 5;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.set(0, -0.015, 0);

  const room = new RoomEnvironment();
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  room.dispose();
  generator.dispose();
  scene.add(new THREE.HemisphereLight("#ffffff", "#dce0e6", 1.4));
  const key = new THREE.DirectionalLight("#ffffff", 2.6);
  key.position.set(-3, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -1.5;
  key.shadow.camera.right = key.shadow.camera.top = 1.5;
  key.shadow.camera.far = 15;
  key.shadow.normalBias = 0.005;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#ffffff", 0.75);
  rim.position.set(5, 3, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({
    color: "#ece7e0", roughness: 1,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.31;
  floor.receiveShadow = true;
  scene.add(floor);
  const robots: AgentCompanion[] = [];
  let companionAsset: AgentCompanionAsset | null = null;
  let disposed = false;

  let distance = 1.7;
  function setView(angle: number) {
    controls.reset();
    camera.position.set(0, distance * 0.23, distance);
    controls.target.set(0, -0.015, 0);
    robots.forEach(({ group }) => { group.rotation.y = angle; });
    controls.update();
  }
  function resize() {
    const width = stage!.clientWidth;
    const height = stage!.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    distance = Math.max(1.7, 0.67 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    setView(-0.3);
  }
  const viewButtons = [["front", 0], ["angle", -0.45], ["side", -Math.PI / 2], ["reset", -0.3]] as const;
  const viewHandlers = viewButtons.map(([id, angle]) => {
    const button = document.getElementById(id)!;
    const handler = () => setView(angle);
    button.addEventListener("click", handler);
    return { button, handler };
  });
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  let elapsed = 0;
  let previous = performance.now();
  function frame(now: number) {
    if (disposed) return;
    elapsed += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    for (const robot of robots) {
      robot.group.position.y = Math.sin(elapsed * 0.7 + robot.phase) * 0.022;
      robot.body.rotation.z = Math.sin(elapsed * 0.55 + robot.phase) * 0.018;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  renderer.render(scene, camera);
  void loadAgentCompanionAsset().then((asset) => {
    if (disposed) {
      asset.dispose();
      return;
    }
    companionAsset = asset;
    for (const [index, online] of [true, false].entries()) {
      const robot = asset.create(online, index);
      robots.push(robot);
      robot.group.position.x = index === 0 ? -0.29 : 0.29;
      robot.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      scene.add(robot.group);
    }
    setView(-0.3);
    previous = performance.now();
    renderer.setAnimationLoop(frame);
  }).catch(() => {
    if (disposed) return;
    renderer.setAnimationLoop(null);
    for (const robot of robots) robot.dispose();
    robots.length = 0;
    companionAsset?.dispose();
    companionAsset = null;
    const error = document.querySelector<HTMLElement>("#error");
    if (error) {
      error.textContent = "로봇 모델을 불러오지 못했습니다. 페이지를 새로고침해 주세요.";
      error.hidden = false;
    }
  });
  return () => {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    observer.disconnect();
    controls.dispose();
    for (const { button, handler } of viewHandlers) button.removeEventListener("click", handler);
    for (const robot of robots) robot.dispose();
    robots.length = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
    textures.forEach((texture) => texture.dispose());
    materials.forEach((material) => material.dispose());
    companionAsset?.dispose();
    companionAsset = null;
    key.shadow.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

const dispose = mountPreview();
if (import.meta.hot) import.meta.hot.dispose(() => dispose?.());
