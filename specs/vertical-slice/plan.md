# last-bear — план Ітерації 1 «Софійка»

**Мета:** у браузері бігає, стрибає і робить Blink чорна Софійка зі світними червоними очима, а ті самі правила руху проходять тести без браузера.

Специфікація: [spec.md](spec.md). Терміни: [CONTEXT.md](../../CONTEXT.md). Ітерації 2–4 плануються окремо, коли до них дійде черга.

## Global Constraints

- Проєкт `mine/games/last-bear`, id `last-bear`, порт 5104, власний git-репозиторій. Робота йде на гілці `feat/sofiyka`, не на `main`.
- Vite, TypeScript, Three.js на WebGL2, Rapier3D. Без React. GSAP в Ітерації 1 не потрібен (переходи між світами — Ітерація 4).
- Версії, перевірені 2026-11-15: `three` 0.187.0 і `vitest` 5.1.0 (ті самі, що в `small-bear-journey`), `@dimforge/rapier3d-compat` 0.21.0 (у Node 26 світ крокує, є контролер персонажа і рейкаст), pnpm 12.
- Комп'ютер, клавіатура + миша. Камера сама йде за Софійкою.
- Правила гри не імпортують `three`, DOM чи Web Audio (ADR 0001). Перевіряється тестом на імпорти в S1.
- Усі числа налаштувань — в одному файлі `src/sim/tuning.ts`.
- Без `GlitchPass`; при Blink лише м'яка хроматична аберація по краях.
- Усе процедурне, без файлів моделей і звуку.
- Перевірка проєкту: `pnpm test && pnpm typecheck && pnpm build`.

## Frame

**Проблема.** Гри ще немає. Усе подальше (вороги, Рефлекс, світи) стоїть на русі Софійки і на Blink, тож вони мають бути приємними в руках дитини і надійними в тестах.

**Рішення.** Два шари. Шар правил (`sim`) крокує по 1/60 с, приймає натиски й віддає стан Софійки та події. Шар показу (`view`) читає стан, малює ведмедя, веде камеру, вмикає ефекти і звук.

**Історії користувача**

1. Дитина бачить чорного ведмедя з червоними очима, що світяться.
2. Дитина веде Софійку стрілками або WASD; «вгору» завжди означає «від камери».
3. Дитина стрибає пробілом і ще раз у повітрі.
4. Дитина не керує камерою: вона сама тримається позаду і не заходить у стіни.
5. Дитина тисне `Shift` — Софійка миттєво опиняється попереду, зокрема по той бік ґрат, але ніколи не в стіні.
6. Дитина бачить за очима, чи готовий Blink: після Blink вони тьмяніють і за 2 с знову яскраві.
7. Blink відчувається: ведмідь витягується і спалахує червоним, краї екрана розшаровуються, летять частинки, чути «вжух».
8. Софійка, що впала вниз, повертається на старт.
9. Розробник запускає гру командою з реєстру воркспейсу і має зелені перевірки.

**Поза Ітерацією 1:** вороги, Сенсор, Вікно, Рефлекс, Удар, Серця, Селище, Квітки, Залаштунки, Стільники, рухомі платформи, Бульбашки, заставка.

**Рішення щодо правил**

- Одна швидкість руху. Специфікація дизайну називає ходьбу і біг, але клавіші не мають «півнатиску», а окрема кнопка бігу — зайва для 4–6 років.
- Blink працює і в повітрі (це потрібно для Стільників) і обнуляє вертикальну швидкість.
- Blink летить у напрямку погляду Софійки на `blinkDistance`. Суцільна стіна зупиняє його перед собою; ґрати не зупиняють. Якщо місце прибуття зайняте, Софійка відступає назад уздовж шляху до першого вільного місця. Якщо вільного місця далі за 0.5 м немає, Blink не відбувається і перезарядка не витрачається.
- Перезарядка Blink — 2 с ігрового часу.
- Стартові числа (правляться після гри дитини): швидкість 5 м/с, висота стрибка 1.6 м, другого — 1.3 м, прискорення падіння 25 м/с², `blinkDistance` 6 м, капсула Софійки: радіус 0.4 м, висота 1.4 м.
- Показ не згладжує рух між кроками правил: кадр малює останній стан.

**Рішення щодо тестів**

