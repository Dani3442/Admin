const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const RF_TEMPLATE_NAME = 'РФ — основной шаблон запуска'
const CHINA_TEMPLATE_NAME = 'Китай — основной шаблон запуска'

function envValue(name) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

const RECIPIENT_SEEDS = {
  responsible: { type: 'responsible', name: 'Ответственный' },
  adel: { type: 'user', name: 'Аделя', telegramId: '759914309' },
  lana: { type: 'user', name: 'Лана', telegramId: '729921634' },
  kirill: { type: 'user', name: 'Кирилл', telegramId: '374865502' },
  katya: { type: 'user', name: 'Катя', telegramId: '50980404' },
  ivan: { type: 'user', name: 'Иван', telegramId: '95692828' },
  director: { type: 'user', name: 'Данила', telegramId: '6778090342' },
  bella: { type: 'user', name: 'Белла' },
  olya: { type: 'user', name: 'Оля' },
  accountant: { type: 'user', name: 'Бух' },
  warehouse: { type: 'chat', name: 'Склад', chatId: envValue('TELEGRAM_WAREHOUSE_CHAT_ID') },
  novinki: { type: 'chat', name: 'новинки', chatId: envValue('TELEGRAM_NOVINKI_CHAT_ID') },
  commonChat: { type: 'chat', name: 'Общий чат', chatId: envValue('TELEGRAM_COMMON_CHAT_ID') },
  responsibleKatya: { type: 'chat', name: 'Ответственный + Катя' },
  responsibleAccountant: { type: 'chat', name: 'Ответственный + Бух' },
  ivanResponsible: { type: 'chat', name: 'Иван + Ответственный' },
}

const USER_NAME_ALIASES = {
  'Данила': ['Данила', 'Данил'],
  'Бух': ['Бух', 'Бухгалтер', 'Бухгалтерия'],
  'Оля': ['Оля', 'Ольга'],
}

