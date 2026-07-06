ALTER TABLE "product_template_substages"
  ADD COLUMN IF NOT EXISTS "productTemplateId" TEXT;

CREATE INDEX IF NOT EXISTS "product_template_substages_productTemplateId_idx"
  ON "product_template_substages"("productTemplateId");

DO $$
BEGIN
  ALTER TABLE "product_template_substages"
    ADD CONSTRAINT "product_template_substages_productTemplateId_fkey"
    FOREIGN KEY ("productTemplateId") REFERENCES "product_templates"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
