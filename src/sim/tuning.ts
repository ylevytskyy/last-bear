/** Усі числа налаштувань. Стартові значення правляться після гри дитини. */
export type Tuning = {
  /** Прискорення падіння у світі Rapier, м/с² (стрибок Софійки рахується з `jumpGravityUp/Down`). */
  gravity: number;
  /** Гравітація, поки вона летить угору, м/с²: менша, щоб політ був довгим. */
  jumpGravityUp: number;
  /** Гравітація, поки вона падає, м/с²: більша, щоб падіння було впевненим. */
  jumpGravityDown: number;
  /** «Зависання»: поки |швидкість по висоті| менша за це, м/с, гравітація множиться на `jumpHangFactor`. */
  jumpHangSpeed: number;
  /** Множник гравітації під час зависання на вершині. */
  jumpHangFactor: number;
  /** Відпустила кнопку стрибка на підйомі: швидкість угору множиться на це (один раз за стрибок). */
  jumpCutFactor: number;
  /** «Койот»: скільки після сходу з краю ще можна зробити перший стрибок, с. */
  coyoteSeconds: number;
  /** «Буфер»: натиск стільки секунд до приземлення спрацьовує одразу після приземлення, с. */
  jumpBufferSeconds: number;
  /** Керування в повітрі: яку частку розбіжності між бажаною і поточною швидкістю по землі вирівнює один крок (на землі — 1). */
  airControl: number;
  /** Крок правил, с. */
  step: number;
  /** Швидкість руху, м/с. */
  walkSpeed: number;
  /** Висота першого стрибка, м: v0 = √(2·jumpGravityUp·висота); зависання додає трохи зверху. */
  jumpHeight: number;
  /** Висота стрибка в повітрі, м. */
  doubleJumpHeight: number;
  /** Дальність Blink, м. */
  blinkDistance: number;
  /** Перезарядка Blink, с. */
  blinkCooldown: number;
  /** Найближче місце прибуття; ближче Blink не відбувається, м. */
  blinkMinDistance: number;
  /** Бажана відстань камери від Софійки, м. */
  cameraDistance: number;
  /** Висота камери над підошвами, м. */
  cameraHeight: number;
  /** Висота точки, на яку дивиться камера, над підошвами, м. */
  cameraLookHeight: number;
  /** Швидкість повороту камери за Софійкою, 1/с. */
  cameraTurnRate: number;
  /** Яскравість очей, коли Blink готовий. */
  eyeGlowReady: number;
  /** Яскравість очей одразу після Blink. */
  eyeGlowSpent: number;
  /** Кількість Сердець. */
  hearts: number;
  /** Невразливість після втрати Серця, с. */
  invulnerableSeconds: number;
  /** Радіус капсули Софійки, м. */
  capsuleRadius: number;
  /** Повна висота капсули Софійки, м. */
  capsuleHeight: number;
  /** Відкидання від удару ворога: відстань, м. */
  knockbackDistance: number;
  /** Відкидання від удару ворога: тривалість, с. */
  knockbackSeconds: number;
  /** Скільки Софійка в стані HURT після удару, с. */
  hurtSeconds: number;
  /** Скільки Ударів витримує ворог. */
  hitsToDefeat: { bee: number; turtle: number; source: number };
  /** Радіус Сенсора по xz, м. */
  sensorRadius: number;
  /** Тривалість Вікна в реальних секундах. */
  slowdownSeconds: number;
  /** Масштаб часу у Вікні. */
  slowdownTimeScale: number;
  /** На скільки за ворогом опиняється Софійка після Рефлексу, м. */
  reflexBehindDistance: number;
  /** Невразливість після Рефлексу, с (вигадано планом). */
  reflexInvulnerableSeconds: number;
  /** Тривалість Удару, с. */
  strikeSeconds: number;
  /** Хітбокс Удару діє від цієї миті, с. */
  strikeActiveFrom: number;
  /** ...і до цієї, с. */
  strikeActiveTo: number;
  /** Центр хітбоксу попереду Софійки, м. */
  strikeReach: number;
  /** Радіус хітбоксу, м. */
  strikeRadius: number;
  /** Колба вразлива в межах ± стільки градусів від напрямку «від голови» Черепахи. */
  flaskArcDegrees: number;
  /** Бджола. */
  bee: {
    /** Відстань (3D), з якої Бджола починає замах, м. */
    aggroRadius: number;
    /** Замах перед Ривком, с. */
    windupSeconds: number;
    /** Швидкість Ривка, м/с. */
    dashSpeed: number;
    /** Найдовший Ривок, с. */
    dashMaxSeconds: number;
    /** Застрягання після Ривка, с. */
    stuckSeconds: number;
    /** Повернення додому, с. */
    recoverSeconds: number;
    /** Радіус тіла, м. */
    radius: number;
    /** Висота польоту над підлогою (для рівнів), м. */
    hoverHeight: number;
  };
  /** Черепаха. Відстані — по площині xz. */
  turtle: {
    /** З якої відстані йде до Софійки, м. */
    aggroRadius: number;
    /** Швидкість ходьби, м/с. */
    walkSpeed: number;
    /** З якої відстані починає замах, м. */
    attackRange: number;
    /** Замах перед розкруткою, с. */
    windupSeconds: number;
    /** Розкрутка, с. */
    spinSeconds: number;
    /** Досяг розкрутки від центру Черепахи до центру Софійки, м. */
    spinReach: number;
    /** Відпочинок після розкрутки, с. */
    cooldownSeconds: number;
    /** Радіус тіла (для стін), м. */
    radius: number;
    /** Найбільша різниця висот підошов, за якої Черепаха замахується і влучає, м. */
    reachHeight: number;
  };
  /** Світи і переходи між ними. */
  worlds: {
    /** Перехід через Квітку: заливка екрана й назад, с; світ міняється посередині. */
    transitionSeconds: number;
    /** Перетворення на початку Залаштунків: стільки секунд правила не приймають руху, с. */
    introSeconds: number;
  };
  /** Рухомі платформи. */
  movers: {
    /** Швидкість руху між точками A і B, м/с. */
    speed: number;
  };
  /** Джерело: казан, що віддає Ключ. */
  source: {
    /** Півширина куба казана, м. */
    halfWidth: number;
    /** Висота куба, м. */
    height: number;
    /** Ключ підбирається, коли Софійка ближче за стільки (по xz), м. */
    pickupRadius: number;
    /** Ключ лягає на стільки від центра казана в бік Софійки, м. */
    keyDropDistance: number;
  };
  /** Селище: Клітки, Квітки, Бульбашка. */
  village: {
    /** Сторона куба Клітки, м. */
    cageSize: number;
    /** Товщина стінки Клітки, м. */
    cageWall: number;
    /** Клітка відкривається, коли вісь капсули ближче за стільки до її прямокутника по xz, м. */
    cageOpenRadius: number;
    /** Контрольна точка відкритої Клітки: відстань від її центра в бік дверей, м. */
    cageCheckpointDistance: number;
    /** Висота верху ніжки Квітки над землею, м. */
    flowerStemTop: number;
    /** Півширина ніжки Квітки, м. */
    flowerStemHalfWidth: number;
    /** Висота бутона над землею: крізь неї згори вниз Софійка входить у Квітку, м. */
    flowerBudHeight: number;
    /** Входить у Квітку, якщо по xz ближче за стільки до її центра, м. */
    flowerEnterRadius: number;
    /** Квітка розкривається, коли Софійка ближче за стільки, м. */
    flowerOpenRadius: number;
    /** Розкриття або закриття Квітки, с. */
    flowerOpenSeconds: number;
    /** Бульбашка Вцілілого видна, коли Софійка ближче за стільки, м. */
    talkRadius: number;
    /** Один малюнок Бульбашки показується стільки, с. */
    bubbleFrameSeconds: number;
  };
};

