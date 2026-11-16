# last-bear — план Ітерації 2 «Вороги»

**Мета:** на майданчику Бджоли і Черепаха б'ють Софійку; поруч із ворогом, що Атакує, час сповільнюється, `Shift` у Вікні переносить Софійку за спину ворога, Удар лапою перемагає ворога, а Серця й Відродження працюють. Правила — без браузера (ADR 0001), плюс показ на екрані.

Специфікація: [spec.md](spec.md). Терміни: [CONTEXT.md](../../CONTEXT.md). Ітерація 1: [plan.md](plan.md) (готова). Ітерації 3–4 плануються окремо.

Версія 2: переписана після незалежного рев'ю (два блокери й прогалини враховано). **S8 уже готовий** (коміт `d52117c`).

## Global Constraints

- Той самий проєкт і гілка: `mine/games/last-bear`, `feat/sofiyka`. Не `main`.
- Правила (`src/sim`, включно з підпапками) не імпортують `three`, `gsap`, DOM, Web Audio (ADR 0001). Тест `sim.imports.test.ts` забороняє в цих файлах слова `document`, `window`, `AudioContext`, тому в правилах жоден ідентифікатор не називається `window`: поле Вікна — `slowdown`.
- Усі числа — в `src/sim/tuning.ts`. Числа ворогів — вкладені: `tuning.bee.*`, `tuning.turtle.*`. Стартові значення правляться після гри дитини.
- Вороги повільні, із довгим видимим замахом. Швидкий лише Ривок Бджоли (`dashSpeed` 8 м/с проти ходьби Софійки 5): так у `CONTEXT.md` — «швидкий літаючий ворог».
- Жодного тексту на екрані: Серця й підказки — піктограми.
- Без `GlitchPass`, без різких звуків, без скримерів.
- Перевірка проєкту: `pnpm test && pnpm typecheck && pnpm build`. **Кожен зріз перевіряється командою з `pnpm typecheck`**, бо `tsconfig` охоплює й тести.
- Сервер: `ws-run last-bear`, кадри — у вбудованому браузері. Якщо панель прихована, кадри ідуть повільно: для знімків «у межах 0.15 с» крокувати кадри вручну (так робилось у S7 Ітерації 1).

## Припущення, що закривають відкриті питання

Кожне — число або правило в `tuning.ts`, його легко змінити.

1. **Питання 1.** Удар шкодить Бджолі лише коли вона застрягла (так у таблиці рішень специфікації).
2. **Питання 2.** Бджола і Колба Черепахи витримують по одному Удару (`hitsToDefeat`). Три Удари — тільки Джерело (Ітерація 4).
3. Переможений ворог зникає до Відродження. Відродження повертає всіх, скидає Вікно і таймери.
4. Падіння в прірву: мінус Серце і повернення на надійне місце (готово в S8).
5. **`Shift` у Вікні — Рефлекс, поза Вікном — Blink.** Рефлекс не витрачає перезарядку Blink. Якщо вільного місця за ворогом немає, у Вікні `Shift` нічого не робить (Blink не спрацьовує), Вікно лишається відкритим.
6. **Вікно:** час гри сповільнюється до 0.2, Вікно триває 1.2 с реального часу, одне на одну атаку ворога. Не натиснула — атака йде далі.
7. **Вигадано планом, не в специфікації:** невразливість після Рефлексу `reflexInvulnerableSeconds` = 3.0 с (перекриває весь замах і розкрутку Черепахи, 2.5 с).

## Frame

**Проблема.** Софійка вміє рухатись, але ніщо їй не загрожує і нічого не треба вирішувати. Рефлекс, Удар і Серця — серце гри. Вони мають бути надійними в тестах і добрими для дитини, що ще не читає.

**Рішення.** Розширити той самий шов (`createSim` / `Sim.step`): рівень описує ворогів, `Sim` віддає їхній стан, Серця, Вікно й масштаб часу, плюс нові події. Кожен ворог — чистий скінченний автомат. Показ малює ворогів за станом, Серця — панеллю піктограм, Вікно — сповільненням і тоном картинки.

**Історії користувача**

1. Дитина бачить Бджолу, що висить у повітрі, і Черепаху, що повільно ходить.
2. Дитина бачить довгий замах: Бджола тремтить і червоніє перед Ривком, Колба Черепахи пульсує перед розкруткою.
3. Коли ворог починає Атаку близько до Софійки, час сповільнюється, з'являється знак «тисни Shift».
4. `Shift` у Вікні — Софійка за спиною ворога, камера плавно обходить, ворог б'є порожнє місце.
5. Бджола, що промахнулась, застрягає на 2 с; Удар у цей час її перемагає.
6. Черепаха невразлива спереду; Удар у Колбу ззаду її перемагає.
7. Софійка, яку вдарили, втрачає Серце, відлітає назад і ненадовго невразлива (мигає).
8. Дитина бачить п'ять Сердець-піктограм; втрачені порожні.
9. Падіння в прірву коштує Серце і повертає Софійку на землю. (S8, готово.)
10. Нуль Сердець — Відродження на старті з п'ятьма Серцями; вороги знову на місцях.
11. Розробник проганяє «Проходження» арени без браузера: бот виживає з Рефлексом і втрачає Серце без нього.

**Поза Ітерацією 2:** Селище, Клітки, Вцілілий, Бульбашки, Квітки, Залаштунки, Стільники, Джерело, **Ключ** (тож «збережений Ключ» з умови готовності 2 перевіряється в Ітерації 4), рухомі платформи, Контрольні точки окрім стартової, заставка.

**Рішення щодо тестів**

