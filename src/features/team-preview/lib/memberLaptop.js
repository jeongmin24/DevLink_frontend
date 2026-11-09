import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export function createMemberLaptop() {
  const group = new THREE.Group();
  const silver = new THREE.MeshStandardMaterial({
    color: "#c5cbd2",
    metalness: 0.58,
    roughness: 0.4,
    fog: false,
  });
  const graphite = new THREE.MeshStandardMaterial({
    color: "#18232e",
    metalness: 0.12,
    roughness: 0.67,
    fog: false,
  });
  const keyMaterial = new THREE.MeshStandardMaterial({
    color: "#455261",
    metalness: 0.08,
    roughness: 0.72,
    fog: false,
  });
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: "#476b88",
    emissive: "#243f57",
    emissiveIntensity: 0.12,
    metalness: 0.05,
    roughness: 0.45,
    fog: false,
  });
  const trackpadMaterial = new THREE.MeshStandardMaterial({
    color: "#aeb8c3",
    metalness: 0.45,
    roughness: 0.48,
    fog: false,
  });

  const base = new THREE.Mesh(
    new RoundedBoxGeometry(0.9, 0.045, 0.62, 2, 0.018),
    silver,
  );
  base.position.set(0, -0.22, 0.045);
  group.add(base);

  const hinge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.72, 12),
    graphite,
  );
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, -0.195, -0.265);
  group.add(hinge);

  const lid = new THREE.Group();
  lid.position.set(0, -0.195, -0.265);
  lid.rotation.x = -0.18;
  const shell = new THREE.Mesh(
    new RoundedBoxGeometry(0.9, 0.59, 0.036, 2, 0.017),
    silver,
  );
  shell.position.y = 0.295;
  const bezel = new THREE.Mesh(
    new RoundedBoxGeometry(0.855, 0.545, 0.012, 2, 0.005),
    graphite,
  );
  bezel.position.set(0, 0.295, 0.023);
  const screen = new THREE.Mesh(
    new RoundedBoxGeometry(0.795, 0.445, 0.008, 2, 0.003),
    screenMaterial,
  );
  screen.position.set(0, 0.31, 0.033);
  lid.add(shell, bezel, screen);
  group.add(lid);

  const keyboard = new THREE.Mesh(
    new RoundedBoxGeometry(0.77, 0.01, 0.27, 2, 0.004),
    graphite,
  );
  keyboard.position.set(0, -0.1925, -0.055);
  group.add(keyboard);

  const keyGeometries = [];
  const key = new THREE.BoxGeometry(0.043, 0.009, 0.041);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 13; column++) {
      keyGeometries.push(
        key.clone().translate((column - 6) * 0.054, -0.1815, -0.145 + row * 0.056),
      );
    }
  }
  for (const x of [-0.324, -0.27, 0.27, 0.324]) {
    keyGeometries.push(key.clone().translate(x, -0.1815, 0.023));
  }
  keyGeometries.push(new THREE.BoxGeometry(0.38, 0.009, 0.041).translate(0, -0.1815, 0.023));
  const mergedKeys = mergeGeometries(keyGeometries);
  key.dispose();
  keyGeometries.forEach((geometry) => geometry.dispose());
  group.add(new THREE.Mesh(mergedKeys, keyMaterial));

  const trackpad = new THREE.Mesh(
    new RoundedBoxGeometry(0.25, 0.006, 0.14, 2, 0.002),
    trackpadMaterial,
  );
  trackpad.position.set(0, -0.1925, 0.235);
  group.add(trackpad);

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const material = object.material;
    material.userData.agentBaseOpacity = material.opacity;
    material.userData.agentBaseTransparent = material.transparent;
    material.userData.agentBaseDepthWrite = material.depthWrite;
  });
  return group;
}