const RF_STAGES = [
  {
    name: '1. Реф на продукт',
    durationDays: null,
    durationText: 'Запуск цепочки РФ',
    startTrigger: 'PRODUCT_CREATED',
    stageNotifications: [
      {
        eventType: 'stage_started',
        recipientKey: 'novinki',
        messageTemplate: 'custom',
        customMessage:
          'Новый продукт РФ запущен\n\nПродукт: {product_name}\nЭтап: {stage_name}\nОтветственный: {responsible_user}\nДата старта: {start_date}',
      },
    ],
  },
  {
    name: '2. ТЗ на продукт',
    durationDays: 3,
    durationText: '3 рабочих дня',
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Написать', recipientKey: 'responsible' },
      { name: 'Согласовать', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Таргет', responsibleName: 'Катя', recipientKey: 'katya' },
    ],
  },
  {
    name: '3. Сбор предложений',
    durationDays: 10,
    durationText: '10 рабочих дней',
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Рассылка', recipientKey: 'responsible' },
      { name: 'Тара', recipientKey: 'responsible' },
      { name: 'Этикетка', recipientKey: 'responsible' },
      { name: 'Коробка', recipientKey: 'responsible' },
      { name: 'Свести в таблицу', recipientKey: 'responsible' },
    ],
  },
  {
    name: '4.1. Образец',
    durationDays: 7,
    durationText: '1 календарная неделя',
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Выбор поставщика', recipientKey: 'responsibleKatya' },
      { name: 'Докад рев', recipientKey: 'responsible' },
      { name: 'Варка', recipientKey: 'responsible' },
      { name: 'Доставка', recipientKey: 'responsible' },
      { name: 'Тестирование', responsibleName: 'Катя', recipientKey: 'katya' },
    ],
  },
  {
    name: '4.2. Документы',
    durationDays: 7,
    durationText: '1 календарная неделя. Запуск одновременно с 4.1.',
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 3,
    subStages: [
      { name: 'Договор', recipientKey: 'responsible' },
      { name: 'Протокол', recipientKey: 'responsible' },
      { name: 'Прочее', recipientKey: 'responsible' },
    ],
  },
  {
    name: '5. Подготовка',
    durationDays: 14,
    durationText: '14 рабочих дней',
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 3,
    subStages: [
      { name: 'Финальный состав', description: '1 день', recipientKey: 'responsible' },
      { name: 'Докад партии - н/о', description: '3 дня', recipientKey: 'responsible' },
      {
        name: 'Докад тары - оплата',
        description: '5 дней. Пометка на карте: субтитры создавал.',
        recipientKey: 'responsibleAccountant',
      },
      { name: 'ТЗ дизайнеру составить', description: '1 день', recipientKey: 'responsible' },
      { name: 'ТЗ согласовать', description: '1 день', recipientKey: 'responsibleKatya' },
      { name: 'Дедлайн сделать', description: '5 дней', responsibleName: 'Белла', recipientKey: 'bella' },
      { name: 'Заказать упаковку', description: '5 дней. Этикетка, коробка.', recipientKey: 'responsible' },
      { name: 'Заказать ручки', description: '1 день', recipientKey: 'responsible' },
      { name: 'Подать доки ДС', description: '1 день', responsibleName: 'Аделя', recipientKey: 'adel' },
      { name: 'Завести карточку в каталоге', description: '1 день', responsibleName: 'Аделя', recipientKey: 'adel' },
      { name: 'Сделать визуал', recipientKey: 'ivanResponsible' },
    ],
  },
  {
    name: '6.1. ДС',
    durationDays: 30,
    durationText: '30 календарных дней',
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 5,
  },
  {
    name: '6.2. Производство',
    durationDays: 30,
    durationText: '30 календарных дней',
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 5,
  },
  {
    name: '6.3. Информирование',
    durationDays: 3,
    durationText: '3 рабочих дня',
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 5,
    subStages: [
      { name: 'Внести инфо в каталог для продаж' },
      { name: 'Оповестить продажников' },
    ],
    stageNotifications: [
      {
        eventType: 'stage_started',
        recipientKey: 'novinki',
        messageTemplate: 'custom',
        customMessage:
          'Новинка скоро будет готова\n\nПродукт: {product_name}\nПлановая дата готовности: {end_date}\nЭтап: {stage_name}',
      },
    ],
  },
  {
    name: '6.4. Чек пр-ва',
    durationDays: 7,
    durationText: '7 календарных дней. Старт за неделю до конца производства.',
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 7,
    startDelayDays: 23,
    subStages: [
      { name: 'Оплата вторых 50%', recipientKey: 'responsibleAccountant' },
      { name: 'Чек, этикетка, коробка, ручки', recipientKey: 'responsible' },
      { name: 'Организация доставки' },
    ],
  },
  {
    name: '7. Доставка',
    durationDays: 3,
    durationText: '3 рабочих дня',
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
  },
  {
    name: '8. Продукты на нашем складе',
    durationDays: null,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Инспекция', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Доп. упаковка', recipientKey: 'warehouse' },
      { name: 'Этикировка', recipientKey: 'warehouse' },
      { name: 'Оповещение продаж', recipientKey: 'responsible' },
      { name: 'Инвойс в общий чат', responsibleName: 'Катя', recipientKey: 'katya' },
    ],
  },
]