- Найвищий шов: `createSim` + `step(input)`. Сценарій натискань → стан Софійки, ворогів і події. Жодних перевірок внутрішніх полів Rapier.
- Автомат кожного ворога тестується окремо, чистою функцією. Стик із Rapier перевіряється в кожному зрізі справжнім Rapier.
- Властивісні тести на 1000 випадків: Рефлекс ніколи не лишає Софійку в геометрії або над прірвою; Blink на арені ніколи не лишає в геометрії (частина умови готовності 3).
- Показ: чисті функції (поза, розкладка Сердець, масштаб часу, піктограма) — тестами; картинка — кадром із браузера. Критерій на кадр — вимірний: значення чистої функції або різниця пікселів, а не «помітно інший».
- «Проходження» арени — бот-сценарій у Node, перший шматок майбутнього Проходження Зрізу.

## Seam

Той самий шов, розширений. Нове в `Input`, `Level`, `Sim`; решта як в Ітерації 1.

```ts
// src/sim/input.ts
export type Input = { moveX: number; moveZ: number; jump: boolean; blink: boolean; strike: boolean };

// src/sim/level.ts
export type EnemySpawn = { id: string; kind: 'bee' | 'turtle'; position: Vec3; facing: number };
export type Level = { blocks: Block[]; spawn: Vec3; killY: number; enemies?: EnemySpawn[] };

// src/sim/sim.ts
export type SofiykaMode = 'IDLE' | 'RUN' | 'JUMP' | 'BLINK' | 'ATTACK' | 'HURT';
// SofiykaState (готово в S8): hearts, invulnerable.
export type BeeState = 'HOVER' | 'WINDUP' | 'DASH' | 'STUCK' | 'RECOVER';
export type TurtleState = 'WALK' | 'WINDUP' | 'SPIN' | 'COOLDOWN';
export type EnemyState = {
  id: string;
  kind: 'bee' | 'turtle';
  position: Vec3;       // Бджола — центр тіла; Черепаха — підошви
  facing: number;       // рад, 0 = +z; для Черепахи — куди дивиться голова, Колба на протилежному боці
  state: BeeState | TurtleState;
  stateTime: number;    // с у поточному стані (для пози в показі)
  attacking: boolean;   // від початку замаху до кінця удару
  vulnerable: boolean;  // лише Бджола: true в STUCK. Колба Черепахи залежить від того, де Софійка (S13)
  hp: number;
};
export type SlowdownState = { open: boolean; remaining: number; enemyId: string | null }; // remaining — реальні секунди
export type SimEvent =
  | /* Ітерація 1 */ { type: 'jumped'; double: boolean } | { type: 'landed' } | { type: 'blinked'; from: Vec3; to: Vec3 }
  | /* S8 */ { type: 'heartLost'; cause: 'fall' | 'hit' } | { type: 'returned'; to: Vec3 } | { type: 'respawned' }
  | { type: 'enemyWindup'; id: string }
  | { type: 'windowOpened'; enemyId: string }
  | { type: 'windowClosed'; reflexed: boolean }
  | { type: 'reflexed'; enemyId: string; from: Vec3; to: Vec3 }
  | { type: 'struck'; enemyId: string | null; hit: boolean }
  | { type: 'enemyDefeated'; id: string };
export type Sim = {
  // ... як у Ітерації 1, і ще:
  readonly enemies: readonly EnemyState[];
  readonly timeScale: number;          // 1, або 0.2 у Вікні; main.ts множить на нього час кадру
  readonly slowdown: SlowdownState;
};
```

**Порядок кроку** (задає, що бачать тести «через крок»):

1. Таймери: перезарядка Blink, невразливість, Удар, `slowdown.remaining`.
2. Натиски за фронтом: `Shift` (у Вікні — Рефлекс, інакше Blink), Удар, стрибок. Блок Blink більше не завершує крок раніше: він лише пропускає рух у пункті 3 цього кроку.
3. Рух Софійки (контролер, відкидання).
4. Вороги крокують за новим положенням Софійки.
5. Влучання: ворог → Софійка (шкода), Удар → вороги.
6. Вікно відкривається або закривається.
7. Падіння, повернення, Відродження.

## Slices

Порядок: S8 ✓ → S9 → S10 → S11 → S12 → S13; S14 після S10; S15 після S8; S16 після S11 і S14; S17 після S12 і S16; S18 після S13 і S14; S19 після S15 і S18; S20 після S13. Усі зрізи правил (S9–S13) пишуть `sim.ts` і йдуть по одному. Зрізи показу (S14–S19) всі чіпають `game-view.ts` і теж йдуть по одному.

---

### S8 — Серця, невразливість, падіння ✓ (`d52117c`)

Зроблено: `hearts`, `invulnerable`, `isSafeSpot`, події `heartLost`/`returned`/`respawned`, невразливість до падіння, повернення на надійне місце. Відхилення: відкидання (`knockback`) перенесено в S9, бо без джерела шкоди його не перевірити.

---

### S9 — Бджола, шкода й відкидання

**Зроблено.** Відхилення: `hitsToDefeat` додано вже в S9 (з нього береться `hp`); Бджола, що торкнулась невразливої Софійки, теж застрягає; під час `HURT` рух клавішами вимкнено.

Історії: 1, 2 (правило), 5 (стан), 7. **Blocked-by:** S8.

**Files**
- `src/sim/enemies/bee.ts`, `src/sim/enemies/bee.test.ts`
- `src/sim/sim.ts` (зміна), `src/sim/level.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/sim/sim.bee.test.ts`; зміна `src/sim/sim.imports.test.ts` (обхід підпапок рекурсивно; це перший крок зрізу)