- Інструмента наскрізних тестів у проєкті немає, тому перший зріз замикає тест на найвищому шві — `createSim` + `step`.
- Добрий тест тут — сценарій натисків: рівень із кількох блоків, послідовність `step(input)`, перевірка стану Софійки і подій. Жодних перевірок внутрішніх полів Rapier.
- Межа «правила ↔ Rapier» перевіряється в кожному зрізі правил справжнім Rapier, без підмін.
- Показ перевіряється двома способами: чисті функції (камера, яскравість очей, поза) — тестами; картинка — кадром із браузера.
- Зразок: `small-bear-journey/src/entities/bear/lib/build-bear.test.ts` будує ведмедя в Node і перевіряє граф сцени.

## Seam

Один шов на всю ітерацію:

```ts
// src/sim/level.ts
export type Vec3 = { x: number; y: number; z: number };
export type Block = { kind: 'solid' | 'bars'; center: Vec3; halfExtents: Vec3 };
export type Level = { blocks: Block[]; spawn: Vec3; killY: number };

// src/sim/input.ts
/** moveX/moveZ — напрямок у світі, -1..1. jump/blink — «клавіша зараз натиснута»; фронт натиску визначають правила. */
export type Input = { moveX: number; moveZ: number; jump: boolean; blink: boolean };
export const NO_INPUT: Input;

// src/sim/sim.ts
export type SofiykaMode = 'IDLE' | 'RUN' | 'JUMP' | 'BLINK';
export type SofiykaState = {
  position: Vec3;        // підошви
  facing: number;        // рад, 0 = +z
  velocityY: number;
  grounded: boolean;
  jumpsUsed: 0 | 1 | 2;
  blinkCooldown: number; // с до готовності, 0 = готовий
  mode: SofiykaMode;
};
export type SimEvent =
  | { type: 'jumped'; double: boolean }
  | { type: 'landed' }
  | { type: 'blinked'; from: Vec3; to: Vec3 }
  | { type: 'respawned' };
export type Sim = {
  step(input: Input): SimEvent[];   // рівно 1/60 с
  readonly sofiyka: SofiykaState;
  readonly time: number;            // с ігрового часу
  rayDistance(from: Vec3, dir: Vec3, max: number): number; // до суцільного блока; max, якщо вільно
  dispose(): void;
};
export function createSim(level: Level, tuning?: Tuning): Promise<Sim>;
```

## Slices

Порядок: S0 → S1 → S2 → S3; S4 можна вести паралельно з S1–S3; S5 після S1 і S4; S6 після S3 і S5; S7 після S6.

---

### S0 — Каркас проєкту

Історії: 9. **Blocked-by:** None.

**Files**
- `package.json`, `tsconfig.json`, `vite.config.ts` (з налаштуванням Vitest), `eslint.config.mjs`, `.gitignore`, `index.html`
- `src/main.ts` (порожня сторінка з `<canvas>`)
- `src/sim/world.ts`, `src/sim/world.test.ts`
- `AGENTS.md`
- у воркспейсі: запис `last-bear` у `projects.yaml` (перед цим завантажити `workspace-playbooks`)

**Interfaces**
- Produces: `createWorld(): Promise<{ rapier: typeof RAPIER; world: RAPIER.World }>` — світ із кроком 1/60 і прискоренням падіння з `tuning`.
- Скрипти: `dev` (порт 5104), `test`, `typecheck`, `build`.

**Acceptance**
1. Given світ із підлогою і кулею на висоті 5 м, When зроблено 300 кроків, Then куля лежить на підлозі (її `y` у межах 0.01 м від радіуса над підлогою).
2. Given свіжий клон, When виконано `pnpm install && pnpm test && pnpm typecheck && pnpm build`, Then усі чотири завершуються з кодом 0.
3. Given запущено `pnpm dev --port 5104`, When відкрито `http://localhost:5104`, Then сторінка віддає `<canvas>` без помилок у консолі.

**Verify:** `pnpm test && pnpm typecheck && pnpm build`; сторінка — у вбудованому браузері.

Незворотний крок: `git init` у `mine/games/last-bear` і перший коміт на `feat/sofiyka`.

---

### S1 — Софійка ходить

Історії: 2 (частина правил). **Blocked-by:** S0.

