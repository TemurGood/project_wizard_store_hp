export interface SortingOption {
  label: string;
  weights: {
    Gryffindor?: number;
    Slytherin?: number;
    Ravenclaw?: number;
    Hufflepuff?: number;
    Durmstrang?: number;
    Beauxbatons?: number;
  };
  genderValue?: "male" | "female";
}

export interface SortingQuestion {
  id: number;
  question: string;
  subtitle: string;
  options: SortingOption[];
}

export interface HouseDetails {
  key: string;
  name_ru: string;
  name_en: string;
  founder: string;
  colors: string;
  animal: string;
  element: string;
  motto: string;
  description: string;
  badgeEmoji: string;
  accentColor: string;
}

export const HOUSE_DETAILS: Record<string, HouseDetails> = {
  Gryffindor: {
    key: "Gryffindor",
    name_ru: "Гриффиндор (Gryffindor)",
    name_en: "Gryffindor",
    founder: "Годрик Гриффиндор",
    colors: "Алый и золотой",
    animal: "Золотой Лев 🦁",
    element: "Огонь",
    motto: "Храбрость, благородство, честь и решимость!",
    description:
      "Распределяющая шляпа видит в твоём сердце пламя истинного героя! Ты не боишься встать на защиту слабых, идти наперекор опасности и совершать подвиги во имя справедливости.",
    badgeEmoji: "🦁",
    accentColor: "#740001",
  },
  Slytherin: {
    key: "Slytherin",
    name_ru: "Слизерин (Slytherin)",
    name_en: "Slytherin",
    founder: "Салазар Слизерин",
    colors: "Изумрудный и серебряный",
    animal: "Серебряная Змея 🐍",
    element: "Вода",
    motto: "Амбиции, хитрость, находчивость и величие!",
    description:
      "В тебе скрыта железная воля и стратегический ум прирождённого лидера! Слизерин приведёт тебя к вершинам могущества, ведь ты всегда знаешь, как достичь поставленной цели.",
    badgeEmoji: "🐍",
    accentColor: "#1a472a",
  },
  Ravenclaw: {
    key: "Ravenclaw",
    name_ru: "Когтевран (Ravenclaw)",
    name_en: "Ravenclaw",
    founder: "Кандида Когтевран",
    colors: "Сапфировый и бронзовый",
    animal: "Бронзовый Орёл 🦅",
    element: "Воздух",
    motto: "Ума палата дороже злата!",
    description:
      "Твой разум острее любого клинка! В башне Когтеврана, где вместо пароля задают философские загадки, ты обретёшь единомышленников среди мудрецов, изобретателей и провидцев.",
    badgeEmoji: "🦅",
    accentColor: "#0e1a40",
  },
  Hufflepuff: {
    key: "Hufflepuff",
    name_ru: "Пуффендуй (Hufflepuff)",
    name_en: "Hufflepuff",
    founder: "Пенелопа Пуффендуй",
    colors: "Канареечно-жёлтый и чёрный",
    animal: "Верный Барсук 🦡",
    element: "Земля",
    motto: "Трудолюбие, верность, честность и терпение!",
    description:
      "Твоя преданность друзьям и честный труд делают тебя несокрушимой опорой волшебного мира. Из Пуффендуя вышли самые надёжные мракоборцы, магозоологи и министры магии!",
    badgeEmoji: "🦡",
    accentColor: "#b8860b",
  },
  Durmstrang: {
    key: "Durmstrang",
    name_ru: "Институт Дурмстранг (Durmstrang)",
    name_en: "Durmstrang",
    founder: "Нерида Вульчанова",
    colors: "Кроваво-багряный и тёмный мех",
    animal: "Двуглавый Северный Орёл ⚔️",
    element: "Северный Лёд и Пламя",
    motto: "Сила духа, боевая магия и воинская закалка!",
    description:
      "Шляпа чувствует в тебе суровую северную мощь, которой тесно в стенах шотландского замка! Твой путь лежит на борт призрачного корабля в Институт Дурмстранг, где изучают высшую боевую магию и воинское искусство.",
    badgeEmoji: "⚔️",
    accentColor: "#5c0606",
  },
  Beauxbatons: {
    key: "Beauxbatons",
    name_ru: "Академия Шармбатон (Beauxbatons)",
    name_en: "Beauxbatons",
    founder: "Николас и Пернелла Фламель",
    colors: "Небесно-лазурный и серебро",
    animal: "Золотые скрещённые палочки 🦋",
    element: "Свет и Эфир",
    motto: "Изящество, утончённая алхимия и высокая гармония чар!",
    description:
      "Твоя магия исполнена утончённой грации, света и французского величия! Дворец Академии Шармбатон в солнечных Пиренеях распахнёт перед тобой свои хрустальные залы и фонтаны вечной молодости.",
    badgeEmoji: "🦋",
    accentColor: "#2b5b84",
  },
};