**Interfaces**
- Produces у `Tuning`: `bee: { aggroRadius: 9, windupSeconds: 0.9, dashSpeed: 8, dashMaxSeconds: 1.0, stuckSeconds: 2.0, recoverSeconds: 1.5, radius: 0.5, hoverHeight: 1.5 }`; `knockbackDistance: 3`, `knockbackSeconds: 0.25`, `hurtSeconds: 0.3`.
- `stepBee(bee: BeeInternal, target: Vec3, dt: number, rayDistance: (from: Vec3, dir: Vec3, max: number) => number, tuning: Tuning): { bee: BeeInternal; events: ('windupStarted' | 'stuck' | 'recovered')[] }`. `target` — центр капсули Софійки.
- Автомат: `HOVER` (висить на `home`, ледь гойдається) → Софійка ближче за `aggroRadius` (по 3D) → `WINDUP` (ціль `aim` фіксується на початку замаху) → `DASH` (`dashSpeed` у напрямку `aim`; упирається в суцільний блок — зупиняється за `radius` від поверхні; не довше `dashMaxSeconds`) → `STUCK` (`vulnerable` = true) → `RECOVER` (повертається на `home`) → `HOVER`. `attacking` = `WINDUP` або `DASH`.
- Шкода: під час `DASH`, якщо відстань від центру Бджоли до осі капсули Софійки менша за `radius + capsuleRadius` і `invulnerable` = 0 → `damageSofiyka('hit', beePosition)`; Бджола в `STUCK`.
- `damageSofiyka(cause, from?)`: `hearts -= 1`, `invulnerable = invulnerableSeconds`, подія `heartLost{cause}`; для `hit` — відкидання: горизонтальний рух на `knockbackDistance` за `knockbackSeconds` від `from`, **через контролер персонажа**, тож стіна його зупиняє; `mode` = `HURT` протягом `hurtSeconds`. Нуль Сердець — Відродження, як у S8.
- Відродження скидає Бджіл: `home`, `HOVER`, `hp` повні, переможені повертаються.
- Produces: `Level.enemies`, `Sim.enemies`, `Sim.timeScale` (поки завжди 1), `Sim.slowdown` (поки завжди закрите), подія `enemyWindup{id}`.

**Acceptance**
1. Given Бджола і Софійка за 12 м, When 120 кроків, Then Бджола в `HOVER`; Given Софійка за 6 м, Then на наступному кроці `WINDUP`, `attacking` = true, подія `enemyWindup`.
2. Given Софійка стоїть, When минають замах і Ривок, Then вона втрачає одне Серце (`heartLost{hit}`), `mode` = `HURT`, відлетіла по прямій від Бджоли, `invulnerable` 1 с, Бджола в `STUCK`.
3. Given Софійка відійшла вбік після початку замаху, When Ривок завершується, Then Серце не втрачено, Бджола `STUCK` і `vulnerable` = true; через 2 с `RECOVER`, ще через 1.5 с `HOVER`.
4. Given Ривок у суцільну стіну, Then Бджола зупиняється за `radius` перед стіною, а не в ній.
5. Given стіна за спиною Софійки, When Бджола її вдарила, Then відкидання зупиняється біля стіни, а Серце знято один раз.
6. Given Бджола вдарила, а Софійка невразлива, When вона знову в зоні Ривка, Then Серце не знімається.
7. Given Бджола в `STUCK` і Відродження Софійки, Then Бджола знову `HOVER` на `home`.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S10 — Черепаха

**Зроблено.** Відхилення: у `tuning.turtle` додано `radius: 0.7` (відступ від стіни й краю); «Софійка в `spinReach`» — відстань по xz між центрами.

Історії: 1, 2 (правило), 6 (стан), 7. **Blocked-by:** S9.

**Files**
- `src/sim/enemies/turtle.ts`, `src/sim/enemies/turtle.test.ts`
- `src/sim/sim.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/sim/sim.turtle.test.ts`

**Interfaces**
- Produces у `Tuning`: `turtle: { aggroRadius: 8, walkSpeed: 1.2, attackRange: 2.5, windupSeconds: 1.0, spinSeconds: 1.5, spinReach: 1.6, cooldownSeconds: 2.0 }`.
- `stepTurtle(turtle: TurtleInternal, target: Vec3, dt: number, ground: { rayDown: (from: Vec3, max: number) => number; rayDistance: (from: Vec3, dir: Vec3, max: number) => number }, tuning: Tuning): { turtle: TurtleInternal; events: ('windupStarted' | 'spinStarted' | 'spinEnded')[] }`. `target` — підошви Софійки, відстані рахуються по площині xz.
- Автомат: `WALK` (до Софійки в межах `aggroRadius`; не заходить у стіну і не сходить з краю: перед кроком перевіряє `rayDistance` уперед і `rayDown`) → Софійка ближче за `attackRange` → `WINDUP` (стоїть, **`facing` заморожений** до кінця `COOLDOWN`, тож Колба весь час на одному боці) → `SPIN` → `COOLDOWN` → `WALK`. `attacking` = `WINDUP` або `SPIN`. `vulnerable` завжди false.
- Шкода: у `SPIN`, якщо Софійка в `spinReach` і `invulnerable` = 0 → `damageSofiyka('hit', turtlePosition)`. **Один оберт б'є щонайбільше раз:** після влучання цей `SPIN` більше не шкодить.
- Відродження скидає Черепах так само, як Бджіл у S9.

**Acceptance**
1. Given Черепаха і Софійка за 7 м, When 60 кроків, Then Черепаха наблизилась на ≈1.2 м, `state` = `WALK`, `facing` повернуто до Софійки.
2. Given Софійка в 2 м, When проходять `windupSeconds`, Then `WINDUP` → `SPIN`, `attacking` = true весь цей час, подія `enemyWindup`, `facing` не змінюється від початку `WINDUP`.
3. Given Софійка стоїть у `spinReach`, Then вона втрачає Серце один раз за весь оберт, навіть якщо стіна за спиною не дала їй відлетіти.
4. Given Софійка відійшла за `spinReach` після початку замаху, When `SPIN` закінчується, Then Серце не втрачено, `COOLDOWN`, через 2 с `WALK`.
5. Given Черепаха йде до Софійки через край платформи, Then вона зупиняється на краю й не падає.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S11 — Сенсор, Вікно, масштаб часу

