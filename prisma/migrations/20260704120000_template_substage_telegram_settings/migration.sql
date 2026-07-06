ALTER TABLE "product_template_substages"
  ADD COLUMN "telegramRecipientType" TEXT,
  ADD COLUMN "telegramRecipientId" TEXT,
  ADD COLUMN "telegramMessageTemplate" TEXT,
  ADD COLUMN "telegramCustomMessage" TEXT;

CREATE INDEX "product_template_substages_telegramRecipientId_idx"
  ON "product_template_substages"("telegramRecipientId");
