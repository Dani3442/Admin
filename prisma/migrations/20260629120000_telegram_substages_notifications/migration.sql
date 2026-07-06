ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "telegram_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_username" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_connection_status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN IF NOT EXISTS "telegram_connected_at" TIMESTAMP(3);

ALTER TABLE "product_stages"
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "product_substages" (
  "id" TEXT NOT NULL,
  "stageId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "order" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "product_substages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "telegram_recipients" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "telegram_id" TEXT,
  "telegram_username" TEXT,
  "chat_id" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "telegram_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "telegram_notification_settings" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "stageId" TEXT,
  "subStageId" TEXT,
  "eventType" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipientId" TEXT,
  "messageTemplate" TEXT,
  "customMessage" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "telegram_notification_settings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_substages_stageId_order_idx" ON "product_substages"("stageId", "order");
CREATE INDEX IF NOT EXISTS "telegram_recipients_type_idx" ON "telegram_recipients"("type");
CREATE INDEX IF NOT EXISTS "telegram_recipients_userId_idx" ON "telegram_recipients"("userId");
CREATE INDEX IF NOT EXISTS "telegram_notification_settings_productId_eventType_idx" ON "telegram_notification_settings"("productId", "eventType");
CREATE INDEX IF NOT EXISTS "telegram_notification_settings_stageId_eventType_idx" ON "telegram_notification_settings"("stageId", "eventType");
CREATE INDEX IF NOT EXISTS "telegram_notification_settings_subStageId_eventType_idx" ON "telegram_notification_settings"("subStageId", "eventType");
CREATE INDEX IF NOT EXISTS "telegram_notification_settings_recipientId_idx" ON "telegram_notification_settings"("recipientId");

ALTER TABLE "product_substages"
  ADD CONSTRAINT "product_substages_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "product_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_recipients"
  ADD CONSTRAINT "telegram_recipients_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_settings"
  ADD CONSTRAINT "telegram_notification_settings_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_settings"
  ADD CONSTRAINT "telegram_notification_settings_stageId_fkey"
  FOREIGN KEY ("stageId") REFERENCES "product_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_settings"
  ADD CONSTRAINT "telegram_notification_settings_subStageId_fkey"
  FOREIGN KEY ("subStageId") REFERENCES "product_substages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_settings"
  ADD CONSTRAINT "telegram_notification_settings_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "telegram_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