const CHINA_STAGE_SEEDS = [
  {
    name: '1. Реф на продукт',
    durationText: '7 рабочих дней',
    durationDays: 7,
    startTrigger: 'PRODUCT_CREATED',
    stageNotifications: [
      {
        eventType: 'stage_completed',
        recipientKey: 'novinki',
        messageTemplate: 'custom',
        customMessage:
          'Реф на продукт завершён\n\nПродукт: {product_name}\nЭтап: {stage_name}\nОтветственный: {responsible_user}\nДата закрытия: {end_date}',
      },
    ],
  },
  {
    name: '2. ТЗ Фабрика',
    durationText: '2 рабочих дня',
    durationDays: 2,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Написать', recipientKey: 'responsible' },
      { name: 'Согласовать', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Таргет', responsibleName: 'Катя', recipientKey: 'katya' },
    ],
  },
  {
    name: '3. Сбор предложений',
    durationText: '10 рабочих дней',
    durationDays: 10,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'responsible' }],
    subStages: [
      { name: 'Цены дать с таргет', recipientKey: 'responsible' },
      { name: 'Согласовать цены тару', description: 'Катя + Иван', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Чек банка', description: 'Оля бух + пр', recipientKey: 'accountant' },
    ],
  },
  {
    name: '4.1. Подготовка карго образцов',
    durationText: '1,5 календарных месяца',
    durationDays: 45,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Создание названий ru/англ + арт', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'ТЗ дизу', recipientKey: 'responsible' },
      { name: 'Согласовать ТЗ', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Счет оплатить образцы', recipientKey: 'responsible' },
      { name: 'Создание макета', responsibleName: 'Белла', recipientKey: 'bella' },
      { name: 'Отдать макет на ФК + производство', recipientKey: 'responsible' },
    ],
  },
  {
    name: '4.2. Доставка карго',
    durationText: '1 календарная неделя',
    durationDays: 7,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'kirill' }],
  },
  {
    name: '4.3. Тест карго',
    durationText: '3 рабочих дня',
    durationDays: 3,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'katya' }],
  },
  {
    name: '5.2. Образец 064',
    durationText: '2 календарные недели',
    durationDays: 14,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Подготовка образцов', recipientKey: 'responsible' },
      { name: 'Вопросы ввоза', recipientKey: 'olya' },
      { name: 'Ввоз', recipientKey: 'olya' },
    ],
  },
  {
    name: '5.1. Документация 064',
    durationText: '2,5 календарных месяца. Старт через 1 месяц после начала 4.1.',
    durationDays: 75,
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 3,
    startDelayDays: 30,
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'responsible' }],
    subStages: [
      { name: 'Инвойс 064', description: 'Оля + бух + ответственный', recipientKey: 'responsible' },
      { name: 'Контракт', description: 'Оля + бух + ответственный', recipientKey: 'responsible' },
      { name: 'Все документы', description: 'Оля + бух + ответственный', recipientKey: 'responsible' },
      { name: 'Этикетка 064', description: 'Оля + бух + ответственный', recipientKey: 'responsible' },
    ],
  },
  {
    name: '7.1. Подготовка к запуску',
    durationText: '15 календарных дней. Старт одновременно с 5.1.',
    durationDays: 15,
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 7,
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'responsible' }],
    subStages: [
      { name: 'Создать карточки в нашем каталоге', description: '2 дня. Аделя + пр.', responsibleName: 'Аделя', recipientKey: 'adel' },
      { name: 'Чистовое ТЗ дизайн', description: '1 день', recipientKey: 'responsible' },
      { name: 'Согласование ТЗ', description: '1 день', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Заново согласовать цены', description: '1 день. Катя + Иван.', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Делаем макет', description: '5 дней', responsibleName: 'Белла', recipientKey: 'bella' },
      { name: 'Делаем визуал', description: '5 дней. Пр + Илья.', recipientKey: 'responsible' },
    ],
  },
  {
    name: '6.1. Декларация',
    durationText: '2,5 календарных месяца. Старт через 30 дней после запуска продукта.',
    durationDays: 75,
    startTrigger: 'PRODUCT_CREATED',
    startDelayDays: 30,
    stageNotifications: [{ eventType: 'stage_started', recipientKey: 'katya' }],
  },
  {
    name: '6.2. Декларация',
    durationText: '18 дней. Старт вместе с 6.1.',
    durationDays: 18,
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 9,
    subStages: [
      { name: 'Подключить ДС в карточку 43', description: 'Оля + Аделя + пр.', responsibleName: 'Аделя', recipientKey: 'adel' },
    ],
  },
  {
    name: '7.2. Запуск производства',
    durationText: '5 рабочих дней',
    durationDays: 5,
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 6,
    subStages: [
      { name: 'Инвойс партия', description: 'Оля + пр.', recipientKey: 'responsible' },
      { name: 'Оплата 50%', description: 'Оля + бух.', recipientKey: 'accountant' },
      { name: 'Отдать макет в работу', description: '1 день', recipientKey: 'responsible' },
      { name: 'Запустить варку', description: '1 день', recipientKey: 'responsible' },
    ],
  },
  {
    name: '7.3. Производство',
    durationText: '35 календарных дней',
    durationDays: 35,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
  },
  {
    name: '7.4. Инспекция',
    durationText: 'Старт через 15 дней после запуска 7.3.',
    durationDays: null,
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 12,
    startDelayDays: 15,
    subStages: [
      { name: 'Чек-лист подготовка + согласовать', description: '2 рабочих дня. Катя + пр.', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Счет инспекция запрос + оплата', description: '5 рабочих дней', recipientKey: 'responsible' },
      { name: 'Согласовать дату', recipientKey: 'responsible' },
    ],
  },
  {
    name: '7.5. Подготовка для продаж',
    durationText: 'Старт через 15 дней после запуска 7.3.',
    durationDays: null,
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: 12,
    startDelayDays: 15,
    stageNotifications: [
      {
        eventType: 'stage_started',
        recipientKey: 'novinki',
        messageTemplate: 'custom',
        customMessage:
          'Прошу взять в работу продукт\n\nПродукт: {product_name}\nЭтап: {stage_name}\nСрок: {end_date}',
      },
    ],
    subStages: [
      { name: 'Внести продукты в каталог для продаж', description: '1 рабочий день', recipientKey: 'responsible' },
      { name: 'Сделать руками макет', description: '3 рабочих дня. Пр + Белла.', recipientKey: 'responsible' },
      { name: 'Оповестить продажников о новинках', description: '1 день', recipientKey: 'responsible' },
    ],
  },
  {
    name: '7.6. Подготовка к доставке',
    durationText: '7 рабочих дней',
    durationDays: 7,
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: 12,
    subStages: [
      { name: 'Оля + ответственный', recipientKey: 'responsible' },
    ],
  },
  {
    name: '8. Доставка',
    durationText: '1 календарный месяц',
    durationDays: 30,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Отдать в печать', description: '1 день', recipientKey: 'responsible' },
    ],
  },
  {
    name: '9. Продукция на складе',
    durationText: '4 рабочих дня',
    durationDays: 4,
    startTrigger: 'PREVIOUS_STAGE_COMPLETED',
    subStages: [
      { name: 'Инспекция', description: '1 день', responsibleName: 'Катя', recipientKey: 'katya' },
      { name: 'Доп. упаковка', description: '3 дня', recipientKey: 'warehouse' },
      { name: 'Оповещение продаж', recipientKey: 'responsible' },
      { name: 'Анонс в общий чат', description: 'Катя + чат новинки', responsibleName: 'Катя', recipientKey: 'katya' },
    ],
  },
]

