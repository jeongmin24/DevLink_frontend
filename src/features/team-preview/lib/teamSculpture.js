import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export function createTeamSculpture() {
  const group = new THREE.Group();
  const silver = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 1.16, 0.25, 5, 0.055),
    new THREE.MeshStandardMaterial({
      color: "#cfd1d4",
      metalness: 0.72,
      roughness: 0.31,
    }),
  );
  silver.position.set(-0.2, 0.04, 0.14);
  silver.rotation.set(0.03, -0.1, -0.18);
  const graphite = new THREE.Mesh(
    new RoundedBoxGeometry(0.92, 1.16, 0.25, 5, 0.055),
    new THREE.MeshStandardMaterial({
      color: "#2c2e32",
      metalness: 0.45,
      roughness: 0.37,
    }),
  );
  graphite.position.set(0.2, -0.04, -0.14);
  graphite.rotation.set(-0.03, 0.1, 0.18);
  group.add(silver, graphite);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}