export const SORTING_HAT_QUESTIONS: SortingQuestion[] = [
  {
    id: 1,
    question: "Выберите ваш пол",
    subtitle: "Вопрос 1 из 10 • Древний канон распределения магических школ Европы",
    options: [
      {
        label: "🧙‍♂️ Мужской (Волшебник / Wizard)",
        genderValue: "male",
        weights: { Gryffindor: 1, Slytherin: 1, Ravenclaw: 1, Hufflepuff: 1, Durmstrang: 2 },
      },
      {
        label: "🧙‍♀️ Женский (Волшебница / Witch)",
        genderValue: "female",
        weights: { Gryffindor: 1, Slytherin: 1, Ravenclaw: 1, Hufflepuff: 1, Beauxbatons: 2 },
      },
    ],
  },
  {
    id: 2,
    question: "Рассвет или сумерки? Луна или звёзды?",
    subtitle: "Вопрос 2 из 10 • Из канонического испытания Pottermore",
    options: [
      {
        label: "☀️ Золотой рассвет над горами и живое пламя",
        weights: { Gryffindor: 3, Beauxbatons: 2 },
      },
      {
        label: "🌙 Таинственные сумерки, серебряная луна и туман над водой",
        weights: { Slytherin: 3, Durmstrang: 2 },
      },
      {
        label: "✨ Бесконечное звёздное небо и созвездия мудрецов",
        weights: { Ravenclaw: 3, Beauxbatons: 1 },
      },
      {
        label: "🌾 Тёплый полдень среди цветущих холмов и вековых дубов",
        weights: { Hufflepuff: 3 },
      },
    ],
  },
  {
    id: 3,
    question: "Перед вами четыре зачарованные шкатулки. Какую вы откроете?",
    subtitle: "Вопрос 3 из 10 • Испытание тайных стремлений сердца",
    options: [
      {
        label: "🐢 Черепаховую шкатулку с золотом, внутри которой пищит живое существо",
        weights: { Hufflepuff: 3, Beauxbatons: 1 },
      },
      {
        label: "🖤 Блестящую угольно-чёрную с серебряным замком и руной Мерлина",
        weights: { Slytherin: 3, Durmstrang: 3 },
      },
      {
        label: "⚜️ Золотой ларец на ножках, предупреждающий о проверке отваги",
        weights: { Gryffindor: 3, Durmstrang: 1 },
      },
      {
        label: "📜 Оловянную шкатулку с надписью: «Я открываюсь лишь для достойных умом»",
        weights: { Ravenclaw: 3, Beauxbatons: 2 },
      },
    ],
  },
  {
    id: 4,
    question: "На мосту путь преграждает разъярённый горный тролль с дубиной. Ваши действия?",
    subtitle: "Вопрос 4 из 10 • Ситуационный выбор в бою",
    options: [
      {
        label: "⚡ Выхватить палочку и смело принять бой, защищая товарищей",
        weights: { Gryffindor: 3, Durmstrang: 2 },
      },
      {
        label: "🪄 Применить мощное боевое проклятие или подчинить тролля своей воле",
        weights: { Durmstrang: 4, Slytherin: 2 },
      },
      {
        label: "✨ Ослепить тролля изящной иллюзией света и провести всех без единой царапины",
        weights: { Beauxbatons: 4, Ravenclaw: 2 },
      },
      {
        label: "🤝 Договориться или отвлечь его сообща, чтобы никто не пострадал",
        weights: { Hufflepuff: 3, Ravenclaw: 1 },
      },
    ],
  },
  {
    id: 5,
    question: "Какой магический предмет или дисциплина манит вас сильнее всего?",
    subtitle: "Вопрос 5 из 10 • Академическое призвание",
    options: [
      {
        label: "🛡️ Защита от Тёмных Искусств и дуэльный клуб",
        weights: { Gryffindor: 3, Durmstrang: 2 },
      },
      {
        label: "🧪 Тонкое Зельеварение, Древние Руны и тайны могущества",
        weights: { Slytherin: 3, Durmstrang: 2 },
      },
      {
        label: "🔭 Высшая Трансфигурация, Астрономия и Алхимия Николаса Фламеля",
        weights: { Ravenclaw: 3, Beauxbatons: 3 },
      },
      {
        label: "🌿 Травология и Уход за магическими существами",
        weights: { Hufflepuff: 3 },
      },
    ],
  },
  {
    id: 6,
    question: "В зачарованном саду растут четыре удивительных растения. К какому вы подойдёте первым?",
    subtitle: "Вопрос 6 из 10 • Природа магического дара",
    options: [
      {
        label: "🌳 Древо с серебряными листьями и золотыми яблоками бессмертия",
        weights: { Beauxbatons: 3, Ravenclaw: 2 },
      },
      {
        label: "🌹 Алые огненные розы, поющие гимны древних героев",
        weights: { Gryffindor: 3 },
      },
      {
        label: "🍄 Светящиеся в полумраке грибы, шепчущие забытые секреты",
        weights: { Slytherin: 3, Durmstrang: 2 },
      },
      {
        label: "🌺 Тёплый целебный куст, исцеляющий усталость и печаль каждого путника",
        weights: { Hufflepuff: 3 },
      },
    ],
  },
  {
    id: 7,
    question: "Какого звука музыкального инструмента откликается ваша душа?",
    subtitle: "Вопрос 7 из 10 • Гармония волшебного сердца",
    options: [
      {
        label: "🎺 Призывный звук золотой трубы и бой барабанов",
        weights: { Gryffindor: 3, Durmstrang: 3 },
      },
      {
        label: "🎻 Певучая скрипка и хрустальная арфа в лунном свете",
        weights: { Beauxbatons: 4, Slytherin: 2 },
      },
      {
        label: "🎹 Глубокое звучание рояля в тишине старинной библиотеки",
        weights: { Ravenclaw: 3 },
      },
      {
        label: "🪕 Тёплая лютня и флейта у дружеского камина",
        weights: { Hufflepuff: 3 },
      },
    ],
  },
  {
    id: 8,
    question: "Что бы вы предпочли услышать о себе в хрониках истории магии?",
    subtitle: "Вопрос 8 из 10 • Наследие волшебника",
    options: [
      {
        label: "🦁 «Его/её бесстрашие спасло друзей в самый тёмный час»",
        weights: { Gryffindor: 3 },
      },
      {
        label: "👑 «Непревзойдённый триумфатор, чьё имя внушало трепет и восхищение»",
        weights: { Slytherin: 3, Durmstrang: 3 },
      },
      {
        label: "📚 «Первооткрыватель величайших тайн мироздания и изящных чар»",
        weights: { Ravenclaw: 3, Beauxbatons: 3 },
      },
      {
        label: "💛 «Самый добрый, справедливый и верный человек своего века»",
        weights: { Hufflepuff: 3 },
      },
    ],
  },
  {
    id: 9,
    question: "В какой обстановке вы чувствуете прилив магических сил?",
    subtitle: "Вопрос 9 из 10 • Место силы",
    options: [
      {
        label: "🏰 В высокой башне у камина, когда за окном бушует гроза",
        weights: { Gryffindor: 3, Ravenclaw: 2 },
      },
      {
        label: "🚢 На палубе боевого корабля среди северных льдов и фьордов",
        weights: { Durmstrang: 4, Slytherin: 2 },
      },
      {
        label: "⛲ В солнечном мраморном дворце среди садов и хрустальных фонтанов",
        weights: { Beauxbatons: 4, Ravenclaw: 1 },
      },
      {
        label: "🍯 В уютной подземной гостиной, окружённой друзьями и ароматом выпечки",
        weights: { Hufflepuff: 3, Slytherin: 1 },
      },
    ],
  },
  {
    id: 10,
    question: "И последний вопрос Распределяющей Шляпы: к чему лежит ваше собственное сердце?",
    subtitle: "Вопрос 10 из 10 • Ведь Шляпа всегда учитывает выбор самого волшебника!",
    options: [
      {
        label: "🦁 К отважному Гриффиндору или суровому северному братству",
        weights: { Gryffindor: 3, Durmstrang: 2 },
      },
      {
        label: "🐍 К амбициозному Слизерину или древней воинской школе",
        weights: { Slytherin: 3, Durmstrang: 2 },
      },
      {
        label: "🦅 К мудрому Когтеврану или утончённой Академии изящных чар",
        weights: { Ravenclaw: 3, Beauxbatons: 2 },
      },
      {
        label: "🦡 К верному Пуффендую или светлому братству гармонии",
        weights: { Hufflepuff: 3, Beauxbatons: 2 },
      },
    ],
  },
];