function templateDescription() {
  return [
    'Основной reusable-шаблон РФ.',
    'Логика запусков: 4.2 стартует вместе с 4.1; 6.1, 6.2 и 6.3 стартуют после закрытия подготовки; 6.4 стартует через 23 дня после начала производства, то есть за неделю до конца 30-дневного производства.',
    'Личные получатели заведены с Telegram ID. Групповые получатели без chat_id сохранены выключенными до заполнения реального chat_id.',
  ].join('\n')
}

function chinaDescription() {
  return [
    'Китайский основной шаблон запуска продукта по актуальному ТЗ.',
    'Основная цепочка включает карго-образцы, документацию 064, декларации, производство, инспекцию, подготовку для продаж и склад.',
    'Параллельные ветки запускаются через startTrigger/startReferenceStageOrder/startDelayDays. Групповые чаты без chat_id сохранены выключенными до заполнения реального chat_id.',
  ].join('\n')
}

function hasChatTarget(recipient) {
  if (!recipient) return false
  if (recipient.type === 'responsible') return true
  return Boolean(recipient.telegramId || recipient.chatId)
}

function getRecipientType(recipient) {
  if (!recipient) return 'user'
  return recipient.type === 'responsible' ? 'responsible' : recipient.type
}

function getRecipientId(recipient) {
  return recipient?.type === 'responsible' ? null : recipient?.id ?? null
}

async function findUserByName(tx, name) {
  const aliases = USER_NAME_ALIASES[name] || [name]
  return tx.user.findFirst({
    where: {
      OR: [
        ...aliases.map((alias) => ({ name: { equals: alias, mode: 'insensitive' } })),
        ...aliases.map((alias) => ({ lastName: { equals: alias, mode: 'insensitive' } })),
        ...aliases.map((alias) => ({ email: { contains: alias, mode: 'insensitive' } })),
      ],
    },
    select: { id: true, name: true, lastName: true, telegramId: true, telegramChatId: true },
  })
}

