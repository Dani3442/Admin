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

`SUPABASE_SERVICE_ROLE_KEY` храните только на сервере и никогда не передавайте во фронтенд.

---

## Шаг 4: Настроить сборку

В amvera.yml уже настроен Dockerfile.
После пуша Amvera автоматически:
1. Соберёт Docker-образ
2. Запустит `prisma migrate deploy` (миграции БД)
3. Запустит приложение на порту 3000

---

## Шаг 5: Заполнить базу данных

После первого деплоя выполните seed через Amvera Console:

```bash
# В консоли Amvera
npm run db:seed
```

Или локально, указав DATABASE_URL вашего Amvera PostgreSQL:
```bash
DATABASE_URL="postgresql://..." npm run db:seed
```

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
npm run db:seed      # Заполнить БД тестовыми данными
npx prisma generate  # Регенерировать Prisma клиент
```

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

При запуске `npm run db:seed`:
- Создаётся **150 продуктов** из вашего файла «Данил тайминг.xlsx»
- Все **30 этапов** с датами и длительностями
- Пользователи: Лана, Аделя, Катя, Кирилл
- 4 шаблона автоматизаций

---

*Product Admin v1.0 | Next.js 15 + Prisma + PostgreSQL*
