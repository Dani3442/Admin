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
  accountant: { type: 'user', name: 'Бух' },
  warehouse: { type: 'chat', name: 'Склад', chatId: envValue('TELEGRAM_WAREHOUSE_CHAT_ID') },
  novinki: { type: 'chat', name: 'новинки', chatId: envValue('TELEGRAM_NOVINKI_CHAT_ID') },
  commonChat: { type: 'chat', name: 'Общий чат', chatId: envValue('TELEGRAM_COMMON_CHAT_ID') },
  responsibleKatya: { type: 'chat', name: 'Ответственный + Катя' },
  responsibleAccountant: { type: 'chat', name: 'Ответственный + Бух' },
  ivanResponsible: { type: 'chat', name: 'Иван + Ответственный' },
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
  { name: 'формирование ТЗ', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'согласование + правки ТЗ', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'таргет', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'расслыка запроса', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'сбор + анализ предложений', durationText: '1 неделя', durationDays: 7, isCritical: false, affectsFinalDate: false },
  { name: 'согласовать тару', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'рассчитать стоимость логистики пердварительно', durationText: null, durationDays: null, isCritical: false, affectsFinalDate: false },
  { name: 'согласовать экономику', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'вся информация для макета - собрать', durationText: '2 дня', durationDays: 2, isCritical: false, affectsFinalDate: false },
  { name: 'написать тз на макет', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'подписать контракт + инвойс', durationText: '3 дня', durationDays: 3, isCritical: false, affectsFinalDate: false },
  { name: 'оплата инвойса', durationText: '3 дня', durationDays: 3, isCritical: false, affectsFinalDate: false },
  { name: 'изготовление макета + согласование', durationText: '5 дней', durationDays: 5, isCritical: false, affectsFinalDate: false },
  { name: 'согласование визуала', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'отправить макет, запустить изготовление образцов', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'изготовление образцов', durationText: '30 дней', durationDays: 30, isCritical: false, affectsFinalDate: false },
  { name: 'доставка образцов карго', durationText: '7 дней', durationDays: 7, isCritical: false, affectsFinalDate: false },
  { name: 'фокус группа да/нет', durationText: null, durationDays: null, isCritical: false, affectsFinalDate: false },
  { name: 'тестирование образцов', durationText: null, durationDays: null, isCritical: false, affectsFinalDate: false },
  { name: 'завести киз, шк, артикул', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'подготовка к белому ввозу на декларирование', durationText: '7 дней', durationDays: 7, isCritical: false, affectsFinalDate: false },
  { name: 'правки по макету на белый ввоз', durationText: '3 дня', durationDays: 3, isCritical: false, affectsFinalDate: false },
  { name: 'отправить новый макет, запустить работу', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'отправить макет на белом фоне в отдел продаж', durationText: '1 день', durationDays: 1, isCritical: false, affectsFinalDate: false },
  { name: 'ввоз белых образцов + декларирование', durationText: '?', durationDays: null, isCritical: false, affectsFinalDate: false },
  { name: 'инвойс партия', durationText: null, durationDays: null, isCritical: true, affectsFinalDate: false },
  { name: 'оплата партия', durationText: null, durationDays: null, isCritical: true, affectsFinalDate: false },
  { name: 'запуск варки + варка', durationText: null, durationDays: null, isCritical: true, affectsFinalDate: true },
  { name: 'инспекция перед отправкой', durationText: null, durationDays: null, isCritical: true, affectsFinalDate: true },
  { name: 'доставка', durationText: null, durationDays: null, isCritical: true, affectsFinalDate: true },
]

function templateDescription() {
  return [
    'Основной reusable-шаблон РФ.',
    'Логика запусков: 4.2 стартует вместе с 4.1; 6.1, 6.2 и 6.3 стартуют после закрытия подготовки; 6.4 стартует через 23 дня после начала производства, то есть за неделю до конца 30-дневного производства.',
    'Личные получатели заведены с Telegram ID. Групповые получатели без chat_id сохранены выключенными до заполнения реального chat_id.',
  ].join('\n')
}

function chinaDescription() {
  return 'Китайский основной шаблон запуска продукта: 30 этапов старой основной цепочки без предзаполненных дат.'
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
  return tx.user.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: 'insensitive' } },
        { lastName: { equals: name, mode: 'insensitive' } },
        { email: { contains: name, mode: 'insensitive' } },
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

async function upsertChinaTemplate(tx) {
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

  for (const [stageOrder, stage] of CHINA_STAGE_SEEDS.entries()) {
    const stageTemplate = await getOrCreateStageTemplate(tx, {
      ...stage,
      participatesInAutoshift: true,
    })

    await tx.productTemplateStage.create({
      data: {
        productTemplateId: template.id,
        stageTemplateId: stageTemplate.id,
        stageOrder,
        stageName: stage.name,
        durationDays: stage.durationDays ?? null,
        participatesInAutoshift: true,
        startTrigger: stageOrder === 0 ? 'PRODUCT_CREATED' : 'PREVIOUS_STAGE_COMPLETED',
        startDelayDays: 0,
        startReferenceStageOrder: null,
      },
    })
  }

  return {
    id: template.id,
    stageCount: CHINA_STAGE_SEEDS.length,
  }
}

async function upsertTemplates() {
  return prisma.$transaction(async (tx) => {
    const recipientByKey = await ensureRecipientMap(tx)
    const rf = await upsertRfTemplate(tx, recipientByKey)
    const china = await upsertChinaTemplate(tx)
    const recipientsWithTargets = Array.from(recipientByKey.values()).filter(hasChatTarget).length
    const recipientsTotal = recipientByKey.size

    return {
      rf,
      china,
      recipientsTotal,
      recipientsWithTargets,
    }
  })
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
    console.log(`Telegram recipients: ${result.recipientsWithTargets}/${result.recipientsTotal} with chat target`)
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
