-- Template checklists copied into product substages.

ALTER TABLE "product_substages"
    ADD COLUMN "responsibleId" TEXT;

CREATE TABLE "product_template_substages" (
    "id" TEXT NOT NULL,
    "productTemplateStageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "responsibleId" TEXT,
    "notifyOnStart" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnComplete" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_template_substages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_template_substages_productTemplateStageId_order_idx"
    ON "product_template_substages"("productTemplateStageId", "order");

ALTER TABLE "product_template_substages"
    ADD CONSTRAINT "product_template_substages_productTemplateStageId_fkey"
    FOREIGN KEY ("productTemplateStageId") REFERENCES "product_template_stages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
