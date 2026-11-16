# last-bear — план Ітерації 3 «Селище»

**Мета:** у Селищі Вцілілий Бульбашками показує, куди йти, Доріжка з пилку веде туди, на площі Черепаха і дві Бджоли, жовта Квітка розкривається при наближенні й приймає стрибок у бутон, а Ключ відкриває єдину справжню Клітку. Правила — без браузера (ADR 0001), плюс показ на екрані.

Специфікація: [spec.md](spec.md). Терміни: [CONTEXT.md](../../CONTEXT.md). Ітерації 1–2: [plan.md](plan.md), [plan-iteration-2.md](plan-iteration-2.md) (готові). Ітерація 4 планується окремо.

Версія 2: переписана після незалежного рев'ю (три блокери й прогалини враховано).

## Global Constraints

- Той самий проєкт і гілка: `mine/games/last-bear`, `feat/sofiyka`. Не `main`.
- Правила (`src/sim`, з підпапками) не імпортують `three`, `gsap`, DOM, Web Audio (ADR 0001); тест `sim.imports.test.ts` забороняє слова `document`, `window`, `AudioContext`.
- Усі числа — у `src/sim/tuning.ts`; нові — вкладені: `tuning.village.*`.
- Жодного тексту на екрані: Бульбашки — малюнки, Доріжка — світний пилок.
- Усе процедурне. Усі ведмеді — одна модель (`src/entities/bear`) з іншими кольорами й аксесуарами.
- Без `GlitchPass`, без різких звуків.
- Перевірка кожного зрізу — команда з `pnpm typecheck`; фінал — `pnpm test && pnpm typecheck && pnpm build`.
- Кадри — у вбудованому браузері; якщо панель прихована, кадри крокуються вручну через `__lastBear.advance` (так робилось в Ітерації 2), розмір вікна 800×600.

## Припущення, що закривають відкриті питання

Кожне — число або правило в `tuning.ts`, його легко змінити.

