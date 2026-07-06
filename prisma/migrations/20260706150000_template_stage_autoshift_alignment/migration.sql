ALTER TABLE "product_template_stages"
  ADD COLUMN IF NOT EXISTS "participatesInAutoshift" BOOLEAN NOT NULL DEFAULT true;
