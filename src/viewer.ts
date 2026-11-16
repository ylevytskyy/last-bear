import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const container = document.getElementById('canvas-container') as HTMLDivElement;
const clipsEl = document.getElementById('clips') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const btnPlay = document.getElementById('btn-play') as HTMLButtonElement;
const btnResetCam = document.getElementById('btn-reset-cam') as HTMLButtonElement;
const speedInput = document.getElementById('speed') as HTMLInputElement;
const speedValEl = document.getElementById('speed-val') as HTMLSpanElement;
const toggleSkeleton = document.getElementById('toggle-skeleton') as HTMLInputElement;
const toggleWireframe = document.getElementById('toggle-wireframe') as HTMLInputElement;
const toggleKey = document.getElementById('toggle-key') as HTMLInputElement;
const dropzone = document.getElementById('dropzone') as HTMLLabelElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

// Scene, Camera, Renderer
const scene = new THREE.Scene();
scene.background = new THREE.Color('#14161f');

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 50);
const defaultCamPos = new THREE.Vector3(1.15, 1.05, 1.85);
const defaultTarget = new THREE.Vector3(0, 0.55, 0);
camera.position.copy(defaultCamPos);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.copy(defaultTarget);
controls.update();

// Studio 3-point + Purple Rim Lighting (highlights #18181D fur & #7B3FE4 sheen)
scene.add(new THREE.HemisphereLight('#b9c6ff', '#222430', 0.9));

const keyLight = new THREE.DirectionalLight('#fff5e6', 2.0);
keyLight.position.set(2.2, 3.4, 2.6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 10;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight('#8ea8ff', 0.85);
fillLight.position.set(-2.5, 1.8, 1.5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight('#9d65ff', 2.4);
rimLight.position.set(0.0, 2.2, -2.5);
scene.add(rimLight);

// Ground & Grid
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(2.2, 48),
  new THREE.MeshStandardMaterial({ color: '#1b1e29', roughness: 0.92 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(4, 16, '#3b425c', '#262a3a');
grid.position.y = 0.001;
scene.add(grid);

// State
const loader = new GLTFLoader();
let currentRoot: THREE.Object3D | null = null;
let skeletonHelper: THREE.SkeletonHelper | null = null;
let mixer: THREE.AnimationMixer | null = null;
let activeAction: THREE.AnimationAction | null = null;
let isPlaying = true;
let playbackSpeed = 1.0;
let flowerKeyObj: THREE.Object3D | null = null;

function clearCurrentModel(): void {
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  activeAction = null;
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper = null;
  }
  if (currentRoot) {
    scene.remove(currentRoot);
    currentRoot = null;
  }
  flowerKeyObj = null;
  clipsEl.innerHTML = '';
}

function playClip(clip: THREE.AnimationClip, button: HTMLButtonElement): void {
  if (!mixer) return;
  const nextAction = mixer.clipAction(clip);
  nextAction.reset();
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  nextAction.play();

  if (activeAction && activeAction !== nextAction) {
    activeAction.crossFadeTo(nextAction, 0.2, false);
  }
  activeAction = nextAction;

  Array.from(clipsEl.querySelectorAll('button')).forEach((b) => b.classList.remove('active'));
  button.classList.add('active');

  if (flowerKeyObj && !toggleKey.checked) {
    flowerKeyObj.visible = clip.name === 'Unlock_Cage';
  }
}

function applyWireframe(enabled: boolean): void {
  if (!currentRoot) return;
  currentRoot.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if ('wireframe' in m) {
          m.wireframe = enabled;
        }
      }
    }
  });
}

function loadModelFromUrl(url: string, label: string): void {
  statusEl.textContent = `Завантаження ${label}...`;
  loader.load(
    url,
    (gltf) => {
      clearCurrentModel();
      currentRoot = gltf.scene;
      scene.add(currentRoot);

      let triCount = 0;
      currentRoot.traverse((obj) => {
        if (obj.name === 'PROP_Flower_Key') {
          flowerKeyObj = obj;
          obj.visible = toggleKey.checked;
        }
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          const geom = obj.geometry;
          if (geom.index) {
            triCount += geom.index.count / 3;
          } else if (geom.attributes.position) {
            triCount += geom.attributes.position.count / 3;
          }
        }
      });

      const box = new THREE.Box3().setFromObject(currentRoot);
      const size = box.getSize(new THREE.Vector3());

      skeletonHelper = new THREE.SkeletonHelper(currentRoot);
      skeletonHelper.visible = toggleSkeleton.checked;
      scene.add(skeletonHelper);

      applyWireframe(toggleWireframe.checked);

      mixer = new THREE.AnimationMixer(currentRoot);
      const clips = gltf.animations;

      if (clips.length === 0) {
        clipsEl.innerHTML = '<span style="font-size:12px;color:#8f96ab">Немає анімацій</span>';
      } else {
        clips.forEach((clip, idx) => {
          const btn = document.createElement('button');
          btn.textContent = `${clip.name} (${clip.duration.toFixed(2)}s)`;
          btn.addEventListener('click', () => playClip(clip, btn));
          clipsEl.appendChild(btn);
          if (idx === 0 || clip.name === 'Idle') {
            if (clip.name === 'Idle' || !activeAction) {
              playClip(clip, btn);
            }
          }
        });
      }

      statusEl.textContent =
        `${label} | ${Math.round(triCount)} tris | Висота: ${size.y.toFixed(3)} м | Кліпів: ${clips.length}`;
    },
    undefined,
    (err) => {
      console.error(err);
      statusEl.textContent = `Помилка завантаження ${label}`;
    },
  );
}

// UI Events
btnPlay.addEventListener('click', () => {
  isPlaying = !isPlaying;
  btnPlay.textContent = isPlaying ? 'Пауза' : 'Грати';
  btnPlay.classList.toggle('active', isPlaying);
});

btnResetCam.addEventListener('click', () => {
  camera.position.copy(defaultCamPos);
  controls.target.copy(defaultTarget);
  controls.update();
});

speedInput.addEventListener('input', () => {
  playbackSpeed = parseFloat(speedInput.value);
  speedValEl.textContent = `${playbackSpeed.toFixed(2)}x`;
});

toggleSkeleton.addEventListener('change', () => {
  if (skeletonHelper) skeletonHelper.visible = toggleSkeleton.checked;
});

toggleWireframe.addEventListener('change', () => {
  applyWireframe(toggleWireframe.checked);
});

toggleKey.addEventListener('change', () => {
  if (flowerKeyObj) {
    flowerKeyObj.visible = toggleKey.checked || activeAction?.getClip().name === 'Unlock_Cage';
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const blobUrl = URL.createObjectURL(file);
  loadModelFromUrl(blobUrl, file.name);
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    const blobUrl = URL.createObjectURL(file);
    loadModelFromUrl(blobUrl, file.name);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Render Loop
const clock = new THREE.Clock();
function animate(): void {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer && isPlaying) {
    mixer.update(dt * playbackSpeed);
  }
  controls.update();
  renderer.render(scene, camera);
}
animate();

// Load default model
loadModelFromUrl('/models/sofia.glb', 'sofia.glb');