1. **Ключа в Селищі не знайти:** Ключ випадає з Джерела (Ітерація 4). В Ітерації 3 Ключ потрапляє до Софійки лише через параметр старту правил (`createSim(level, tuning, { keys: 1 })`) — для тестів і для `?keys=1` у dev-збірці.
2. **Клітка відкривається сама,** коли Софійка з Ключем підходить до її стінки ближче за `cageOpenRadius` (відстань по xz від осі капсули до прямокутника Клітки, з будь-якого боку); окремої клавіші немає (дитина не читає підказок про клавіші).
3. **Чотири Клітки — декорація:** ніколи не відкриваються, навіть із Ключем, і Ключ біля них не витрачається.
4. **Стрибок у бутон:** Софійка, яка в повітрі, опускається крізь висоту бутона (`flowerBudHeight` 1.0 м над землею) в межах `flowerEnterRadius` по xz від центру розкритої Квітки. Ніжка Квітки — суцільний стовпчик нижчий за бутон (верх 0.6 м), тож зійти з неї не означає увійти в Квітку. Подія `flowerEntered`. Перехід у Стільники — Ітерація 4; в Ітерації 3 після `flowerEntered` Софійка стоїть на Контрольній точці Селища, а показ дає хмарку пилку.
5. **Бульбашка:** поки Софійка ближче за `talkRadius` до Вцілілого, він по колу показує малюнки за станом гри (таблиця в S28).
6. **Доріжка** веде від Вцілілого: без Ключа — до жовтої Квітки, з Ключем — до справжньої Клітки, після звільнення Полоненого — зникає.
7. **Контрольна точка Селища** — біля Вцілілого. Відкрита Клітка теж стає Контрольною точкою (так у `CONTEXT.md`): фіксоване місце перед її дверима, `cageCheckpointDistance` від центру Клітки в напрямку `facing`. Відродження зберігає Ключі й відкриті Клітки.
8. **Вороги площі стоять осторонь:** кожна Контрольна точка, кожна точка Доріжки і кожна Квітка далі від кожного ворога, ніж його `aggroRadius` + 1 м. Бій на площі — за бажанням дитини, а не на шляху. Це перевіряє тест рівня (S22).
9. **Умова готовності 5 (≥ 50 кадрів/с на комп'ютері користувача)** — у фінальному ручному проходженні Ітерації 4: це перевірка всіх трьох світів на машині користувача, а не панелі агента.

## Frame

**Проблема.** Є Софійка й вороги, але немає світу з метою. Дитина, що не читає, має сама зрозуміти: «треба до Квітки», а з Ключем — «до Клітки».

**Рішення.** Розширити той самий шов (`createSim` / `Sim.step`): рівень описує Клітки, Квітки, Вцілілого і Доріжку; `Sim` віддає стан Кліток і Квіток, Ключі Софійки, Контрольну точку й нові події. Геометрію Кліток і ніжок Квіток рахує одна спільна чиста функція, тож її бачать і світ Rapier, і тести, і показ. Правила знають лише, куди веде Доріжка (`progressOf`, `trailPath` — потрібні ботові); як Бульбашка й Доріжка виглядають — у показі.

**Історії користувача**

1. Дитина з'являється в Селищі біля бурого Вцілілого з шарфом і ліхтарем.
2. Підійшовши до Вцілілого, дитина бачить Бульбашку з малюнками: Клітка → Ключ → жовта Квітка.
3. Дитина бачить Доріжку зі світного пилку, що веде до жовтої Квітки.
4. На площі дитина зустрічає Черепаху і дві Бджоли й пробує Рефлекс та Удар.
5. Дитина бачить п'ять Кліток з ведмедями; лише одна має світний замок.
6. Жовта Квітка розкривається, коли дитина поруч; дві інші — закриті бутони.
7. Стрибок у розкриту Квітку — хмарка пилку й подія для переходу (сам перехід — Ітерація 4).
8. З Ключем Доріжка веде до справжньої Клітки; підійшовши, дитина відкриває її, Полонений радіє.
9. Відродження в Селищі повертає Софійку до Контрольної точки з п'ятьма Серцями, Ключ і відкрита Клітка лишаються.
10. Розробник проганяє «Проходження» Селища без браузера: бот доходить до Квітки й стрибає в неї; бот із Ключем відкриває Клітку.
11. Розробник має тести на гілки правил Ітерації 2, які рев'ю назвало непокритими.

**Поза Ітерацією 3:** Залаштунки, Стільники, Джерело, Ключ із Джерела, переходи між світами (наїзд камери, заливка кольором, GSAP), фіолетовий туман і тепле світло фіналу, «Далі буде», заставка.

**Рішення щодо тестів**

- Найвищий шов: `createSim` + `step(input)`; сценарій натискань → стан і події.
- Чисті функції (геометрія Кліток, розкриття Квітки, куди веде Доріжка, кадри Бульбашки, точки пилку) тестуються окремо.
- Blink на 1000 випадкових позицій у Селищі (частина умови готовності 3).
- «Проходження» Селища — бот у Node на справжньому Rapier, продовження арени з S20.
- Показ: чисті функції — тестами; картинка — кадром із браузера з критерієм, що може впасти: значення в `view.probe.values()`, атрибут DOM-елемента або різниця середнього кольору з числовим порогом, записаним у плані.
- Тести, що описують уже наявну поведінку (S21), не можуть бути червоними першими; замість цього кожен перевіряється мутацією: тест падає, якщо прибрати рядок, що він захищає.

## Seam

Той самий шов, розширений.

```ts
// src/sim/level.ts
export type BlockLook = 'ground' | 'house' | 'stem';            // як показ малює блок; за замовчуванням 'ground'
export type Block = { kind: 'solid' | 'bars'; center: Vec3; halfExtents: Vec3; look?: BlockLook };
export type CageSpawn = { id: string; position: Vec3; facing: number; working: boolean }; // position — центр підлоги Клітки; facing — куди дивляться двері
export type FlowerSpawn = { id: string; position: Vec3; color: 'yellow' | 'pink' | 'blue'; opens: boolean }; // position — земля під центром ніжки
export type Level = {
  blocks: Block[]; spawn: Vec3; killY: number; enemies?: EnemySpawn[];
  cages?: CageSpawn[]; flowers?: FlowerSpawn[];
  survivor?: { position: Vec3; facing: number };
  trail?: { flower: Vec3[]; cage: Vec3[] }; // ламані по землі від Вцілілого до жовтої Квітки і до дверей справжньої Клітки
};

// src/sim/village-geometry.ts — спільне для світу, тестів і показу
export function cageBlocks(cage: CageSpawn, open: boolean): Block[];   // стінки й дах; відкрита — без дверей
export function stemBlock(flower: FlowerSpawn, tuning: Tuning): Block;  // look 'stem'
export function levelBlocks(level: Level, openCages: ReadonlySet<string>, tuning: Tuning): Block[]; // blocks + Клітки + ніжки

// src/sim/sim.ts
export type SimStart = { keys?: number };
export function createSim(level: Level, tuning?: Tuning, start?: SimStart): Promise<Sim>;
// SofiykaState: + keys: number
export type CageState = { id: string; open: boolean; working: boolean };
export type FlowerState = { id: string; openness: number }; // 0 — бутон, 1 — розкрита
export type SimEvent = /* Ітерації 1–2 */ ...
  | { type: 'cageOpened'; id: string }
  | { type: 'flowerEntered'; id: string };
export type Sim = {
  // ... як в Ітерації 2, і ще:
  readonly cages: readonly CageState[];     // S23
  readonly flowers: readonly FlowerState[]; // S24
  readonly checkpoint: Vec3;                // S23
};

// src/sim/scenario.ts
export function playScenario(sim: Sim, bot: Bot, maxSteps: number, until?: (events: SimEvent[]) => boolean): { events: SimEvent[]; steps: number };
// без `until` — як у S20 (до кінця ворогів); з `until` — до першого кроку, де він true, або `maxSteps`
```

`buildLevel(world, level)` у `world.ts` будує `levelBlocks(level, ∅, TUNING)`, тож property-тести Blink, які йдуть за зразком арени, бачать Клітки й ніжки. `createSim` будує світ так само і прибирає двері справжньої Клітки, коли та відкривається.

**Порядок кроку** — як в Ітерації 2; між «Вікно» і «Падіння, повернення, Відродження» стає новий пункт: Квітки розкриваються, стрибок у бутон, Клітки.

## Slices

Порядок: S21 → S22 → S23 → S24 → S25 (правила; кожен пише `sim.ts`, `level.ts` або `tuning.ts`, по одному). S26 — без залежностей від правил Селища (лише ведмідь), може йти будь-коли після S21. S27 після S22 і S26; S28 після S25 і S27; S29 після S24 і S27; S30 після S25. Зрізи показу S27–S29 усі чіпають `game-view.ts` і йдуть по одному.

---

### S21 — Тести на непокриті гілки Ітерації 2

**Зроблено.** Виробничий код не змінено. Кожен із чотирьох критеріїв перевірено мутацією (тест падає, рядок повернуто): `if (hurt > 0) strike = null`, `!blinked` у старті Удару, `knockback = null` у гілці Blink, виклик `closeSlowdown` після перемоги, а для межі — `aggroRadius` Бджоли і `attackRange` Черепахи, зсунуті на ±0.1. Критерій 4: бот-«дитина» не рушає, коли ворог ближче за 3 м, тож Бджолу поставлено за 2 м, Черепаху — за 2.5 м, а `aggroRadius`/`attackRange` беруться як виміряна відстань ± 0.05; тест дивиться лише перший крок.

Історії: 11. **Blocked-by:** None.

**Files**
- `src/sim/sim.gaps.test.ts` (новий). Виробничий код не змінюється, крім випадку, коли тест знайде ваду: тоді виправлення — в цьому зрізі, з приміткою в плані.

**Interfaces**
- Consumes: шов Ітерації 2 без змін. Тести можуть брати власні числа (`{ ...TUNING, … }`), щоб зібрати рідкісний випадок, — так уже робить `sim.strike.test.ts`.

**Acceptance** (кожен тест перевірено мутацією рядка, що він захищає; рядки названо в рев'ю Ітерації 2 у `plan-iteration-2.md`)
1. Given Удар почався і Бджола вдарила Софійку посеред нього, Then `mode` не `ATTACK` і подій `struck` до кінця колишнього Удару немає (рядок `if (hurt > 0) strike = null`).
2. Given `strike` і `blink` натиснуті в тому самому кроці, коли Blink відбувся, Then Удару немає; Given Blink під час відкидання (числа тесту: `knockbackSeconds` 1.0), Then після Blink позиція не зсувається (рядки `!blinked` і `knockback = null` у гілці Blink).
3. Given числа тесту `turtle.windupSeconds` 3 і `slowdownSeconds` 30, Вікно відкрите на Черепасі, Софійка обходить її до Колби й б'є, When Черепаху переможено, Then `windowClosed{reflexed:false}` і `timeScale` = 1 (рядок `closeSlowdown` після перемоги).
4. Given бот-«дитина» з S20, але Бджола з `aggroRadius` на 0.05 м більшим за відстань до Софійки, Then замах на першому кроці; на 0.05 м меншим — ні (межа `aggroRadius`; так само `attackRange` Черепахи).

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S22 — Селище як рівень: геометрія, Доріжка, Blink

**Зроблено.** Відхилення: `cageBlocks` і `cageDoor` мають третій необов'язковий аргумент `tuning` (за замовчуванням `TUNING`), щоб підпис із Seam лишився двоаргументним; додано `cageDoor(cage)` (стінка з боку `facing`, потрібна S23 для зняття дверей) і `addBlock(world, block)` у `world.ts` (повертає колайдер). Клітки мусять стояти рівно (`facing` кратний чверті оберту): блоки — осьові коробки. Макет `VILLAGE`: площа ±20 м зі стінами по краях (як в арені), Клітки `cage-1…5` на z=16, x = −8…8, справжня — `cage-3` (x=0); Контрольна точка відкритої Клітки (0,0,13.5), кінець `trail.cage` (0,0,12.5); жовта Квітка (14,0,0), рожева й блакитна — z=±6; Черепаха (−10,0,0), Бджоли (−12,1.5,±5); старт (0,0,−14), Вцілілий (2,0,−13.5); будиночки (−8,−9), (−16,−15), (16,12), (−16,13). Відстань до ворогів для Бджоли міряється до центра капсули (суворіше, ніж від землі).

Історії: 1, 3, 5. **Blocked-by:** S21.

**Files**
- `src/sim/level.ts` (зміна: `BlockLook`, `CageSpawn`, `FlowerSpawn`, поля `Level`), `src/sim/village-geometry.ts` (новий), `src/sim/world.ts` (зміна: `buildLevel` через `levelBlocks`), `src/levels/village.ts` (новий), `src/sim/tuning.ts` (зміна)
- `src/sim/village-geometry.test.ts`, `src/sim/village.level.test.ts`, `src/sim/village.blink.property.test.ts`

П'ять виробничих файлів, але `level.ts`, `world.ts` і `tuning.ts` — по кілька рядків типів і чисел; поведінка одна: «Селище як геометрія».

**Interfaces**
- Produces у `Tuning`: `village: { cageSize: 2.0, cageWall: 0.1, cageOpenRadius: 0.8, cageCheckpointDistance: 2.5, flowerStemTop: 0.6, flowerStemHalfWidth: 0.3, flowerBudHeight: 1.0, flowerEnterRadius: 1.2, flowerOpenRadius: 6, flowerOpenSeconds: 0.8, talkRadius: 5, bubbleFrameSeconds: 1.2 }`.
- `cageBlocks`, `stemBlock`, `levelBlocks` — як у Seam. Стінки Клітки — `solid` (щоб Blink не переносив усередину), `look` не задається: показ малює Клітку окремою моделлю й пропускає ці блоки (вони не в `level.blocks`).
- `VILLAGE: Level`: рівна площа 40×40 м (`look: 'ground'`) без прірви; чотири будиночки (`look: 'house'`); п'ять Кліток уздовж північного краю площі з кроком 4 м, двері на південь, одна справжня; три Квітки на сході (жовта `opens: true`); Вцілілий біля старту на півдні; Черепаха і дві Бджоли на заході площі; `trail.flower` і `trail.cage` — ламані від Вцілілого до точки біля жовтої Квітки і до точки за 2.5 м перед дверима справжньої Клітки.

**Acceptance**
1. Given `cageBlocks(cage, false)`, Then п'ять блоків, що обмежують куб `cageSize` з центром над `position`; Given `open: true`, Then чотири, і двері (стінка з боку `facing`) відсутні.
2. Given `VILLAGE`, Then жодна точка обох ламаних Доріжки, `spawn`, точки перед дверима справжньої Клітки й жодна Квітка не ближче до будь-якого ворога, ніж його `aggroRadius` + 1 м (по 3D для Бджоли, по xz для Черепахи); і кожен відрізок Доріжки на висоті капсули не перетинає жодного блока з `levelBlocks` (аналітична перевірка, як у property-тестах).
3. Given Blink із 1000 випадкових позицій і напрямків у Селищі (зерно), світ із `buildLevel(world, VILLAGE)`, Then капсула ні разу не перетинає жодного блока з `levelBlocks(VILLAGE, ∅)` — зокрема не опиняється всередині Клітки.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S23 — Ключ, Клітки й Контрольна точка в правилах

**Зроблено.** Відхилення: світ у `createSim` будується циклом `addBlock` по `levelBlocks(level, ∅, tuning)` (а не через `buildLevel`), щоб запам'ятати колайдер дверей справжньої Клітки й зняти його (`removeRigidBody`) при відкритті; перевірка Клітки стоїть без умови «не Відродилась цим кроком» (різниці не дає: Софійка з Ключем біля Клітки відкрила б її й так). Контрольна точка стартує як `level.spawn`. Тести: Відродження після відкриття перевірено на варіанті Селища зі стартом (0,0,8) і Бджолою (8,1.5,14), `aggroRadius` 8.5 і `knockbackDistance` 0 (без відкидання сплячка лишається в досягу, і Бджола добиває всі п'ять Сердець); повернення з краю — на малому майданчику, де Контрольна точка за 0.3 м від краю (тому не «надійне місце», і повернути можна лише на неї); окремий тест на Клітку з дверима на схід (знак `sin` у формулі Контрольної точки в Селищі не видно, бо `facing` = π).

Історії: 8, 9. **Blocked-by:** S22.

**Files**
- `src/sim/sim.ts` (зміна), `src/sim/sim.cages.test.ts`

**Interfaces**
- `createSim(level, tuning?, start?: SimStart)`; `SofiykaState.keys` (старт `start.keys ?? 0`); `Sim.cages`, `Sim.checkpoint`.
- Відкриття: на кроці, коли відстань по xz від осі капсули Софійки до прямокутника справжньої закритої Клітки не більша за `cageOpenRadius` і `keys` ≥ 1 → `keys -= 1`, двері прибираються зі світу Rapier, `cageOpened{id}`, `checkpoint` = `position + (sin facing, 0, cos facing) · cageCheckpointDistance`. Декоративні Клітки не відкриваються ніколи.
- Відродження: `teleportTo(checkpoint)` і `lastSafe = checkpoint` (обидва місця, де зараз `level.spawn`); `keys` і відкриті Клітки не змінюються; вороги, Вікно, Удар — як в Ітерації 2.

**Acceptance**
1. Given Селище і `keys: 1`, When Софійка йде до дверей справжньої Клітки — і окремо, When підходить до її бічної стінки під кутом 45°, Then в обох випадках `cageOpened`, `keys` = 0, `cages` показує `open`, `checkpoint` перед дверима і вільний від геометрії.
2. Given `keys: 0` біля справжньої Клітки, Then закрита; Given `keys: 1` біля декоративної, Then закрита і `keys` = 1.
3. Given відкрита Клітка і Софійка втрачає останнє Серце, Then `respawned`, вона на `checkpoint`, п'ять Сердець, Клітка відкрита; Given далі падіння в прірву без невразливості (рівень тесту з краєм), Then `returned` веде на останнє надійне місце біля `checkpoint`, а не на `level.spawn`.
4. Given відкрита Клітка, When Софійка йде в двері, Then заходить усередину (дверей більше немає).

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S24 — Квітки: розкриття і стрибок у бутон

**Зроблено.** Відхилень від інтерфейсів немає. Уточнення: після `flowerEntered` Софійка стає на Контрольну точку лише через `teleportTo` (як сказано в плані); `lastSafe` не чіпається. Критерій 4 («сходить з ніжки»): на ніжку, нижчу за бутон, можна зійти лише невисоким стрибком — повний стрибок (1.6 м) над ніжкою перетинає висоту бутона згори вниз і є входом, — тому тест користується `jumpHeight` 0.9 (тест із повним стрибком не збирався: Софійка перелітає ніжку, не приземляючись на неї). Правило входу — по перетину висоти бутона, тож тест на ніжці доводить, що стояння й сходження події не дають.

Історії: 6, 7. **Blocked-by:** S23.

**Files**
- `src/sim/flowers.ts`, `src/sim/flowers.test.ts`, `src/sim/sim.ts` (зміна), `src/sim/sim.flowers.test.ts`

**Interfaces**
- `stepFlower(openness: number, opens: boolean, distanceXZ: number, dt: number, tuning: Tuning): number` — Квітка з `opens` розкривається до 1 за `flowerOpenSeconds`, коли Софійка ближче за `flowerOpenRadius`, і закривається з тією ж швидкістю, коли далі; закриті Квітки — завжди 0.
- `entersFlower(prevSolesY: number, sofiyka: { position: Vec3; grounded: boolean }, flower: FlowerSpawn, openness: number, tuning: Tuning): boolean` — `true`, коли openness ≥ 0.9, вона не на землі, підошви на цьому кроці перетнули висоту `position.y + flowerBudHeight` згори вниз (`prevSolesY` ≥ висоти > поточних), і по xz ближче за `flowerEnterRadius`.
- У `sim.ts`: `Sim.flowers`; `flowerEntered{id}`; одразу після події Софійка ставиться на `checkpoint` (`teleportTo`), Квітка лишається розкритою.

**Acceptance**
1. Given жовта Квітка і Софійка за 10 м, Then openness = 0; When вона ближче за 6 м, Then openness росте і за 0.8 с сягає 1; When відходить, Then спадає до 0.
2. Given закрита Квітка (`opens: false`) і Софійка поруч, Then openness = 0 завжди.
3. Given розкрита жовта Квітка і Софійка стоїть впритул до ніжки (0.8 м від центру), When стрибає на місці, Then одна подія `flowerEntered`, далі вона на `checkpoint`.
4. Given Софійка стоїть на ніжці (верх 0.6 м) і сходить з неї, або стрибає біля закритого бутона, Then `flowerEntered` немає.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S25 — Куди веде Доріжка (правила)

**Зроблено.** Відхилень немає. «Справжня Клітка відкрита» у `progressOf` — будь-яка відкрита Клітка з `working`; відкрита декоративна (у правилах такої не буває) нічого не звільняє, це закріплено тестом.

Історії: 3, 8. **Blocked-by:** S24.

**Files**
- `src/sim/guide.ts`, `src/sim/guide.test.ts`

**Interfaces**
- `type Progress = 'needKey' | 'haveKey' | 'freed'`; `progressOf(keys: number, cages: readonly CageState[]): Progress` — `freed`, коли справжня Клітка відкрита; інакше `haveKey` при `keys` ≥ 1; інакше `needKey`.
- `trailPath(progress: Progress, trail: NonNullable<Level['trail']>): Vec3[]` — `needKey` → `trail.flower`; `haveKey` → `trail.cage`; `freed` → `[]`.

**Acceptance**
1. Given `keys` 0 і закриті Клітки, Then `needKey` і Доріжка = `trail.flower`.
2. Given `keys` 1, Then `haveKey` і Доріжка = `trail.cage`; Given відкрита справжня Клітка (навіть із `keys` 1), Then `freed` і Доріжка порожня.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S26 — Ведмеді-персонажі: шарф і ліхтар

**Зроблено.** Вцілілий бурий із червоним шарфом і ліхтарем у лівій лапі, Полонений світло-сірий. Шарф кріпиться до кореня моделі на висоті шиї, а не до голови (голова гойдається). Мутації: без нових матеріалів у `rig.materials` і з ліхтарем у правій лапі тести падають.

Історії: 1. **Blocked-by:** S21.

**Files**
- `src/entities/bear/skins.ts` (зміна: поля `scarf`, `lantern`; `SURVIVOR_SKIN`, `CAPTIVE_SKIN`), `src/entities/bear/build-bear.ts` (зміна)
- `src/entities/bear/build-bear.test.ts` (зміна), `src/entities/bear/skins.test.ts` (зміна)

**Interfaces**
- `BearSkin` + `scarf: string | null`, `lantern: boolean` (наявні шкури — `null`/`false`). `buildBear` додає шарф (тор на шиї, ім'я `scarf`) і ліхтар (у лівій лапі, ім'я `lantern`); їхні матеріали — у `rig.materials` (щоб `disposeBear` і ефект Blink їх бачили). `BearRig` + `lanternMaterial: MeshStandardMaterial | null` (світний, як очі).

**Acceptance**
1. Given `buildBear(SURVIVOR_SKIN)`, Then є об'єкти `scarf` і `lantern`, `lanternMaterial` не `null`, обидва нові матеріали в `rig.materials`; Given `SOFIYKA_SKIN`, Then їх немає.
2. Given `CAPTIVE_SKIN`, Then хутро відрізняється від Софійки й Вцілілого, очі не світяться.

**Verify:** `pnpm test src/entities && pnpm typecheck`

---

### S27 — Селище на екрані: будиночки, Клітки, Вцілілий, Полонені

**Зроблено.** Кадр у вбудованому браузері (`/`, 800×600): `probe.values().village` = `{ houses: 4, cages: 5, bears: 6 }`; яскравість квадрата 16×16 px біля ліхтаря 237.0 проти 105.1 на 60 px лівіше (різниця 131.8 ≥ 40); консоль без помилок. Відхилення: Вцілілий тепер дивиться на південь (`facing` π), бо боком до камери ліхтар у лівій лапі ховався за тілом (перший замір: −32). Моделі Селища зібрано в `src/view/village-view.ts`, щоб не роздувати `game-view.ts`; дах будиночка чотирисхилий, а не двосхилий. `buildCage` бере розмір параметром (`tuning.village.cageSize`).

Історії: 1, 5. **Blocked-by:** S22, S26.

**Files**
- `src/view/village-models.ts` (новий: Клітка, будиночок), `src/view/game-view.ts` (зміна), `src/main.ts` (зміна)
- `src/view/village-models.test.ts`

**Interfaces**
- `game-view` малює блоки за `look`: `ground` — як зараз, `house` — будиночок (`buildHouse(halfExtents)`: стіни і двосхилий дах), `stem` — не малює (ніжку малює модель Квітки в S29). Клітки малюються з `level.cages`.
- `buildCage(working: boolean): { root: Group; door: Group; lockMaterial: MeshStandardMaterial | null; dispose(): void }` — ґрати з циліндрів по розміру `cageSize`; справжня має світний замок (позначений для світіння).
- `cageDoorAngle(open: boolean, secondsSinceOpened: number): number` — 0 закрита; відчиняється до 100° (у радіанах) за 0.6 с, не спадає.
- У кожній Клітці — ведмідь `CAPTIVE_SKIN`; Вцілілий — `SURVIVOR_SKIN`, ліхтар позначений для світіння.
- `main.ts`: Селище за замовчуванням; `?level=playground|arena`; у dev-збірці `?keys=N` → `createSim(level, TUNING, { keys: N })`.
- `view.probe.values().village` = `{ houses, cages, bears }` — скільки моделей у сцені.

**Acceptance**
1. Given `cageDoorAngle(true, t)` для t від 0 до 1 с кроком 0.05, Then не спадає, 0 при t = 0, 100° при t ≥ 0.6; `cageDoorAngle(false, t)` = 0.
2. Given гра в браузері (`/`), When знято кадр старту, Then `probe.values().village` = `{ houses: 4, cages: 5, bears: 6 }` (Вцілілий і п'ять Полонених); на кадрі видно Вцілілого з ліхтарем; середня яскравість (R+G+B)/3 квадрата 16×16 px навколо екранної точки ліхтаря щонайменше на 40 більша, ніж квадрата 16×16 px на 60 px лівіше. Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадр — у вбудованому браузері.

---

### S28 — Бульбашка й Доріжка на екрані

**Зроблено.** Кадр у вбудованому браузері: біля Вцілілого `.bubble` видимий, `data-picture` = `cage` (t = 0.03 с), а за 1.2 с — `key`; `document.body.innerText` порожній; Доріжка — 21 іскра від (1, 0, −12) до (11, 0, 0), кінців `trail.flower`. З `?keys=1`: 32 іскри до (0, 0, 12.5), кінця `trail.cage`, Бульбашка `key`. `bubbleFrame` узагальнено типом малюнка; `trailPoints` рахує крок уздовж шляху (на зламі пряма відстань між сусідніми точками менша за `spacing`).

Історії: 2, 3, 8. **Blocked-by:** S25, S27.

**Files**
- `src/view/guide-fx.ts` (чисті функції), `src/view/bubble.ts`, `src/view/trail-fx.ts`, `src/view/game-view.ts` (зміна), `index.html` (зміна: стилі Бульбашки)
- `src/view/guide-fx.test.ts`

Дві поведінки (Бульбашка й Доріжка), але обидві — показ того самого `progressOf` і тестуються спільно; розділяти їх — два зрізи по два файли.

**Interfaces**
- `bubbleFrames(progress: Progress): ('cage' | 'key' | 'flower' | 'heart')[]` — `needKey` → `['cage','key','flower']`; `haveKey` → `['key','cage']`; `freed` → `['heart']`.
- `bubbleFrame(frames: readonly string[], timeSeconds: number, frameSeconds: number): string` — по колу, кожен малюнок `frameSeconds`.
- `bubbleVisible(sofiyka: Vec3, survivor: Vec3, tuning: Tuning): boolean` — по xz ближче за `talkRadius`.
- `trailPoints(path: readonly Vec3[], spacing: number): Vec3[]` — точки вздовж ламаної: перша — початок, далі через рівно `spacing`, останнім — кінець ламаної (останній проміжок ≤ `spacing`).
- `createBubble(root: HTMLElement): { show(x: number, y: number, picture: string | null): void; dispose(): void }` — хмаринка з одним SVG-малюнком (атрибут `data-picture`), без тексту.
- `createTrail(scene: Scene): { object: Object3D; update(points: readonly Vec3[], time: number): void; dispose(): void }` — світні жовті іскри; `object` позначається `bloom.mark`.

**Acceptance**
1. Given `bubbleFrames` для трьох станів, Then як вище; Given `bubbleFrame(['cage','key','flower'], t, 1.2)` для t = 0, 1.2, 2.4, 3.6, Then `cage`, `key`, `flower`, `cage`; Given Софійка за 4.9 м, Then `bubbleVisible`, за 5.1 м — ні.
2. Given ламана 10.5 м і `spacing` 1, Then 12 точок: перша й остання — кінці, сусідні на 1 ± 1e-9, крім останнього проміжку 0.5.
3. Given гра в браузері, When Софійка біля Вцілілого, Then елемент `.bubble` видимий, `data-picture` = `cage`, через 1.2 с — `key`; `document.body.innerText` порожній; `probe.values().trail.count` > 0, а перша й остання точка — кінці `trail.flower`. Given `?keys=1`, Then кінці — `trail.cage`. Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадри — у вбудованому браузері.

---

### S29 — Квітки й відкриття Клітки на екрані

**Зроблено.** Кадри у вбудованому браузері: Софійка за 3.3 м від жовтої Квітки, через 1 с `probe.values().villageState.flowers`: жовта openness 1, кут пелюсток 1.35 = `petalAngle(1)`, рожева й синя openness 0; стрибок біля ніжки дає `flowerEntered{flower-yellow}` і повертає на `checkpoint` (0, 0, −14). З `?keys=1` біля справжньої Клітки: через 0.5 с після відкриття кут дверей 1.70 рад, підскок Полоненого 0.25 м, декоративна Клітка 0/0, `keys` 0, Сердець 5. Консоль свіжої вкладки без помилок. Стан для перевірок — `view.probe.values().villageState`.

Історії: 6, 7, 8. **Blocked-by:** S24, S27.

**Files**
- `src/view/flower-models.ts`, `src/view/flower-pose.ts`, `src/view/game-view.ts` (зміна)
- `src/view/flower-pose.test.ts`

**Interfaces**
- `buildFlower(color: 'yellow' | 'pink' | 'blue'): { root: Group; petals: Group[]; pollenMaterial: MeshStandardMaterial; dispose(): void }` — ніжка (розміром як `stemBlock`), листя, шість пелюсток навколо серцевини з пилком (світиться).
- `petalAngle(openness: number): number` — 0 → бутон, 1 → розкриті; строго зростає.
- `happyHop(seconds: number): number` — висота підскоку Полоненого: 0 при 0 і після 1.2 с, > 0 між ними.
- `cageOpened` — двері за `cageDoorAngle`, Полонений підскакує, хмарка пилку; `flowerEntered` — хмарка жовтого пилку, «вжух», камера ставиться заново (як після `returned`).

**Acceptance**
1. Given `petalAngle(0)` < `petalAngle(0.5)` < `petalAngle(1)`; Given `happyHop(0)` = 0, `happyHop(0.3)` > 0, `happyHop(1.3)` = 0.
2. Given гра в браузері, When Софійка підходить до жовтої Квітки на 3 м і минає 1 с, Then `probe.values()` дає openness жовтої = 1 і двох інших = 0, кут пелюсток жовтої = `petalAngle(1)`.
3. Given `?keys=1`, When Софійка підходить до справжньої Клітки, Then за 0.5 с `probe.values()` дає кут дверей > 0 і висоту підскоку Полоненого > 0, на кадрі двері відчинені; Серця не змінились. Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадри — у вбудованому браузері.

---

### S30 — «Проходження» Селища

**Зроблено.** Відхилення: правила «дитини» з S20, що реагують на ворогів (Рефлекс у Вікні, Удар по вразливому ворогу поруч), винесено в спільну функцію `react` у `scenario.ts`, яку викликають і `createChildBot`, і `createGuideBot` (поведінка «дитини» не змінилась: тести арени зелені); натиски тепер відстежує `createPresser`, що додатково рахує фронт стрибка. `playScenario` з `until` не зупиняється, коли ворогів немає (потрібно Селищу без ворогів на шляху), і викликає `until` з подіями лише поточного кроку. Бот-провідник: до жовтої Квітки — 275 кроків, до Клітки з Ключем — 349 кроків, обидва з п'ятьма Серцями; для Квітки стає на лінії від кінця Доріжки до центра Квітки, чекає `openness` ≥ 1 й стрибає раз (перевірено тестом із повільним розкриттям, `flowerOpenSeconds` 3: рівно один `jumped`). Тест «сплячка на Контрольній точці» спершу підводить Софійку до `checkpoint` простим ботом, бо після відкриття вона стоїть біля дверей, а не на самій точці.

Історії: 4, 10. **Blocked-by:** S25.

**Files**
- `src/sim/scenario.ts` (зміна: `until`, `createGuideBot`), `src/sim/sim.village.test.ts`

**Interfaces**
- `playScenario(…, until?)` — як у Seam.
- `createGuideBot(level: Level): Bot` — бере `trailPath(progressOf(sim.sofiyka.keys, sim.cages), level.trail)` і йде від точки до точки (наступна, коли до поточної < 0.5 м). На кінці `trail.flower`: стає за 0.8 м від центру ніжки жовтої Квітки, чекає, поки openness = 1 (`sim.flowers`), стрибає на місці. На кінці `trail.cage`: іде до центру дверей справжньої Клітки. Коли Вікно відкрите — Рефлекс, вразливий ворог поруч — Удар (правила «дитини» з S20); ворогів сам не шукає.

**Acceptance**
1. Given Селище без Ключа і `createGuideBot(VILLAGE)`, When сценарій до 6000 кроків з `until` = `flowerEntered`, Then подія для жовтої Квітки, `hearts` = 5.
2. Given Селище з `keys: 1`, When сценарій до 6000 кроків з `until` = `cageOpened`, Then справжня Клітка, `keys` = 0, `hearts` = 5.
3. Given «сплячка» в Селищі — і окремо «сплячка» на `checkpoint` перед відкритою Кліткою (`keys: 1`, Клітку відкрито ботом, далі «сплячка»), When 3000 кроків, Then `heartLost` немає.

**Verify:** `pnpm test src/sim && pnpm typecheck`; фінал ітерації: `pnpm test && pnpm typecheck && pnpm build`, кадр Селища в браузері.

## Незалежне рев'ю Ітерації 3 і що з ним зроблено

Вердикт рецензента: можна випускати, блокерів немає. Виправлено, кожне з тестом у `src/sim/sim.flowers.test.ts`:
- Стрибок у бутон при відкритому Вікні лишав Вікно відкритим (наступний Shift кидав Софійку Рефлексом через пів площі). Тепер `flowerEntered` закриває Вікно і скидає відкидання, `HURT` і Удар так само, як Відродження (спільна `settleAtCheckpoint`).
- Тест, що `flowerEntered` веде саме на `checkpoint` перед відкритою Кліткою, а не на старт рівня (мутація `teleportTo(level.spawn)` тепер падає).
- Тест на відстань до кута Клітки (мутація «більший із двох проміжків» замість справжньої відстані тепер падає).

Не змінено: Клітка — 42 окремі сітки, Селище додає ≈350 сіток; чи це тягне частоту кадрів, перевірить ручне проходження (умова готовності 5, Ітерація 4). Бот-провідник не скидає номер точки Доріжки, якщо Ключ з'являється посеред прогону, — стане важливим у Ітерації 4. Доріжка обрізається на 160 іскрах (зараз ≈30).

## Покриття

| Вимога специфікації | Зріз |
| --- | --- |
| Селище, Вцілілий | S22, S26, S27 |
| Бульбашка: Клітка → Ключ → жовта Квітка | S28 |
| Доріжка | S22 (дані), S25, S28, S30 |
| На площі Черепаха і одна-дві Бджоли | S22 (осторонь шляху), S30 |
| П'ять Кліток, діє одна | S22, S23, S27 |
| Жовта Квітка розкривається при наближенні, дві — бутони | S24, S29 |
| Стрибок у бутон | S24, S29 (перехід — Ітерація 4) |
| Ключ відкриває Клітку, Полонений радіє | S23, S29 (Ключ із Джерела — Ітерація 4) |
| Відродження: Ключі й відкриті Клітки зберігаються | S23 |
| Контрольні точки: вхід у світ, відкрита Клітка | S23 (Квітка — Ітерація 4) |
| Без тексту | S28 |
| Усі ведмеді — одна модель | S26 |
| Умова готовності 3 (Blink не в геометрії) — Селище | S22 |
| Умова готовності 5 (кадри, ≥ 50 кадрів/с) | Ітерація 4 (ручне проходження всіх світів на комп'ютері користувача) |
| Прогалини тестів Ітерації 2 | S21 |
| Фіолетовий туман і тепле світло, «Далі буде» | Ітерація 4 |