export const TUNING: Tuning = {
  gravity: 25,
  jumpGravityUp: 14,
  jumpGravityDown: 30,
  jumpHangSpeed: 1,
  jumpHangFactor: 0.5,
  jumpCutFactor: 0.4,
  coyoteSeconds: 0.1,
  jumpBufferSeconds: 0.12,
  airControl: 0.2,
  step: 1 / 60,
  walkSpeed: 5,
  jumpHeight: 1.52,
  doubleJumpHeight: 1.22,
  blinkDistance: 6,
  blinkCooldown: 2,
  blinkMinDistance: 0.5,
  cameraDistance: 6,
  cameraHeight: 3.5,
  cameraLookHeight: 1,
  cameraTurnRate: 5,
  eyeGlowReady: 4,
  eyeGlowSpent: 0.5,
  hearts: 5,
  invulnerableSeconds: 1,
  capsuleRadius: 0.4,
  capsuleHeight: 1.4,
  knockbackDistance: 3,
  knockbackSeconds: 0.25,
  hurtSeconds: 0.3,
  hitsToDefeat: { bee: 1, turtle: 1, source: 3 },
  sensorRadius: 3.5,
  slowdownSeconds: 1.2,
  slowdownTimeScale: 0.2,
  reflexBehindDistance: 1.2,
  reflexInvulnerableSeconds: 3.0,
  strikeSeconds: 0.35,
  strikeActiveFrom: 0.1,
  strikeActiveTo: 0.25,
  strikeReach: 0.9,
  strikeRadius: 1.0,
  flaskArcDegrees: 60,
  bee: {
    aggroRadius: 9,
    windupSeconds: 0.9,
    dashSpeed: 8,
    dashMaxSeconds: 1.0,
    stuckSeconds: 2.0,
    recoverSeconds: 1.5,
    radius: 0.5,
    hoverHeight: 1.5,
  },
  turtle: {
    aggroRadius: 8,
    walkSpeed: 1.2,
    attackRange: 2.5,
    windupSeconds: 1.0,
    spinSeconds: 1.5,
    spinReach: 2.6,
    cooldownSeconds: 2.0,
    radius: 0.7,
    reachHeight: 1.5,
  },
  worlds: { transitionSeconds: 1.2, introSeconds: 2.0 },
  movers: { speed: 1.5 },
  source: { halfWidth: 1.0, height: 1.6, pickupRadius: 1.0, keyDropDistance: 0.5 },
  village: {
    cageSize: 2.0,
    cageWall: 0.1,
    cageOpenRadius: 0.8,
    cageCheckpointDistance: 2.5,
    flowerStemTop: 0.6,
    flowerStemHalfWidth: 0.3,
    flowerBudHeight: 0.7,
    flowerEnterRadius: 1.3,
    flowerOpenRadius: 6,
    flowerOpenSeconds: 0.8,
    talkRadius: 5,
    bubbleFrameSeconds: 1.2,
  },
};