async function findUserIdByName(tx, name) {
  const user = await findUserByName(tx, name)
  return user?.id ?? null
}

async function ensureRecipient(tx, seed) {
  if (seed.type === 'responsible') {
    return {
      id: null,
      type: 'responsible',
      name: seed.name,
      telegramId: null,
      chatId: null,
      userId: null,
    }
  }

  const user = seed.type === 'user' ? await findUserByName(tx, seed.name) : null
  if (user && seed.telegramId) {
    await tx.user.update({
      where: { id: user.id },
      data: {
        telegramId: seed.telegramId,
        telegramChatId: seed.telegramId,
        telegramConnectionStatus: 'CONNECTED',
        telegramConnectedAt: new Date(),
      },
      select: { id: true },
    })
  }

  const existing = await tx.telegramRecipient.findFirst({
    where: {
      OR: [
        { type: seed.type, name: { equals: seed.name, mode: 'insensitive' } },
        ...(seed.telegramId ? [{ type: seed.type, telegramId: seed.telegramId }] : []),
      ],
    },
    select: { id: true, telegramId: true, chatId: true, userId: true },
  })

  if (existing) {
    return tx.telegramRecipient.update({
      where: { id: existing.id },
      data: {
        name: seed.name,
        type: seed.type,
        telegramId: seed.telegramId ?? existing.telegramId ?? null,
        chatId: seed.chatId ?? existing.chatId ?? null,
        userId: user?.id ?? existing.userId ?? null,
      },
    })
  }

  return tx.telegramRecipient.create({
    data: {
      type: seed.type,
      name: seed.name,
      telegramId: seed.telegramId ?? null,
      chatId: seed.chatId ?? null,
      userId: user?.id ?? null,
    },
  })
}

async function getOrCreateStageTemplate(tx, stage, fallbackOrder) {
  const existing = await tx.stageTemplate.findFirst({
    where: { name: { equals: stage.name, mode: 'insensitive' } },
  })

  if (existing) {
    return tx.stageTemplate.update({
      where: { id: existing.id },
      data: {
        durationText: stage.durationText ?? existing.durationText,
        durationDays: stage.durationDays ?? existing.durationDays,
        isCritical: stage.isCritical ?? existing.isCritical,
        affectsFinalDate: stage.affectsFinalDate ?? existing.affectsFinalDate,
        participatesInAutoshift: true,
      },
    })
  }

  const maxOrder = await tx.stageTemplate.aggregate({ _max: { order: true } })
  return tx.stageTemplate.create({
    data: {
      name: stage.name,
      order: typeof fallbackOrder === 'number' ? Math.max((maxOrder._max.order ?? -1) + 1, fallbackOrder) : (maxOrder._max.order ?? -1) + 1,
      durationText: stage.durationText ?? null,
      durationDays: stage.durationDays ?? null,
      isCritical: stage.isCritical ?? false,
      affectsFinalDate: stage.affectsFinalDate ?? true,
      participatesInAutoshift: true,
    },
  })
}

async function ensureRecipientMap(tx) {
  const entries = await Promise.all(
    Object.entries(RECIPIENT_SEEDS).map(async ([key, seed]) => [key, await ensureRecipient(tx, seed)])
  )
  return new Map(entries)
}

