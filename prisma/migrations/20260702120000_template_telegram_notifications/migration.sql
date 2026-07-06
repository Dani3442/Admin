-- Template-level Telegram notification settings with product-level overrides.

CREATE TABLE "telegram_template_notification_settings" (
    "id" TEXT NOT NULL,
    "productTemplateId" TEXT NOT NULL,
    "productTemplateStageId" TEXT,
    "eventType" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT,
    "messageTemplate" TEXT,
    "customMessage" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_template_notification_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "telegram_notification_settings"
    ADD COLUMN "templateSettingId" TEXT,
    ADD COLUMN "isOverride" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "telegram_template_notification_settings_productTemplateId_productTemplateStageId_eventType_key"
    ON "telegram_template_notification_settings"("productTemplateId", "productTemplateStageId", "eventType");

CREATE INDEX "telegram_template_notification_settings_productTemplateId_eventType_idx"
    ON "telegram_template_notification_settings"("productTemplateId", "eventType");

CREATE INDEX "telegram_template_notification_settings_productTemplateStageId_eventType_idx"
    ON "telegram_template_notification_settings"("productTemplateStageId", "eventType");

CREATE INDEX "telegram_template_notification_settings_recipientId_idx"
    ON "telegram_template_notification_settings"("recipientId");

CREATE INDEX "telegram_notification_settings_templateSettingId_idx"
    ON "telegram_notification_settings"("templateSettingId");

ALTER TABLE "telegram_template_notification_settings"
    ADD CONSTRAINT "telegram_template_notification_settings_productTemplateId_fkey"
    FOREIGN KEY ("productTemplateId") REFERENCES "product_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_template_notification_settings"
    ADD CONSTRAINT "telegram_template_notification_settings_productTemplateStageId_fkey"
    FOREIGN KEY ("productTemplateStageId") REFERENCES "product_template_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_template_notification_settings"
    ADD CONSTRAINT "telegram_template_notification_settings_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "telegram_recipients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "telegram_notification_settings"
    ADD CONSTRAINT "telegram_notification_settings_templateSettingId_fkey"
    FOREIGN KEY ("templateSettingId") REFERENCES "telegram_template_notification_settings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