**Зроблено.** Відхилення: `stepSlowdown` має ще аргумент `canOpen` (false, поки Софійка невразлива), а `SlowdownBook` — поля `attackCount` і `wasAttacking` для ключа атаки; Відродження з відкритим Вікном дає `windowClosed{reflexed:false}`. Невразливість не витрачає атаку: якщо вона скінчиться посеред атаки, Вікно ще може відкритись.

Історії: 3. **Blocked-by:** S10.

**Files**
- `src/sim/slowdown.ts`, `src/sim/slowdown.test.ts`
- `src/sim/sim.ts` (зміна: порядок кроку, блок Blink більше не завершує крок раніше), `src/sim/tuning.ts` (зміна)
- `src/sim/sim.slowdown.test.ts`

**Interfaces**
- Produces у `Tuning`: `sensorRadius: 3.5`, `slowdownSeconds: 1.2`, `slowdownTimeScale: 0.2`.
- `stepSlowdown(state: SlowdownBook, enemies: readonly EnemyState[], sofiyka: Vec3, stepSeconds: number, tuning: Tuning): { book: SlowdownBook; opened: string | null; expired: boolean }`, де `SlowdownBook = { slowdown: SlowdownState; spentFor: ReadonlySet<string> }`. Ключ «цієї атаки» — `id#лічильник`, де лічильник росте на кожному новому переході ворога в `attacking` (передній фронт). Вікно відкривається, коли ворог з `attacking` = true опиняється в `sensorRadius` від Софійки (по xz і на висоті до 2.5 м) і для цього ключа Вікна ще не було. Відлік — у реальних секундах: на кожному кроці `remaining -= stepSeconds / timeScale`.
- Вікно не відкривається, поки Софійка невразлива (щойно вдарена): вона вже в безпеці від цієї атаки.
- `Sim.timeScale` = `slowdownTimeScale` у Вікні, інакше 1. Події `windowOpened`, `windowClosed{reflexed:false}` (по закінченні).
- Відродження закриває Вікно.

**Acceptance**
1. Given Бджола починає замах за 3 м, When крок, Then `windowOpened`, `timeScale` = 0.2, `slowdown.open` = true, `slowdown.remaining` ≈ 1.2.
2. Given Вікно відкрите, When правила крокують без `Shift`, Then `remaining` спадає на 1/12 с за крок і Вікно закривається приблизно за 15 кроків: `windowClosed{reflexed:false}`, `timeScale` = 1, атака триває і шкодить.
3. Given та сама атака, When Вікно щойно закрилось, Then нове Вікно для неї не відкривається, а наступна атака того ж ворога знову відкриває.
4. Given Бджола починає замах за 5 м (поза Сенсором), When Ривок зводить її до 3 м, Then Вікно відкривається у цей момент.
5. Given Blink поруч із ворогом без Вікна, Then `Shift` робить Blink, як у Ітерації 1; блок Blink не пропускає таймери (невразливість і Вікно вмирають вчасно в крок Blink).

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S12 — Рефлекс

**Зроблено.** Відхилення: `findFreeArrival` має ще аргумент `minDistance`; Рефлекс приймає місце не ближче за половину `reflexBehindDistance` за ворогом (відступ від стіни, що лишив би Софійку перед ворогом, — це «нічого не відбувається»); `resolveReflex` бере ще її погляд на випадок ворога просто над нею; крок Рефлексу має `mode` = `BLINK`.

Історії: 4. **Blocked-by:** S11.

**Files**
- `src/sim/reflex.ts`, `src/sim/blink.ts` (зміна: виділено `findFreeArrival`, поведінка Blink без змін)
- `src/sim/sim.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/sim/reflex.property.test.ts`, `src/sim/sim.reflex.test.ts`

**Interfaces**
- Produces у `Tuning`: `reflexBehindDistance: 1.2`, `reflexInvulnerableSeconds: 3.0`.
- `findFreeArrival(world, from: Vec3, dir: {x:number;z:number}, maxDistance: number, tuning: Tuning): Vec3 | null` — спільна з Blink перевірка вільного місця (суцільна стіна зупиняє, ґрати ні, відступ до першого вільного місця).
- `resolveReflex(world, rayDown: (from: Vec3, max: number) => number, enemy: EnemyState, sofiyka: Vec3, tuning: Tuning): Vec3 | null` — місце за ворогом **на горизонтальній лінії «Софійка → ворог» за ворогом** на `reflexBehindDistance`, на висоті підошов Софійки; вільне від геометрії (`findFreeArrival`) і з надійною землею під ним (`isSafeSpot`). Інакше `null`.
- Для Бджоли, що висить, спільне місце — за її проєкцією на площину Софійки.
- У `sim.ts`: у Вікні `Shift` → Рефлекс (рішення з пункту 5 припущень): `reflexed{enemyId, from, to}`, Софійка дивиться на ворога, `slowdown` закривається (`windowClosed{reflexed:true}`), `invulnerable` = `reflexInvulnerableSeconds`, перезарядка Blink не змінюється. `null` — нічого не відбувається.

**Acceptance**
1. Given Вікно відкрите на Бджолі, When `Shift`, Then Софійка на ≈1.2 м за Бджолою (з боку, протилежного до її попереднього місця), дивиться на неї, `reflexed`, `windowClosed{reflexed:true}`; Бджола, що ще цілиться в стару точку, ривкає й застрягає порожньо, Серце не втрачено.
2. Given Черепаха в `WINDUP`, When `Shift` на останньому кроці Вікна, Then Софійка стоїть біля Колби й не втрачає Серце під `SPIN` (невразлива `reflexInvulnerableSeconds`).
3. Given за ворогом прірва або стіна впритул, When `Shift` у Вікні, Then Рефлекс не відбувається, Blink не спрацьовує, Вікно лишається відкритим.
4. Given випадкові рівні й позиції (1000 випадків, зерно, ворог у різних місцях), When Рефлекс виконано, Then капсула Софійки не перетинає жодного блока (незалежна аналітична перевірка, як у S3) і під нею земля.
5. Given Blink із S3 (усі його тести), Then зелені без змін після виділення `findFreeArrival`.