async function upsertRfTemplate(tx, recipientByKey) {
  const existingTemplate = await tx.productTemplate.findFirst({
    where: { name: RF_TEMPLATE_NAME },
    select: { id: true },
  })

  const template = existingTemplate
    ? await tx.productTemplate.update({
        where: { id: existingTemplate.id },
        data: { description: templateDescription() },
      })
    : await tx.productTemplate.create({
        data: {
          name: RF_TEMPLATE_NAME,
          description: templateDescription(),
        },
      })

  await tx.telegramTemplateNotificationSetting.deleteMany({
    where: { productTemplateId: template.id },
  })
  await tx.productTemplateStage.deleteMany({
    where: { productTemplateId: template.id },
  })

  const userIdByName = new Map()
  for (const name of ['Катя', 'Аделя', 'Белла', 'Иван']) {
    userIdByName.set(name, await findUserIdByName(tx, name))
  }

  let templateNotificationCount = 0
  let subStageCount = 0
  let enabledSubStageNotificationCount = 0

  for (const [stageOrder, stage] of RF_STAGES.entries()) {
    const stageTemplate = await getOrCreateStageTemplate(tx, stage)
    const createdStage = await tx.productTemplateStage.create({
      data: {
        productTemplateId: template.id,
        stageTemplateId: stageTemplate.id,
        stageOrder,
        stageName: stage.name,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: true,
        startTrigger: stage.startTrigger,
        startDelayDays: stage.startDelayDays ?? 0,
        startReferenceStageOrder: stage.startReferenceStageOrder ?? null,
      },
    })

    for (const notification of stage.stageNotifications ?? []) {
      const recipient = recipientByKey.get(notification.recipientKey)
      if (!recipient) continue

      await tx.telegramTemplateNotificationSetting.create({
        data: {
          productTemplateId: template.id,
          productTemplateStageId: createdStage.id,
          eventType: notification.eventType,
          recipientType: getRecipientType(recipient),
          recipientId: getRecipientId(recipient),
          messageTemplate:
            notification.messageTemplate ??
            (notification.eventType === 'stage_started' ? 'stage_started_simple' : 'stage_completed_simple'),
          customMessage: notification.customMessage ?? null,
          isEnabled: hasChatTarget(recipient),
        },
      })
      templateNotificationCount += 1
    }

    for (const [subStageIndex, subStage] of (stage.subStages ?? []).entries()) {
      const recipient = subStage.recipientKey ? recipientByKey.get(subStage.recipientKey) : null
      const notifyOnComplete = Boolean(recipient && hasChatTarget(recipient))
      const responsibleId = subStage.responsibleName ? userIdByName.get(subStage.responsibleName) ?? null : null

      await tx.productTemplateSubStage.create({
        data: {
          productTemplateId: template.id,
          productTemplateStageId: createdStage.id,
          name: subStage.name,
          description: subStage.description ?? null,
          responsibleId,
          notifyOnStart: false,
          notifyOnComplete,
          telegramRecipientType: getRecipientType(recipient),
          telegramRecipientId: getRecipientId(recipient),
          telegramMessageTemplate: subStage.messageTemplate ?? 'substage_completed_simple',
          telegramCustomMessage: subStage.customMessage ?? null,
          sortOrder: subStageIndex,
        },
      })
      subStageCount += 1
      if (notifyOnComplete) enabledSubStageNotificationCount += 1
    }
  }

  return {
    id: template.id,
    stageCount: RF_STAGES.length,
    subStageCount,
    templateNotificationCount,
    enabledSubStageNotificationCount,
  }
}

