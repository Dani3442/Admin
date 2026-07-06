-- Explicit stage auto-start rules copied from product templates to products.

ALTER TABLE "product_template_stages"
    ADD COLUMN "startTrigger" TEXT NOT NULL DEFAULT 'PRODUCT_CREATED',
    ADD COLUMN "startDelayDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "startReferenceStageOrder" INTEGER;

ALTER TABLE "product_stages"
    ADD COLUMN "autoStartAt" TIMESTAMP(3),
    ADD COLUMN "startTrigger" TEXT NOT NULL DEFAULT 'PRODUCT_CREATED',
    ADD COLUMN "startDelayDays" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "startReferenceStageOrder" INTEGER;

UPDATE "product_template_stages"
SET "startTrigger" = 'PREVIOUS_STAGE_COMPLETED'
WHERE "stageOrder" > 0
  AND "startTrigger" = 'PRODUCT_CREATED'
  AND "startDelayDays" = 0
  AND "startReferenceStageOrder" IS NULL;

UPDATE "product_stages"
SET "startTrigger" = 'PREVIOUS_STAGE_COMPLETED'
WHERE "stageOrder" > 0
  AND "startTrigger" = 'PRODUCT_CREATED'
  AND "startDelayDays" = 0
  AND "startReferenceStageOrder" IS NULL;

CREATE INDEX "product_stages_productId_autoStartAt_idx"
    ON "product_stages"("productId", "autoStartAt");
