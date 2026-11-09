import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const AGENT_MODEL_SIZE = 0.38
const AGENT_MODELS = ["mascot2.glb", "mascot2_sleep.glb"] as const;

export interface AgentCompanion {
  group: THREE.Group
  body: THREE.Group
  phase: number
  online: boolean
  dispose: () => void
}

export interface AgentCompanionAsset {
  create: (online: boolean, variant: number) => AgentCompanion;
  dispose: () => void
}

function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const images = new Set<ImageBitmap>()

  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value)
    }
  }
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => {
    texture.dispose()
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image)
  })
  images.forEach((image) => image.close())
  root.clear()
}

async function loadModelTemplate(file: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/${file}`,
  )
  const template = new THREE.Group()
  template.add(gltf.scene);

  try {
    const bounds = new THREE.Box3().setFromObject(template)
    const size = bounds.getSize(new THREE.Vector3())
    const largestDimension = Math.max(size.x, size.y, size.z)
    if (bounds.isEmpty() || !Number.isFinite(largestDimension) || largestDimension <= 0) {
      throw new Error('Agent 모델의 크기를 확인하지 못했습니다.')
    }
    gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()));
    template.scale.setScalar(AGENT_MODEL_SIZE / largestDimension)
    return template
  } catch (error) {
    disposeModel(template)
    throw error
  }
}

export async function loadAgentCompanionAsset(): Promise<AgentCompanionAsset> {
  const results = await Promise.allSettled(AGENT_MODELS.map(loadModelTemplate));
  const templates = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') {
    templates.forEach(disposeModel)
    throw failure.reason
  }

  const instances = new Set<AgentCompanion>()
  let disposed = false

  return {
    create(online, variant) {
      if (disposed) throw new Error('이미 해제된 Agent 모델입니다.')
      const modelIndex = online ? 0 : 1;
      const group = new THREE.Group()
      const body = new THREE.Group()
      const model = templates[modelIndex].clone(true)
      const materials = new Map<THREE.Material, THREE.Material>()
      group.name = `AgentMascot-${AGENT_MODELS[modelIndex]}`;
      body.add(model)
      group.add(body)

      // 인스턴스별 재질만 복제해 상태와 투명도 분리, 형상과 텍스처 공유
      const cloneMaterial = (source: THREE.Material) => {
        let material = materials.get(source)
        if (!material) {
          material = source.clone();
          material.userData.agentBaseOpacity = material.opacity
          material.userData.agentBaseTransparent = material.transparent
          material.userData.agentBaseDepthWrite = material.depthWrite
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
            // 안개로 인한 마스코트 얼굴 대비 저하 방지
            material.fog = false
          }
          materials.set(source, material)
        }
        return material
      }
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true
          object.receiveShadow = true
          object.material = Array.isArray(object.material)
            ? object.material.map(cloneMaterial)
            : cloneMaterial(object.material)
        }
      })

      let instanceDisposed = false
      const companion: AgentCompanion = {
        group,
        body,
        phase: variant * 1.17,
        online,
        dispose() {
          if (instanceDisposed) return
          instanceDisposed = true
          group.removeFromParent()
          materials.forEach((material) => material.dispose())
          materials.clear()
          body.clear()
          group.clear()
          instances.delete(companion)
        },
      }
      instances.add(companion)
      return companion
    },
    dispose() {
      if (disposed) return
      disposed = true
      instances.forEach((companion) => companion.dispose())
      templates.forEach(disposeModel)
    },
  }
}
