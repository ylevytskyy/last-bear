import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { animateBear } from '../entities/bear/animate';
import { createActor, hasActor } from './glb-actors';
import { JUMP_START_SECONDS, sofiaClip } from './sofia-clip';
import { strikePose } from '../entities/bear/strike-pose';
import { buildBear, disposeBear } from '../entities/bear/build-bear';
import { SOFIYKA_SKIN } from '../entities/bear/skins';
import type { Input } from '../sim/input';
import type { SimEvent } from '../sim/sim';
import { TUNING } from '../sim/tuning';
import type { Game, GameEvent } from '../sim/game';
import { createBloom } from './bloom';
import { createWorldView, type WorldView } from './world-view';
import { worldLook } from './world-looks';
import { buildGirl } from './girl-model';
import { addOutline } from '../entities/toon';
import { introBlend } from './intro-fx';
import { finaleLight, showToBeContinued } from './finale-fx';
import { createScreens } from './screens';
import { fpsMeter } from './fps';
import { gsap } from 'gsap';
import { PETAL_COLORS } from './flower-models';
import { transitionDolly, transitionFill } from './transition-fx';
import { lerpAngle, lerpVec3, type Previous } from './smoothing';
import { createHud } from './hud';
import { blinkVisible, hurtFlash } from './hud-model';
import { slowdownFx } from './slowdown-fx';
import { blinkPose } from './blink-fx';
import { createParticles } from './particles';
import { createSound, type Sound } from './sound';
import { eyeIntensity } from './eye-glow';
import { orbitCamera, type CameraPose } from './follow-camera';
import { applyMouse, followHeight, turnWithKeys, type Look } from './mouse-look';

export type GameView = {
  sound: Sound;
  /** `smooth` — стан до останнього кроку правил і частка шляху до наступного (без нього — без згладжування). */
  frame(dtSeconds: number, events: GameEvent[], input: Input, smooth?: { previous: Previous; alpha: number }): void;
  cameraYaw(): number;
  /** Рух миші (pointer lock), пікселі. */
  mouse(dx: number, dy: number): void;
  /** Стрілки вліво/вправо крутять камеру; викликається щокадру. */
  turnKeys(pressed: ReadonlySet<string>, dt: number): void;
  /** Заставка; `onStart` — з першого натиску. */
  showSplash(onStart: () => void): void;
  /** Для перевірок у браузері: середній колір області кадру (пікселі canvas) і екранна точка світу. */
  probe: {
    meanColor(box?: { x: number; y: number; w: number; h: number }): [number, number, number];
    toScreen(at: { x: number; y: number; z: number }): { x: number; y: number };
    values(): Record<string, unknown>;
    /** Перебудувати світ показу (перевірка, що нічого не тече). */
    rebuildWorld(): void;
  };
  dispose(): void;
};

/** Софійка з `sofia.glb` заввишки 1.1 м; світ і капсула правил розраховані на ~1.8 м. */
const SOFIA_SCALE = 1.6;

