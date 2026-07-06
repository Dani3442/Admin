# 🚀 Развёртывание Product Admin на Amvera

## Архитектура на Amvera

```
Amvera Platform
├── Приложение (Next.js)     → product-admin (Node.js контейнер)
└── База данных (PostgreSQL)  → Managed PostgreSQL на Amvera
```

---

## Шаг 1: Создать PostgreSQL на Amvera

1. Войдите на https://amvera.ru
2. **Создать проект** → тип **"База данных"** → **PostgreSQL**
3. Укажите название: `product-admin-db`
4. Скопируйте строку подключения (Connection String):
   ```
   postgresql://user:password@host:5432/dbname
   ```

---

## Шаг 2: Создать приложение на Amvera

1. **Создать проект** → тип **"Приложение"** → выбрать **"Из Git-репозитория"**
2. Загрузите код одним из способов:

### Способ A: через Git (рекомендуется)
```bash
cd product-admin
git init
git add .
git commit -m "Initial commit"
# Следуйте инструкциям Amvera по добавлению remote
git remote add amvera https://git.amvera.ru/username/project-name
git push amvera main
```

### Способ B: через ZIP-архив
- Загрузите папку `product-admin` как ZIP через интерфейс Amvera

---

## Шаг 3: Настроить переменные окружения

В настройках приложения на Amvera добавьте переменные:

| Переменная | Значение | Описание |
|-----------|---------|----------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db` | Строка из шага 1 |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` | URL проекта Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key из Supabase | Публичный ключ для browser SSR-клиента |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key из Supabase | Серверный ключ для создания и миграции пользователей |
| `ADMIN_EMAIL` | `admin@company.com` | Email администратора |
| `ADMIN_PASSWORD` | `Admin1234!` | Пароль (измените!) |
| `ADMIN_NAME` | `Данила` | Имя администратора |
| `TELEGRAM_BOT_TOKEN` | токен Telegram-бота | Нужен для отправки уведомлений из прода |

`SUPABASE_SERVICE_ROLE_KEY` храните только на сервере и никогда не передавайте во фронтенд.

---

## Шаг 4: Настроить сборку

В amvera.yml уже настроен Dockerfile.
После пуша Amvera автоматически:
1. Соберёт Docker-образ
2. Проверит baseline для схемы, если раньше изменения были внесены через `db push`
3. Применит Prisma migrations через `npx prisma migrate deploy`
4. Запустит приложение на порту 3000

Контейнер больше не запускает `prisma db push --accept-data-loss` и не запускает seed на продовой базе.

---

## Шаг 5: Безопасные prod-команды

На проде нельзя запускать `npm run db:seed`: этот seed предназначен для локальной демо-базы и создаёт тестовые данные.

После успешной сборки и запуска контейнера выполните команды через Amvera Console именно в таком порядке:

```bash
npm run db:prod:backup
npm run db:prod:access-overrides # опционально, если нужен текущий служебный override роли
npm run db:prod:templates
npm run db:prod:rebuild-products:dry
```

Если dry-run показывает ожидаемые количества продуктов РФ/Китай и целевые количества этапов/подэтапов, примените:

```bash
npm run db:prod:rebuild-products
```

`db:prod:backup` создаёт `pg_dump --format=custom` в `/app/data/backups` и проверяет файл через `pg_restore --list`.
`db:prod:templates` синхронизирует только шаблоны РФ/Китай, Telegram-получателей и правила уведомлений.
`db:prod:rebuild-products` не удаляет строки `products`, комментарии и историю; он заменяет только stage/substage-структуру продукта по актуальному шаблону.

---

## Шаг 6: Проверка

Откройте ваш домен Amvera и войдите:
- Email: `admin@company.com`
- Пароль: `Admin1234!` (или тот, что указали)

---

## Локальный запуск (для разработки)

```bash
# 1. Клонировать / скопировать проект
cd product-admin

# 2. Создать .env
cp .env.example .env
# Отредактировать .env

# 3. Запустить PostgreSQL локально
docker-compose up postgres -d

# 4. Установить зависимости и настроить БД
npm install
npm run setup

# 5. Запустить dev-сервер
npm run dev
# → http://localhost:3000
```

---

## Полезные команды

```bash
npm run dev          # Запустить в режиме разработки
npm run build        # Собрать production-сборку
npm run db:studio    # Открыть Prisma Studio (GUI для БД)
npm run db:seed      # Только локальная демо-база, не прод
npm run db:prod:backup                # Безопасный prod-бэкап через pg_dump
npm run db:prod:templates             # Синхронизация шаблонов РФ/Китай и Telegram
npm run db:prod:rebuild-products:dry  # Отчёт без изменений
npm run db:prod:rebuild-products      # Применение новых шаблонов к продуктам
npx prisma generate  # Регенерировать Prisma клиент
```

## Аварийный сброс пароля

Если пользователь не может войти, а письмо Supabase ведёт на некорректную ссылку, сбросьте пароль напрямую в локальной таблице `users` и Supabase Auth:

```bash
RESET_EMAIL="user@example.com" RESET_PASSWORD="new-secure-password" npm run auth:reset-password
```

Команда не удаляет данные и не трогает продукты. Она обновляет bcrypt-пароль в `users`, активирует пользователя и при наличии `SUPABASE_SERVICE_ROLE_KEY` создаёт/обновляет пользователя Supabase с тем же паролем.
Если Supabase service key невалиден или не задан, локальный пароль всё равно будет обновлён; в логах появится предупреждение по Supabase.

---

## Структура базы данных

```
users             → Сотрудники и роли
stage_templates   → Шаблоны этапов (30 этапов)
products          → Продукты (150+ из Excel)
product_stages    → Этапы каждого продукта с датами
comments          → Комментарии к продуктам/этапам
automations       → Правила автосдвига дат
change_history    → Лог всех изменений
```

---

## Данные из Excel

При локальном запуске `npm run db:seed`:
- Создаётся **150 продуктов** из вашего файла «Данил тайминг.xlsx»
- Все **30 этапов** с датами и длительностями
- Пользователи: Лана, Аделя, Катя, Кирилл
- 4 шаблона автоматизаций

---

*Product Admin v1.0 | Next.js 15 + Prisma + PostgreSQL*