**Files**
- `src/sim/tuning.ts`, `src/sim/level.ts`, `src/sim/input.ts`, `src/sim/sim.ts`
- `src/sim/sim.walk.test.ts`, `src/sim/sim.imports.test.ts`

**Interfaces**
- Consumes: `createWorld` (S0).
- Produces: `Tuning`, `TUNING`, `Level`, `Block`, `Vec3`, `Input`, `NO_INPUT`, `createSim`, `Sim`, `SofiykaState` (шов вище; у цьому зрізі `mode` буває лише `IDLE` і `RUN`).

**Acceptance**
1. Given Софійка на рівній підлозі, When 60 кроків із `moveZ: 1`, Then вона зсунулась уздовж +z на 5 м ± 0.1, `facing` ≈ 0, `mode` = `RUN`; після кроку з `NO_INPUT` `mode` = `IDLE`.
2. Given суцільний блок за 2 м попереду, When 120 кроків руху на нього, Then Софійка стоїть перед блоком і не перетинає його.
3. Given блок `bars` попереду, When 120 кроків руху на нього, Then Софійка так само не проходить.
4. Given файли в `src/sim/`, When тест читає їхні імпорти, Then жоден не імпортує `three`, `gsap` і не згадує `document`, `window`, `AudioContext`.

**Verify:** `pnpm test src/sim`

---

### S2 — Стрибок, подвійний стрибок, падіння вниз

Історії: 3, 8. **Blocked-by:** S1.

**Files**
- `src/sim/sim.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/sim/sim.jump.test.ts`

**Interfaces**
- Produces: події `jumped`, `landed`, `respawned`; `mode` = `JUMP`; `jumpsUsed`.

**Acceptance**
1. Given Софійка стоїть, When натиснуто `jump` і йдуть кроки до приземлення, Then найвища точка — 1.6 м ± 0.1, події: `jumped{double:false}`, потім `landed`.
2. Given Софійка в повітрі після першого стрибка, When `jump` відпущено і натиснуто знову, Then подія `jumped{double:true}`; третє натискання в повітрі нічого не дає.
3. Given `jump` тримають затиснутим, When Софійка приземлилась, Then нового стрибка немає, доки клавішу не відпустять і не натиснуть знову.
4. Given Софійка зійшла з краю, When її `y` опустився нижче `killY`, Then вона на `spawn` з нульовою швидкістю і є подія `respawned`.

**Verify:** `pnpm test src/sim`

---

### S3 — Blink

Історії: 5, 6 (частина правил). **Blocked-by:** S2.

**Files**
- `src/sim/blink.ts`, `src/sim/sim.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/sim/sim.blink.test.ts`, `src/sim/blink.property.test.ts`

**Interfaces**
- Produces: `resolveBlink(world, from: Vec3, facing: number, tuning: Tuning): Vec3 | null` — місце прибуття або `null`; подія `blinked`; `blinkCooldown`; `mode` = `BLINK` на крок Blink.

**Acceptance**
1. Given відкрита підлога і готовий Blink, When натиснуто `blink`, Then за один крок Софійка на 6 м ± 0.05 попереду за `facing`, `blinkCooldown` = 2, подія `blinked{from,to}`.
2. Given суцільна стіна за 3 м, When Blink, Then Софійка перед стіною, не далі; Given ґрати за 3 м і вільне місце за ними, When Blink, Then Софійка по той бік ґрат.
3. Given Blink щойно зроблено, When `blink` натискають знову раніше ніж за 2 с, Then нічого не відбувається; через 120 кроків Blink знову працює. Given Софійка в повітрі, When Blink, Then `velocityY` = 0.
4. Given рівень із суцільних блоків і ґрат та генератор із фіксованим зерном, When Blink виконано з 1000 випадкових дозволених позицій і напрямків, Then після кожного капсула Софійки не перетинає жодного блока.

**Verify:** `pnpm test src/sim`

---

### S4 — Ведмідь Софійки

Історії: 1 (модель). **Blocked-by:** S0.

**Files**
- `src/entities/bear/layout.ts`, `src/entities/bear/build-bear.ts`, `src/entities/bear/animate.ts` — копія з `small-bear-journey/src/entities/bear` (чистий Three.js, React там немає)
- `src/entities/bear/skins.ts`
- тести: копії `layout.test.ts`, `build-bear.test.ts` + `skins.test.ts`

