-- Update cost_group to preserve phase info before dropping the column
UPDATE "cost_items"
SET "cost_group" = CASE
  WHEN "carrying_type" = 'property_tax' AND "tax_phase" = 'stabilized' THEN 'property_tax_stabilized'
  WHEN "carrying_type" = 'property_tax' AND "tax_phase" = 'construction' THEN 'property_tax_construction'
  ELSE COALESCE("cost_group", CASE WHEN "carrying_type" = 'property_tax' THEN 'property_tax_construction' ELSE NULL END)
END;

-- Drop the tax_phase column (no longer needed)
ALTER TABLE "cost_items"
DROP COLUMN IF EXISTS "tax_phase";