async function upsertChinaTemplate(tx, recipientByKey) {
  let template = await tx.productTemplate.findFirst({
    where: { name: CHINA_TEMPLATE_NAME },
    select: { id: true },
  })

  if (!template) {
    const standardTemplate = await tx.productTemplate.findFirst({
      where: { name: 'Полный стандартный запуск' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    })

    template = standardTemplate
      ? await tx.productTemplate.update({
          where: { id: standardTemplate.id },
          data: {
            name: CHINA_TEMPLATE_NAME,
            description: chinaDescription(),
          },
          select: { id: true },
        })
      : await tx.productTemplate.create({
          data: {
            name: CHINA_TEMPLATE_NAME,
            description: chinaDescription(),
          },
          select: { id: true },
        })
  } else {
    await tx.productTemplate.update({
      where: { id: template.id },
      data: { description: chinaDescription() },
    })
  }

  await tx.telegramTemplateNotificationSetting.deleteMany({
    where: { productTemplateId: template.id },
  })
  await tx.productTemplateStage.deleteMany({
    where: { productTemplateId: template.id },
  })

  const userIdByName = new Map()
  for (const name of ['Катя', 'Аделя', 'Белла', 'Иван', 'Кирилл', 'Оля']) {
    userIdByName.set(name, await findUserIdByName(tx, name))
  }

  let templateNotificationCount = 0
  let subStageCount = 0
  let enabledSubStageNotificationCount = 0

  for (const [stageOrder, stage] of CHINA_STAGE_SEEDS.entries()) {
    const stageTemplate = await getOrCreateStageTemplate(tx, {
      ...stage,
      participatesInAutoshift: true,
    })

    const createdStage = await tx.productTemplateStage.create({
      data: {
        productTemplateId: template.id,
        stageTemplateId: stageTemplate.id,
        stageOrder,
        stageName: stage.name,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: true,
        startTrigger: stage.startTrigger ?? (stageOrder === 0 ? 'PRODUCT_CREATED' : 'PREVIOUS_STAGE_COMPLETED'),
        startDelayDays: stage.startDelayDays ?? 0,
        startReferenceStageOrder: stage.startReferenceStageOrder ?? null,
      },
    })

    for (const notification of stage.stageNotifications ?? []) {
      const recipient = recipientByKey.get(notification.recipientKey)
      if (!recipient) continue

      await tx.telegramTemplateNotificationSetting.create({
        data: {
          productTemplateId: template.id,
          productTemplateStageId: createdStage.id,
          eventType: notification.eventType,
          recipientType: getRecipientType(recipient),
          recipientId: getRecipientId(recipient),
          messageTemplate:
            notification.messageTemplate ??
            (notification.eventType === 'stage_started' ? 'stage_started_simple' : 'stage_completed_simple'),
          customMessage: notification.customMessage ?? null,
          isEnabled: hasChatTarget(recipient),
        },
      })
      templateNotificationCount += 1
    }

    for (const [subStageIndex, subStage] of (stage.subStages ?? []).entries()) {
      const recipient = subStage.recipientKey ? recipientByKey.get(subStage.recipientKey) : null
      const notifyOnComplete = Boolean(recipient && hasChatTarget(recipient))
      const responsibleId = subStage.responsibleName ? userIdByName.get(subStage.responsibleName) ?? null : null

      await tx.productTemplateSubStage.create({
        data: {
          productTemplateId: template.id,
          productTemplateStageId: createdStage.id,
          name: subStage.name,
          description: subStage.description ?? null,
          responsibleId,
          notifyOnStart: false,
          notifyOnComplete,
          telegramRecipientType: getRecipientType(recipient),
          telegramRecipientId: getRecipientId(recipient),
          telegramMessageTemplate: subStage.messageTemplate ?? 'substage_completed_simple',
          telegramCustomMessage: subStage.customMessage ?? null,
          sortOrder: subStageIndex,
        },
      })
      subStageCount += 1
      if (notifyOnComplete) enabledSubStageNotificationCount += 1
    }
  }

  return {
    id: template.id,
    stageCount: CHINA_STAGE_SEEDS.length,
    subStageCount,
    templateNotificationCount,
    enabledSubStageNotificationCount,
  }
}

async function upsertTemplates() {
  return prisma.$transaction(
    async (tx) => {
      const recipientByKey = await ensureRecipientMap(tx)
      const rf = await upsertRfTemplate(tx, recipientByKey)
      const china = await upsertChinaTemplate(tx, recipientByKey)
      const recipientsWithTargets = Array.from(recipientByKey.values()).filter(hasChatTarget).length
      const recipientsTotal = recipientByKey.size

      return {
        rf,
        china,
        recipientsTotal,
        recipientsWithTargets,
      }
    },
    { maxWait: 15000, timeout: 120000 }
  )
}

upsertTemplates()
  .then((result) => {
    console.log(`RF template: ${result.rf.id}`)
    console.log(`RF stages: ${result.rf.stageCount}`)
    console.log(`RF substages: ${result.rf.subStageCount}`)
    console.log(`RF stage notification rules: ${result.rf.templateNotificationCount}`)
    console.log(`RF enabled substage notifications: ${result.rf.enabledSubStageNotificationCount}`)
    console.log(`China template: ${result.china.id}`)
    console.log(`China stages: ${result.china.stageCount}`)
    console.log(`China substages: ${result.china.subStageCount}`)
    console.log(`China stage notification rules: ${result.china.templateNotificationCount}`)
    console.log(`China enabled substage notifications: ${result.china.enabledSubStageNotificationCount}`)
    console.log(`Telegram recipients: ${result.recipientsWithTargets}/${result.recipientsTotal} with chat target`)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