export function computeSortedHouse(
  gender: "male" | "female",
  answers: number[]
): HouseDetails {
  const scores: Record<string, number> = {
    Gryffindor: 0,
    Slytherin: 0,
    Ravenclaw: 0,
    Hufflepuff: 0,
    Durmstrang: 0,
    Beauxbatons: 0,
  };

  SORTING_HAT_QUESTIONS.forEach((q, idx) => {
    const chosenIdx = answers[idx] ?? 0;
    const opt = q.options[chosenIdx] || q.options[0];
    if (opt && opt.weights) {
      for (const [school, pts] of Object.entries(opt.weights)) {
        scores[school] = (scores[school] || 0) + (pts || 0);
      }
    }
  });

  // Enforce strict rule:
  // Durmstrang ONLY eligible if Question 1 = Male ("male")
  // Beauxbatons ONLY eligible if Question 1 = Female ("female")
  if (gender !== "male") {
    delete scores.Durmstrang;
  }
  if (gender !== "female") {
    delete scores.Beauxbatons;
  }

  let bestKey = "Gryffindor";
  let bestScore = -1;
  for (const [key, val] of Object.entries(scores)) {
    if (val > bestScore) {
      bestScore = val;
      bestKey = key;
    }
  }

  return HOUSE_DETAILS[bestKey] || HOUSE_DETAILS.Gryffindor;
}