export function createGameView(canvas: HTMLCanvasElement, game: Game): GameView {
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: import.meta.env.DEV });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color('#1a1a2b');
  scene.fog = new Fog('#1a1a2b', 25, 70);
  const ambient = new AmbientLight('#8a8aa8', 1.4);
  scene.add(ambient);
  // Світло неба й землі: верх теплий-світлий, низ темніший — об'єм замість пласкої заливки.
  const skyLight = new HemisphereLight('#ffffff', '#3a3040', 0.9);
  scene.add(skyLight);
  const sun = new DirectionalLight('#ffe9c4', 2.2);
  sun.position.set(12, 20, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
  scene.add(sun);
  scene.add(sun.target);

  // Софійка: модель з анімацією (`sofia.glb`); без неї (не завантажилась) — ведмідь із примітивів.
  const sofia = hasActor('sofia') ? createActor('sofia', { scale: SOFIA_SCALE, outline: 0.012 }) : null;
  const rig = sofia ? null : buildBear(SOFIYKA_SKIN);
  const player = (sofia?.root ?? rig?.root)!;
  if (rig) addOutline(rig.root);
  scene.add(player);
  const eyeMaterial = sofia ? (sofia.material('MAT_Eyes_Glow') ?? null) : (rig?.eyeMaterial ?? null);
  // Перетворення в Залаштунках: силует дівчинки перетікає в Софійку.
  const girl = buildGirl();
  scene.add(girl.root);
  // Скільки викликів малювання за кадр (усі проходи світіння разом) — непряма міра частоти кадрів.
  renderer.info.autoReset = false;

  const camera = new PerspectiveCamera(60, 1, 0.1, 200);
  const bloom = createBloom(renderer, scene, camera);
  const particles = createParticles(scene);
  const sound = createSound();
  let sinceBlink = Infinity;
  let sinceHurt = Infinity;
  /** Ігровий час початку поточного Удару (для пози лапи). */
  let strikeStart: number | null = null;
  /** Після Рефлексу камера пів секунди обходить за новим поглядом Софійки. */
  let reflexCamera: { heading: number; left: number } | null = null;
  const REFLEX_CAMERA_SECONDS = 0.5;
  const hudRoot = document.getElementById('hud') ?? document.body;
  const hud = createHud(hudRoot);
  const screens = createScreens(document.body);
  // Лише в dev-збірці: частота кадрів у куті (інструмент перевірки, не текст гри).
  const meter = import.meta.env.DEV ? fpsMeter() : null;
  let meterEl: HTMLElement | null = null;
  if (import.meta.env.DEV) {
    meterEl = document.createElement('div');
    meterEl.id = 'fps-meter';
    Object.assign(meterEl.style, { position: 'fixed', right: '8px', top: '8px', font: '12px monospace', color: '#cfe', background: 'rgba(0,0,0,.45)', padding: '2px 6px', pointerEvents: 'none' });
    document.body.append(meterEl);
  }
  /** Ігровий час `sliceComplete` (у часі поточного світу), або `null`. */
  let completedAt: number | null = null;
  let endShown = false;
  if (sofia) for (const eye of sofia.meshesOf('MAT_Eyes_Glow')) bloom.mark(eye);
  else
    for (const name of ['leftEye', 'rightEye']) {
      const eye = player.getObjectByName(name);
      if (eye) bloom.mark(eye);
    }
  /** Останні значення чистих функцій показу, для перевірок у браузері. */
  const debugValues: Record<string, unknown> = {};
  // Перехід через Квітку: час — із правил (`game.transition`), GSAP лише згладжує значення.
  const fillLayer = document.getElementById('fill');
  const easeFill = gsap.parseEase('sine.inOut');
  const easeDolly = gsap.parseEase('power2.in');
  let leaving: { bud: { x: number; y: number; z: number }; color: string } | null = null;

  /** Світ показу поточного світу гри; перебудовується на `worldEntered`. */
  const worldDeps = { scene, bloom, camera, canvas, hudRoot, particles, sound, debug: debugValues };
  let worldSim = game.sim;
  /** Світло, туман і небо поточного світу. */
  const applyLook = () => {
    const palette = worldLook(game.world);
    scene.background = new Color(palette.background);
    scene.fog = new Fog(palette.fog.color, palette.fog.near, palette.fog.far);
    ambient.color.set(palette.ambient.color);
    ambient.intensity = palette.ambient.intensity;
    sun.color.set(palette.sun.color);
    sun.intensity = palette.sun.intensity;
    return palette;
  };
  let world: WorldView = createWorldView(worldDeps, worldSim, game.level, applyLook(), game.world);
  debugValues['world'] = game.world;
  debugValues['meshes'] = world.meshCount();
  /** Для перевірок: перебудувати світ показу на місці (той самий шлях, що й `worldEntered`). */
  const rebuildWorld = (): void => {
    world.dispose();
    worldSim = game.sim;
    world = createWorldView(worldDeps, worldSim, game.level, applyLook(), game.world);
    debugValues['world'] = game.world;
    debugValues['meshes'] = world.meshCount();
  };

  // Промені камери — завжди в поточний світ: старий `Sim` після зміни світу звільнено.
  const clear = (from: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number) =>
    game.sim.rayDistance(from, dir, max);
  /** Камера мишею: рискання й нахил; на старті — позаду Софійки. */
  const START_PITCH = 0.42;
  let look: Look = { yaw: game.sim.sofiyka.facing, pitch: START_PITCH };
  /** Висота, за якою стежить камера: доганяє Софійку плавно (стрибок не смикає картинку). */
  let followY = game.sim.sofiyka.position.y;
  /** Куди повернутий ведмідь на екрані: плавно доганяє погляд у правилах. */
  let shownFacing = game.sim.sofiyka.facing;
  /** За скільки ведмідь на екрані повертається в новий бік, с. */
  const TURN_SECONDS = 0.12;
  const startPose = (): CameraPose => {
    const s = game.sim.sofiyka;
    look = { yaw: s.facing, pitch: look.pitch };
    followY = s.position.y;
    shownFacing = s.facing;
    return orbitCamera(s.position, look, clear);
  };
  let pose = startPose();
  let walk = 0;
  let walkPhase = 0;
  /** Для кліпів Софійки: скільки вона в повітрі, відколи приземлилась, скільки ще грає відмикання Клітки. */
  let airSeconds = 0;
  let landedAgo = Infinity;
  let unlockLeft = 0;
  const UNLOCK_SECONDS = 1.5;

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      bloom.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
  }

  return {
    sound,
    frame(dt, events, input, smooth) {
      resize();
      // Спершу — зміна світу: далі все читає вже новий `Sim`.
      for (const e of events) {
        if (e.type !== 'worldLeft') continue;
        const flower = game.level.flowers?.find((f) => f.to === e.to && f.color === e.color);
        const p = flower?.position ?? game.sim.sofiyka.position;
        leaving = { bud: { x: p.x, y: p.y + TUNING.village.flowerBudHeight, z: p.z }, color: PETAL_COLORS[e.color] };
      }
      const entered = events.some((e) => e.type === 'worldEntered') || game.sim !== worldSim;
      if (entered) completedAt = null; // фінал належить світу, де відкрито Клітку
      if (events.some((e) => e.type === 'sliceComplete')) completedAt = game.sim.time;
      if (entered) rebuildWorld();
      const sim = game.sim;
      const s = sim.sofiyka;
      // Згладжування між кроками правил; телепорт (Blink, Рефлекс, повернення, новий світ) — без розмазування.
      const teleported = entered || events.some((e) => ['blinked', 'reflexed', 'returned', 'respawned', 'flowerEntered'].includes(e.type));
      const usePrev = smooth && !teleported;
      const shown = usePrev ? lerpVec3(smooth.previous.sofiyka.position, s.position, smooth.alpha) : { ...s.position };
      const facing = usePrev ? lerpAngle(smooth.previous.sofiyka.facing, s.facing, smooth.alpha) : s.facing;
      shownFacing = teleported ? facing : lerpAngle(shownFacing, facing, 1 - Math.exp(-dt / TURN_SECONDS));
      player.position.set(shown.x, shown.y, shown.z);
      player.rotation.y = shownFacing;
      debugValues['shown'] = shown;

      if (events.length) {
        const log = (debugValues['events'] as unknown[] | undefined) ?? [];
        for (const e of events) log.push({ t: +sim.time.toFixed(3), ...e });
        debugValues['events'] = log.slice(-60);
      }
      for (const e of events) {
        if (e.type === 'heartLost') sinceHurt = 0;
        if (e.type === 'blinked' || e.type === 'reflexed') {
          if (e.type === 'reflexed') reflexCamera = { heading: s.facing, left: REFLEX_CAMERA_SECONDS };
          sinceBlink = 0;
          particles.burst(e.from);
          particles.burst(e.to);
          try {
            sound.whoosh();
          } catch {
            // звук не повинен зупиняти гру
          }
        }
      }
      const fx = blinkPose(sinceBlink);
      sinceBlink += dt;
      const intro = game.level.intro ? introBlend(sim.time, TUNING.worlds.introSeconds) : 1;
      const bear = Math.max(0.02, intro);
      player.scale.set(fx.scale.x * bear, fx.scale.y * bear, fx.scale.z * bear);
      girl.root.visible = intro < 1;
      if (girl.root.visible) {
        const fade = 1 - intro;
        girl.root.position.set(s.position.x, s.position.y, s.position.z);
        girl.root.rotation.y = s.facing + intro * Math.PI * 2; // обертається, перетворюючись
        girl.root.scale.setScalar(Math.max(0.02, fade));
        girl.material.emissiveIntensity = 2 * Math.sin(Math.PI * intro);
      }
      debugValues['intro'] = intro;
      for (const m of sofia ? sofia.tintable : rig!.materials) {
        if (m === eyeMaterial) continue;
        m.emissive.set(fx.redFlash ? '#ff2020' : '#000000');
        m.emissiveIntensity = fx.redFlash ? 1.5 : 1;
      }
      bloom.setAberration(fx.aberration);
      particles.trail(s.position, s.mode === 'RUN');
      particles.update(dt);
      walk += ((s.mode === 'RUN' ? 1 : 0) - walk) * Math.min(1, dt * 12);
      walkPhase += dt * 11 * walk;
      if (s.mode === 'ATTACK' && strikeStart === null) strikeStart = sim.time - TUNING.step;
      if (s.mode !== 'ATTACK') strikeStart = null;
      const arm = strikePose(strikeStart === null ? 0 : sim.time - strikeStart, TUNING.strikeSeconds);
      debugValues['strike'] = { mode: s.mode, ...arm };
      if (sofia) {
        // Кліп за станом правил; у Вікні (повільний час) анімація йде повільніше разом з усім.
        if (events.some((e) => e.type === 'cageOpened')) unlockLeft = UNLOCK_SECONDS;
        if (!s.grounded) {
          airSeconds += dt;
          landedAgo = Infinity;
        } else {
          if (airSeconds > 0) landedAgo = 0;
          else landedAgo += dt;
          airSeconds = 0;
        }
        if (s.mode === 'RUN' || !s.grounded) unlockLeft = 0;
        const clip = sofiaClip({ grounded: s.grounded, running: s.mode === 'RUN', airSeconds, landedAgo, unlockLeft });
        sofia.play(clip, { once: clip === 'Jump_Start' || clip === 'Land' || clip === 'Unlock_Cage', fade: clip === 'Land' ? 0.05 : 0.12 });
        sofia.update(dt * sim.timeScale);
        sofia.swingBone('DEF_upperarm.R', -arm.armSwing); // удару в анімації немає: права лапа б'є поверх кліпу
        unlockLeft = Math.max(0, unlockLeft - dt);
        debugValues['clip'] = { name: sofia.current(), airSeconds, landedAgo, jumpStart: JUMP_START_SECONDS };
      } else {
        const bob = animateBear(rig!, sim.time, walk, walkPhase, arm);
        player.position.y = shown.y + bob;
      }
      world.frame(
        dt,
        events.filter((e): e is SimEvent => e.type !== 'worldLeft' && e.type !== 'worldEntered'),
        smooth && !entered ? smooth : undefined,
      );
      player.visible = blinkVisible(s.invulnerable, sim.time);
      hud.update(s.hearts, TUNING.hearts);
      hud.flash(hurtFlash(sinceHurt));
      sinceHurt += dt;
      const slow = slowdownFx(sim.slowdown.open, sim.slowdown.remaining, TUNING.slowdownSeconds);
      bloom.setGrade(slow.tint, slow.vignette);
      const head = new Vector3(s.position.x, s.position.y + 2.2, s.position.z).project(camera);
      const pulse = slow.hintScale > 0 ? 1 + 0.12 * Math.sin(performance.now() / 70) : 0;
      hud.hint(((head.x + 1) / 2) * canvas.clientWidth, ((1 - head.y) / 2) * canvas.clientHeight, slow.hintScale * pulse);
      debugValues['slowdown'] = { ...slow, open: sim.slowdown.open, timeScale: sim.timeScale };
      debugValues['hud'] = { hearts: s.hearts, visible: player.visible, flash: hurtFlash(sinceHurt - dt) };

      if (entered || events.some((e) => e.type === 'respawned' || e.type === 'returned' || e.type === 'flowerEntered')) {
        pose = startPose();
      } else {
        // Після Рефлексу камера сама обходить за новим поглядом (пів секунди), далі — знову миша.
        if (reflexCamera) look = { ...look, yaw: lerpAngle(look.yaw, reflexCamera.heading, 1 - Math.exp(-dt * TUNING.cameraTurnRate)) };
        followY = followHeight(followY, shown.y, dt);
        pose = orbitCamera({ x: shown.x, y: followY, z: shown.z }, look, clear);
      }
      void input;
      debugValues['cameraY'] = pose.position.y;
      if (reflexCamera) {
        reflexCamera.left -= dt;
        if (reflexCamera.left <= 0) reflexCamera = null;
      }
      debugValues['camera'] = { yaw: pose.yaw, reflex: reflexCamera ? { ...reflexCamera } : null, sinceBlink, aberration: fx.aberration };
      const T = TUNING.worlds.transitionSeconds;
      const elapsed = game.transition > 0 ? T - game.transition : 0;
      const fill = game.transition > 0 ? easeFill(transitionFill(elapsed, T)) : 0;
      const dolly = game.transition > 0 && leaving ? easeDolly(transitionDolly(elapsed, T)) : 0;
      if (game.transition <= 0) leaving = null;
      if (fillLayer) {
        fillLayer.style.opacity = fill.toFixed(3);
        if (leaving) fillLayer.style.background = leaving.color;
      }
      debugValues['transition'] = { remaining: game.transition, fill, dolly, color: leaving?.color ?? null };
      const lookTarget = leaving && dolly > 0 ? leaving.bud : pose.lookAt;
      const at = leaving && dolly > 0
        ? {
            x: pose.position.x + (leaving.bud.x - pose.position.x) * dolly * 0.85,
            y: pose.position.y + (leaving.bud.y - pose.position.y) * dolly * 0.85,
            z: pose.position.z + (leaving.bud.z - pose.position.z) * dolly * 0.85,
          }
        : pose.position;
      // Тіні — навколо Софійки: світи довші за квадрат тіней (Стільники ≈ 90 м).
      sun.position.set(s.position.x + 12, s.position.y + 20, s.position.z - 8);
      sun.target.position.set(s.position.x, s.position.y, s.position.z);
      sun.target.updateMatrixWorld();
      camera.position.set(at.x, at.y, at.z);
      camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
      if (eyeMaterial) eyeMaterial.emissiveIntensity = eyeIntensity(s.blinkCooldown, TUNING);
      // Фінал: фіолетовий туман Селища змінюється теплим світлом, потім «Далі буде».
      if (completedAt !== null) {
        const since = sim.time - completedAt;
        const light = finaleLight(since);
        const palette = worldLook(game.world);
        const warm = new Color('#ffcf8a');
        if (scene.fog instanceof Fog) scene.fog.color.set(palette.fog.color).lerp(warm, light.warm);
        ambient.color.set(palette.ambient.color).lerp(warm, light.warm);
        ambient.intensity = palette.ambient.intensity + 1.2 * light.warm;
        sun.color.set(palette.sun.color).lerp(warm, light.warm);
        debugValues['finale'] = { ...light, since };
        if (!endShown && showToBeContinued(since)) {
          endShown = true;
          screens.showToBeContinued();
        }
      }
      if (meter && meterEl) {
        meter.tick(performance.now());
        const fps = meter.fps();
        meterEl.textContent = `${fps.toFixed(0)} fps · ${game.world}`;
        debugValues['fps'] = fps;
      }
      renderer.info.reset();
      bloom.render();
      debugValues['drawCalls'] = renderer.info.render.calls;
    },
    cameraYaw: () => look.yaw,
    mouse(dx, dy) {
      look = applyMouse(look, dx, dy);
    },
    turnKeys(pressed, dt) {
      look = turnWithKeys(look, pressed, dt);
    },
    showSplash: (onStart) => screens.showSplash(onStart),
    probe: {
      meanColor(box) {
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const k = w / Math.max(1, canvas.clientWidth);
        const x0 = Math.max(0, Math.floor((box?.x ?? 0) * k));
        const y0 = Math.max(0, Math.floor((box?.y ?? 0) * k));
        const bw = Math.min(w - x0, Math.max(1, Math.floor((box?.w ?? canvas.clientWidth) * k)));
        const bh = Math.min(h - y0, Math.max(1, Math.floor((box?.h ?? canvas.clientHeight) * k)));
        const data = new Uint8Array(bw * bh * 4);
        gl.readPixels(x0, h - y0 - bh, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, data);
        const sum = [0, 0, 0];
        for (let i = 0; i < data.length; i += 4) {
          sum[0]! += data[i]!;
          sum[1]! += data[i + 1]!;
          sum[2]! += data[i + 2]!;
        }
        const n = data.length / 4;
        return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
      },
      toScreen(at) {
        const v = new Vector3(at.x, at.y, at.z).project(camera);
        return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
      },
      values: () => ({ ...debugValues }),
      rebuildWorld,
    },
    dispose() {
      particles.dispose();
      world.dispose();
      hud.dispose();
      bloom.dispose();
      if (rig) disposeBear(rig);
      sofia?.dispose();
      girl.dispose();
      screens.dispose();
      meterEl?.remove();
      renderer.dispose();
    },
  };
}