**Verify:** `pnpm test src/sim && pnpm typecheck`

---

### S13 — Удар

**Зроблено.** Відхилення: ворог «у хітбоксі», коли куля його тіла (`bee.radius`, `turtle.radius`) торкається кулі Удару; центр Черепахи — 0.5 м над підошвами. Удар не починається під час `HURT` і в крок Blink; новий натиск посеред Удару ігнорується. Перемога над ворогом, для якого відкрите Вікно, закриває Вікно (`windowClosed{reflexed:false}`). Тест «висяча Бджола» бере `aggroRadius` 0.1, бо з типовими числами Бджола поруч завжди атакує.

Історії: 5, 6. **Blocked-by:** S12.

**Files**
- `src/sim/strike.ts`, `src/sim/strike.test.ts`
- `src/sim/input.ts` (зміна), `src/sim/sim.ts` (зміна), `src/sim/tuning.ts` (зміна)
- `src/view/keyboard.ts` (зміна: `strike: false`, ще без прив'язки клавіш), `src/view/follow-camera.test.ts` (зміна: `strike: false`)
- `src/sim/sim.strike.test.ts`

Файлів виробничого коду п'ять, але `keyboard.ts` і тест камери лише повертають зелений typecheck після зміни типу `Input`: це механічна правка одного рядка.

**Interfaces**
- Produces у `Tuning`: `strikeSeconds: 0.35`, `strikeActiveFrom: 0.10`, `strikeActiveTo: 0.25`, `strikeReach: 0.9`, `strikeRadius: 1.0`, `flaskArcDegrees: 60`, `hitsToDefeat: { bee: 1, turtle: 1 }`.
- `strikeHits(sofiyka: { position: Vec3; facing: number }, enemy: EnemyState, tuning: Tuning): 'hit' | 'blocked' | 'miss'`. Хітбокс — куля радіуса `strikeRadius` з центром на `strikeReach` попереду на висоті грудей. `miss` — ворога поза нею. `blocked` — всередині, але ворог невразливий: Бджола не в `STUCK`, або Черепаха, чия Колба не звернена до Софійки. Колба вразлива, коли кут при Черепасі між напрямком «від голови» (тобто `facing + π`) і напрямком на Софійку не більший за `flaskArcDegrees` (±60°, 120° загалом). `hit` — решта.
- У `sim.ts`: Удар за фронтом натиску; `mode` = `ATTACK` протягом `strikeSeconds` (поверх `IDLE`, `RUN`, `JUMP`; не поверх `HURT` і `BLINK`); хітбокс діє між `strikeActiveFrom` і `strikeActiveTo`; кожного ворога один Удар вражає лише раз; повторний Удар — після відпускання клавіші й завершення попереднього. Переможений ворог видаляється, подія `enemyDefeated`, `struck{enemyId, hit}` (для `miss` — `struck{enemyId:null, hit:false}` з початком хітбоксу).
- Відродження повертає переможених із повним `hp`.

**Acceptance**
1. Given Бджола застрягла за 1 м перед Софійкою, When `strike`, Then Бджола зникає, `enemyDefeated`, `struck{hit:true}`.
2. Given Бджола висить (`HOVER`) перед Софійкою, When `strike`, Then вона на місці, `struck{hit:false}`.
3. Given Черепаха дивиться на Софійку, When `strike` спереду, Then Черепаха на місці, `struck{hit:false}`; Given Софійка за спиною Черепахи (після Рефлексу), When `strike`, Then Черепаха зникає.
4. Given `strike` тримають, Then нового Удару немає, доки клавішу не відпустять і не натиснуть знову; Удар у повітрі працює.
5. Given переможена Бджола, When Софійка втрачає останнє Серце й відроджується, Then Бджола знову на місці з повним `hp` і `HOVER`.

**Verify:** `pnpm test src/sim src/view && pnpm typecheck`

---

### S14 — Вороги на екрані: Бджола, Черепаха, видимий замах

**Зроблено.** Кадр у вбудованому браузері (800×600, панель прихована, кадри вручну через `__lastBear.advance`): Бджола жовто-чорна, Черепаха зелена зі світною фіолетовою Колбою, консоль без помилок. Поріг замаху: середній червоний канал у квадраті 40×40 px навколо Бджоли зростає щонайменше на 15; перший знімок: спокій 58.8 → замах (0.75 с) 91.9, різниця 33.1. Додано для перевірок у dev-збірці: `view.probe` (середній колір області, екранна точка, значення поз) і `__lastBear.advance(секунди)`.

Історії: 1, 2. **Blocked-by:** S10.

**Files**
- `src/view/enemy-models.ts`, `src/view/enemy-pose.ts`, `src/view/game-view.ts` (зміна)
- `src/view/enemy-pose.test.ts`
- `src/levels/playground.ts` (зміна: дві Бджоли і Черепаха на рівній ділянці без прірви навколо)

**Interfaces**
- Produces:
  - `buildBee(): { root: Group; wings: Mesh[]; bodyMaterial: MeshStandardMaterial }`, `buildTurtle(): { root: Group; flaskMaterial: MeshStandardMaterial }` — процедурні моделі з примітивів (Бджола жовто-чорна з крилами; Черепаха зелена з прозорою світною Колбою).
  - `enemyPose(state: BeeState | TurtleState, kind: 'bee' | 'turtle', stateTime: number): { shake: number; tint: number; flaskGlow: number; wingSpeed: number }` — чиста функція за `EnemyState.stateTime`.
  - Колба позначається для вибіркового світіння (як очі).

**Acceptance**
1. Given `enemyPose('WINDUP','bee',0)` і `(…,0.8)`, Then `shake` і `tint` при 0.8 строго більші, ніж при 0; для `HOVER` `shake` = 0.
2. Given `enemyPose('STUCK','bee',1)`, Then `wingSpeed` = 0.
3. Given `enemyPose('WINDUP','turtle',t)` для t від 0 до 1, Then `flaskGlow` не спадає і в кінці більший, ніж на початку.
4. Given гра в браузері, When знято кадр майданчика, Then видно Бджолу і Черепаху, відмінні від Софійки; кадр під час замаху відрізняється від кадру спокою на вимірному рівні (різниця пікселів області ворога більша за поріг, поріг фіксується на першому знімку). Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадри — у вбудованому браузері.

---

### S15 — Серця на екрані і мигання

**Зроблено.** Кадр у вбудованому браузері після втрати Серця: у лівому куті чотири повні й одне порожнє серце (класи `heart-full`×4, `heart-empty`×1), `document.body.innerText` порожній, консоль без помилок. Причину втрати Серця в тому кадрі не перевіряли: критерій стосується показу. `createHud` має ще `flash(strength)` для червоної рамки.

Історії: 7, 8, 10. **Blocked-by:** S8.

**Files**
- `src/view/hud.ts`, `src/view/hud-model.ts`, `src/view/game-view.ts` (зміна), `index.html` (зміна: контейнер HUD і стилі)
- `src/view/hud-model.test.ts`

**Interfaces**
- Produces:
  - `heartsLayout(hearts: number, maxHearts: number): ('full' | 'empty')[]` — завжди довжини `maxHearts`.
  - `blinkVisible(invulnerable: number, timeSeconds: number): boolean` — коли невразлива, видимість мигає ≈8 Гц; коли ні — завжди `true`.
  - `createHud(root: HTMLElement): { update(hearts: number, maxHearts: number): void; dispose(): void }` — п'ять піктограм-сердець у куті, без тексту.
  - Червоний спалах рамки екрана на `heartLost` (чиста функція `hurtFlash(secondsSinceHurt: number): number`, 1 → 0 за 0.3 с).

**Acceptance**
1. Given `heartsLayout(3,5)`, Then `['full','full','full','empty','empty']`; Given `(0,5)`, Then п'ять `'empty'`.
2. Given `blinkVisible(0,t)`, Then завжди `true`; Given `blinkVisible(0.5,t)` для t, що зростає на 1/60 с протягом 1 с, Then є і `true`, і `false`.
3. Given `hurtFlash(0)` = 1, `hurtFlash(0.3)` = 0 і не зростає.
4. Given гра в браузері і Софійка втратила Серце, When знято кадр, Then в куті п'ять сердець, одне порожнє, на екрані жодного тексту. Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадр — у вбудованому браузері.

---

### S16 — Вікно на екрані і час

**Зроблено.** Два кадри у вбудованому браузері (Софійка йде до Бджоли, Вікно відкривається на `bee-1`): середній колір кадру до Вікна (66.7, 60.5, 73.6), у Вікні (54.6, 61.1, 89.1) — синій +15.5, червоний −12.2; над Софійкою піктограма клавіші зі стрілкою вгору; `timeScale` 0.2; консоль без помилок. Тон і віньєтка — окремий прохід шейдера в `bloom.ts` (`setGrade`); піктограма — елемент HUD (`hud.hint`). `createInputLatch` має ще `clear()` (втрата фокусу вікна).

Історії: 3. **Blocked-by:** S11, S14.

**Files**
- `src/view/slowdown-fx.ts`, `src/view/input-latch.ts`, `src/view/game-view.ts` (зміна), `src/main.ts` (зміна)
- `src/view/slowdown-fx.test.ts`, `src/view/input-latch.test.ts`

**Interfaces**
- Produces:
  - `slowdownFx(open: boolean, remaining: number, slowdownSeconds: number): { tint: number; vignette: number; hintScale: number }` — коли відкрите: картинка холодніша, краї темніші, піктограма «Shift» над Софійкою пульсує, `hintScale` росте, коли `remaining` малий.
  - `createInputLatch(): { press(code: string): void; release(code: string): void; snapshot(): ReadonlySet<string>; consumed(): void }` — натиск, що почався й закінчився між двома кроками правил, лишається в `snapshot()` до `consumed()` (тап не губиться, бо в Вікні кроків лише ~12 за секунду).
  - `main.ts`: накопичувач множить кадровий час на `sim.timeScale`; вхід береться з `createInputLatch`, `consumed()` викликається після кроку.

**Acceptance**
1. Given `slowdownFx(false,…)`, Then `tint` = 0, `vignette` = 0, `hintScale` = 0; Given `(true,1.2,1.2)` і `(true,0.2,1.2)`, Then `tint` > 0 в обох, а `hintScale` у другому більший.
2. Given `press('ShiftLeft')` і `release('ShiftLeft')` між двома `snapshot()`, Then перший `snapshot()` після цього містить `ShiftLeft`, а після `consumed()` наступний — ні.
3. Given гра в браузері, When Бджола починає замах біля Софійки, Then видно знак `Shift`, кадр холодніший за спокій (різниця середнього кольору кадру вимірна); консоль без помилок. Кадр до Вікна і під час Вікна.

**Verify:** `pnpm test src/view && pnpm typecheck`; два кадри — у вбудованому браузері.

---

### S17 — Рефлекс на екрані

**Зроблено.** Кадр у вбудованому браузері: Shift у Вікні на `bee-1` → у першому кадрі після Рефлексу `aberration` = 1, хмарки частинок на старті й фініші; за 0.5 с (30 кадрів по 1/60) камера пройшла 88.9% шляху до нового погляду. `followCamera` обмежує поворот чвертю кола за кадр. Не з'ясовано: у першому прогоні (коли справжній цикл гри крутився між викликами перевірки) один кадр камери повернув на 132° і Софійка втратила Серце; повторний прогін на 6 с цього не відтворив (найбільший крок камери < 20°, Сердець 5). У dev-збірці `view.probe.values().events` тепер тримає останні 60 подій.

Історії: 4. **Blocked-by:** S12, S16.

**Files**
- `src/view/follow-camera.ts` (зміна), `src/view/game-view.ts` (зміна), `src/view/blink-fx.ts` (зміна: повторне використання)
- зміни в `src/view/follow-camera.test.ts`

**Interfaces**
- Produces: параметр `followCamera(..., headingOverride?: number)` — коли задано, камера повертається за ним (рівно за новим поглядом Софійки) замість `cameraHeading`; `game-view` задає його на подію `reflexed` на 0.5 с.
- Подія `reflexed` вмикає той самий ефект, що `blinked`: поза розтягнення, розшарування країв, частинки, «вжух» (reuse `blinkPose`, `particles`, `sound`).

**Acceptance**
1. Given подія `reflexed` і новий напрямок погляду на 180°, When минуло 0.5 с, Then `yaw` камери пройшов щонайменше 80% шляху і ні за один кадр не більше чверті кола.
2. Given гра в браузері, When у Вікні натиснуто `Shift`, Then на кадрі в межах 0.15 с видно ефект Blink на старті й фініші Рефлексу, а камера за 0.5 с дивиться на ворога. Консоль без помилок.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадри — у вбудованому браузері.

---

### S18 — Удар лапою: клавіші й поза

**Зроблено.** Кадр у вбудованому браузері: після натиску `X` за 9 кадрів по 1/60 с `armSwing` іде −0.43 → −0.90 (замах) → +0.87 (удар), права лапа піднята на кадрі; натиск ЛКМ на canvas теж дає `ATTACK` і `armSwing` −0.90. Час Удару показ рахує від кроку, на якому `mode` став `ATTACK`.

Історії: 5, 6. **Blocked-by:** S13, S14.

**Files**
- `src/view/keyboard.ts` (зміна: `KeyX` і ЛКМ → `strike`), `src/main.ts` (зміна: слухачі миші)
- `src/entities/bear/animate.ts` (зміна: поза удару)
- `src/entities/bear/strike-pose.test.ts`; зміни в `src/view/keyboard.test.ts`

**Interfaces**
- Produces: `strikePose(secondsInStrike: number, strikeSeconds: number): { armSwing: number }` — права лапа замахується назад, б'є вперед і повертається; 0 на краях. `animateBear` отримує необов'язковий аргумент пози. `keysToInput` читає `KeyX`; ЛКМ — через `createInputLatch` як код `Mouse0`.

**Acceptance**
1. Given `strikePose(0,0.35)` і `(0.35,0.35)`, Then `armSwing` = 0 в обох; Given `(0.15,0.35)`, Then відрізняється від 0.
2. Given натиснуто `KeyX` або `Mouse0`, Then `Input.strike` = true; без них false.
3. Given гра в браузері, When натиснуто `X`, Then на кадрі в межах 0.15 с права лапа відхилена (значення `armSwing` у стані гри ≠ 0). Консоль без помилок.

**Verify:** `pnpm test src/entities src/view && pnpm typecheck`; кадр — у вбудованому браузері.

---

### S19 — Відгук на удар: спалахи, частинки, «дзень»

**Зроблено.** Кадр у вбудованому браузері: Софійка ухилилась від Ривка `bee-1`, підійшла до застряглої Бджоли на 1.03 м і натиснула `X`; за 7 кадрів `struck{bee-1, hit:true}` і `enemyDefeated`, на кадрі хмарка диму й пилу на місці Бджоли, у наступних кадрах `bee-1` немає; `AudioContext` у стані `running`. Консоль свіжої вкладки без помилок. Звук на слух не перевірено — це для користувача. `particles` має ще `dust(at)` (менша хмарка для влучання); переможений ворог дає ще «вжух».

Історії: 5, 6, 7. **Blocked-by:** S15, S18.

**Files**
- `src/view/hit-fx.ts`, `src/view/sound.ts` (зміна: `clink()`), `src/view/game-view.ts` (зміна)
- `src/view/hit-fx.test.ts`

**Interfaces**
- Produces: `hitFxFor(event: SimEvent): { burst: 'smoke' | 'dust' | 'none'; flash: boolean; sound: 'whoosh' | 'clink' | 'none' }` — чиста таблиця: `struck{hit:true}` — спалах і порох; `struck{hit:false, enemyId≠null}` — «дзень» без частинок; `enemyDefeated` — хмарка частинок; `heartLost` — спалах рамки (S15). `Sound.clink()` — короткий металевий синтез Web Audio.

**Acceptance**
1. Given `hitFxFor({type:'struck',enemyId:'b1',hit:true})`, Then `flash` = true, `burst` ≠ `none`; Given `hit:false` із `enemyId`, Then `sound` = `clink`, `burst` = `none`; Given `enemyDefeated`, Then `burst` ≠ `none`.
2. Given гра в браузері, When Удар влучив у застряглу Бджолу, Then на кадрі видно хмарку частинок на її місці, а Бджоли в наступних кадрах немає; `AudioContext` у стані `running`; консоль без помилок. Звук на слух перевіряє користувач.

**Verify:** `pnpm test src/view && pnpm typecheck`; кадр — у вбудованому браузері.

---

### S20 — Арена і «Проходження»

**Зроблено.** Уточнення арени й правил (критерії не пом'якшено): старт Софійки (0,0,−3) замість (0,0,−10) — звідти жоден ворог її не помічав, і «сплячка» не отримувала жодної атаки; `turtle.spinReach` 2.6 замість 1.6 — Черепаха зупинялась на `attackRange` 2.5 і розкручувалась поза досягом, тож нерухому Софійку не била ніколи. Бот-«дитина», окрім правил плану, іде до найближчого ворога, поки той не атакує (інакше вороги не підходять). Критерій 4: «дитина» перемагає спершу Черепаху, а обох Бджіл одним Ударом, тож тест перевіряє повернення першого переможеного ворога (Черепахи), а не Бджоли. «Дитина» проходить арену за 189 кроків, 5 Сердець; без Рефлексу в боті тест падає. Кадр арени: `/?level=arena` у вбудованому браузері — стіни, Черепаха з Колбою, дві Бджоли, панель Сердець; консоль без помилок.

Історії: 11. **Blocked-by:** S13.

**Files**
- `src/sim/scenario.ts`, `src/levels/arena.ts`
- `src/sim/sim.arena.test.ts`, `src/sim/arena.blink.property.test.ts`

**Interfaces**
- Produces:
  - `playScenario(sim: Sim, bot: (sim: Sim, stepIndex: number, lastEvents: SimEvent[]) => Input, maxSteps: number): { events: SimEvent[]; steps: number }` — крокує правила, подаючи кожен крок вхід бота; бот бачить події попереднього кроку; зупиняється, коли ворогів не лишилось або вичерпано `maxSteps`.
  - `ARENA: Level` — плоска арена 30×30 м із бічними стінами; Софійка на (0,0,−10); Черепаха (0,0,4) дивиться на старт; Бджоли (−5,1.5,3) і (5,1.5,3). Прірви немає.
  - Бот-«дитина»: коли `slowdown.open` — `blink: true` один крок (Рефлекс); коли є ворог `vulnerable` або Черепаха за спиною в межах 1 м від Софійки — розвертається до нього й `strike: true`; коли ворог `STUCK` далі за 1 м — підходить до нього; інакше стоїть.
  - Бот-«сплячка»: нічого не натискає.

**Acceptance**
1. Given арена і бот-«дитина», When сценарій завершено, Then всі три вороги переможені, `hearts` = 5, не більше 3000 кроків (≈ 50 с); сценарій ставиться на справжньому Rapier і має бути зеленим, а якщо ні — арену чи правило бота уточнюють, а не пом'якшують критерій.
2. Given арена і бот-«сплячка», When проходить 600 кроків, Then відбулася послідовність `windowOpened` → `windowClosed{reflexed:false}` → `heartLost{hit}` (не натиснула `Shift` у Вікні — втрачає Серце, умова готовності 2).
3. Given бот-«сплячка» і достатньо часу, Then `respawned` із п'ятьма Серцями, усі вороги на місцях із повним `hp`.
4. Given бот-«дитина» переміг Бджолу, а далі «сплячка» дає Відродження, Then переможена Бджола знову є (перевіряє скидання переможених).
5. Given Blink із 1000 випадкових позицій і напрямків на арені (зерно), Then капсула жодного разу не в геометрії (частина умови готовності 3; Селище і Стільники — Ітерації 3–4).

**Verify:** `pnpm test src/sim && pnpm typecheck`; фінал ітерації: `pnpm test && pnpm typecheck && pnpm build`, кадр арени в браузері.

## Незалежне рев'ю правил (S9–S13) і що з ним зроблено

Виправлено, кожне з тестом у `src/sim/sim.review.test.ts`, що падає на старій поведінці:
- Заблокований (`blocked`) ворог більше не «витрачає» Удар: Бджола, що застрягла посеред Удару, ще отримує `hit`; «дзень» — один раз за Удар.
- Бджола після Ривка навскіс у підлогу стоїть над підлогою (була на ~0.35 м у ній).
- Падіння в прірву після відкидання від удару не коштує другого Серця.
- Черепаха не замахується й не влучає, якщо Софійка вище або нижче за `turtle.reachHeight` 1.5 м (нове число).
- Також: `hitsToDefeat` 2 — перший удар лишає Бджолу застряглою, другий перемагає; Відродження після смертельного удару без відкидання; Бджола в `RECOVER` блокує. Напрямок відкидання, коли Бджола просто над Софійкою, береться з її погляду (поріг 1e-3).

Свідомо не змінено:
- Shift у Вікні в повітрі нічого не робить: місце Рефлексу потребує землі під ним (так у плані).
- `slowdown.remaining` зменшується в пункті 6 кроку (у `stepSlowdown`), а не в пункті 1; Shift на кроці, де Вікно спливає, ще зараховується.

Не покрито тестами (мутації виживають): перевірка висоти під час `SPIN` (оберт починається, лише коли Софійка на тій самій висоті); скасування Удару через `HURT`; заборона Удару в крок Blink; `knockback = null` у гілках Blink/Рефлексу; закриття Вікна після перемоги над його ворогом; оберт, що зустрів невразливу Софійку, не витрачається; межі `aggroRadius`/`attackRange` лише на прикладах.

## Покриття

| Вимога специфікації | Зріз |
| --- | --- |
| Бджола: Ривок, застрягання | S9, S14 |
| Черепаха: невразлива спереду, Колба | S10, S13, S14 |
| Сенсор 3.5 м, Вікно 1.2 с | S11, S16 |
| Рефлекс за спину без перезарядки | S12, S17 |
| Удар (ЛКМ або `X`) | S13, S18, S19 |
| Серця, відкидання, 1 с невразливості | S8 ✓, S9, S10, S15 |
| Падіння: мінус Серце, назад на тверде | S8 ✓ |
| Відродження, вороги скинуті | S8 ✓, S9, S10, S13, S20 |
| Вороги повільні, довгий замах | S9, S10, S14 |
| Без тексту | S15, S16 |
| Ефект при телепорті (аберація) і для Рефлексу | S17 |
| Умова готовності 2 (без `Shift` у Вікні — мінус Серце) | S20 (збережений Ключ — Ітерація 4) |
| Умова готовності 3 (Blink не в геометрії) | S3 ✓, S12 (Рефлекс), S20 (арена) |
| Умови готовності 1 і 5 | Ітерація 4 |
