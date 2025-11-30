-- AlterTable
ALTER TABLE "cost_items"
ADD COLUMN "tax_phase" TEXT;

-- Backfill existing property tax rows to default to construction phase
UPDATE "cost_items"
SET "tax_phase" = 'construction'
WHERE "category" = 'carrying' AND "carrying_type" = 'property_tax' AND "tax_phase" IS NULL;