**Interfaces**
- Produces: `buildBear(skin: BearSkin, p?: BearProportions): BearRig`, де `BearSkin = { fur: string; light: string; dark: string; eyes: { color: string; emissiveIntensity: number } | null; backpack: boolean }`; `SOFIYKA_SKIN` (тіло `#0a0a0f`, шорсткість 0.85, очі `#ff0033`, інтенсивність 4.0, без рюкзака); `BearRig` отримує поле `eyeMaterial: MeshStandardMaterial | null`; `animateBear`, `disposeBear` без змін.

**Acceptance**
1. Given `SOFIYKA_SKIN`, When викликано `buildBear`, Then `leftEye` і `rightEye` мають один матеріал із `emissive` `#ff0033` та інтенсивністю 4.0, і він доступний як `rig.eyeMaterial`.
2. Given `SOFIYKA_SKIN`, When викликано `buildBear`, Then у графі немає вузлів рюкзака, а матеріал тіла має колір `#0a0a0f`.
3. Given скопійовані тести розкладки й побудови, When їх запущено, Then вони зелені.

**Verify:** `pnpm test src/entities`

---

### S5 — Гра на екрані: сцена, клавіатура, камера

Історії: 1, 2, 3, 4. **Blocked-by:** S1, S4 (стрибок і Blink з'являються на екрані, щойно готові S2 і S3).

**Files**
- `src/view/keyboard.ts`, `src/view/follow-camera.ts`, `src/view/game-view.ts`, `src/levels/playground.ts`, `src/main.ts` (зміна)
- `src/view/keyboard.test.ts`, `src/view/follow-camera.test.ts`

**Interfaces**
- Consumes: `createSim`, `Sim`, `Input`, `Level`, `buildBear`, `SOFIYKA_SKIN`, `animateBear`.
- Produces:
  - `keysToInput(pressed: ReadonlySet<string>, cameraYaw: number): Input` — стрілки і WASD; «вгору» = від камери; `Space` → `jump`; `ShiftLeft`/`ShiftRight` → `blink`.
  - `followCamera(prev: CameraPose, target: Vec3, facing: number, dt: number, clear: (from: Vec3, dir: Vec3, max: number) => number): CameraPose`, де `CameraPose = { position: Vec3; lookAt: Vec3; yaw: number }`.
  - `createGameView(canvas: HTMLCanvasElement, sim: Sim, level: Level): { frame(dtSeconds: number, events: SimEvent[]): void; cameraYaw(): number; dispose(): void }`.
  - `PLAYGROUND: Level` — майданчик: підлога, сходинки, стіна, ґрати, край із прірвою.
  - `main.ts`: накопичувач часу, що викликає `sim.step` по 1/60 с (не більше 5 кроків на кадр) і `view.frame`.

**Acceptance**
1. Given камера дивиться вздовж +z, When натиснута `ArrowUp`, Then `Input` має `moveZ: 1, moveX: 0`; Given камера повернута на 90°, Then той самий натиск дає рух уздовж осі, куди дивиться камера. `KeyW` дає те саме, що `ArrowUp`.
2. Given Софійка стоїть і дивиться вздовж +z, When `followCamera` крокує 2 с, Then камера позаду (менший `z`) і вище за Софійку та дивиться на неї; Given `clear` повертає 1.5 м при бажаній відстані 6 м, Then камера не далі 1.5 м від Софійки.
3. Given Софійка розвернулась на 180°, When минуло 0.5 с, Then `yaw` камери пройшов щонайменше 80% шляху до нового напрямку, без стрибка за один кадр.
4. Given `pnpm dev --port 5104` і майданчик у браузері, When стрілками проведено Софійку і натиснуто `Space`, Then на знятому кадрі чорний ведмідь стоїть на підлозі в іншому місці, камера позаду нього, консоль без помилок.

**Verify:** `pnpm test src/view`; кадр і консоль — у вбудованому браузері.

---

### S6 — Світні очі та індикатор Blink

Історії: 1 (світіння), 6. **Blocked-by:** S3, S5.

**Files**
- `src/view/eye-glow.ts`, `src/view/bloom.ts`, `src/view/game-view.ts` (зміна)
- `src/view/eye-glow.test.ts`

**Interfaces**
- Produces:
  - `eyeIntensity(blinkCooldown: number, tuning: Tuning): number` — 4.0 при готовності, 0.5 одразу після Blink, плавно назад за час перезарядки.
  - `createBloom(renderer, scene, camera): { render(): void; setSize(w: number, h: number): void; mark(object: Object3D): void; dispose(): void }` — вибіркове світіння: світяться лише позначені об'єкти. Спосіб — два компонувальники зі шаром для світних об'єктів, як у прикладі Three.js `webgl_postprocessing_unreal_bloom_selective`; перед написанням звірити імена класів із документацією `three` 0.187.

**Acceptance**
1. Given `blinkCooldown` = 0, Then `eyeIntensity` = 4.0; Given 2.0, Then 0.5; Given 1.0, Then значення строго між 0.5 і 4.0; функція не спадає, коли перезарядка зменшується.
2. Given гра в браузері, When знято кадр до Blink і одразу після, Then на першому очі мають червоний ореол, на другому він помітно слабший, а підлога і тіло ведмедя ореолу не мають на жодному.

**Verify:** `pnpm test src/view`; два кадри — у вбудованому браузері.

---

### S7 — Blink відчувається: поза, краї екрана, частинки, звук

Історії: 7. **Blocked-by:** S6.

**Files**
- `src/view/blink-fx.ts`, `src/view/particles.ts`, `src/view/sound.ts`, `src/view/game-view.ts` (зміна)
- `src/view/blink-fx.test.ts`

**Interfaces**
- Consumes: подія `blinked{from,to}`.
- Produces:
  - `blinkPose(secondsSinceBlink: number): { scale: Vec3; redFlash: boolean; aberration: number }` — перші 0.05 с: `scale` (0.2, 0.2, 2.5) і `redFlash: true`; `aberration` спадає від 1 до 0 за 0.15 с; далі `scale` (1, 1, 1), `redFlash: false`, `aberration` 0.
  - `createParticles(scene): { burst(at: Vec3): void; trail(at: Vec3, moving: boolean): void; update(dt: number): void; dispose(): void }` — чорний дим і жовтий пил.
  - `createSound(): { whoosh(): void; resume(): void }` — синтез через Web Audio; `resume` викликається першим натиском клавіші.
  - Прохід хроматичної аберації по краях, сила = `aberration`.

**Acceptance**
1. Given `secondsSinceBlink` = 0.02, Then `scale` = (0.2, 0.2, 2.5) і `redFlash` = true; Given 0.1, Then `scale` = (1, 1, 1), `redFlash` = false, 0 < `aberration` < 1; Given 0.2, Then `aberration` = 0.
2. Given гра в браузері, When натиснуто `Shift` і знято кадр у межах 0.15 с, Then краї кадру мають кольорове розшарування, центр — ні, у місці старту видно частинки; на кадрі через 1 с розшарування немає.
3. Given гра в браузері після першого натиску клавіші, When натиснуто `Shift`, Then `AudioContext` у стані `running` і консоль без помилок. Сам звук на слух перевіряє користувач.

**Verify:** `pnpm test src/view`; кадри й консоль — у вбудованому браузері; фінал ітерації: `pnpm test && pnpm typecheck && pnpm build`.

## Покриття

| Вимога специфікації (Ітерація 1) | Зріз |
| --- | --- |
| Проєкт, порт, реєстр, перевірки | S0 |
| Правила без рендеру (ADR 0001) | S0, S1 |
| Рух, одна швидкість | S1, S5 |
| Стрибок і подвійний стрибок | S2 |
| Blink, перезарядка, ґрати, «ніколи в стіні» (умова готовності 3) | S3 |
| Чорний ведмідь, одна модель з різними шкурами | S4 |
| Камера сама, не в стінах | S5 |
| Вибіркове світіння, очі як індикатор | S6 |
| Аберація по краях, частинки, звук «вжух» | S7 |
| Числа в одному місці | S1 (`tuning.ts`), далі всі |

Умови готовності 1 і 2 зі специфікації (Проходження всього Зрізу) в Ітерації 1 ще не досяжні; тут закладається шов, на якому Проходження ростиме.
