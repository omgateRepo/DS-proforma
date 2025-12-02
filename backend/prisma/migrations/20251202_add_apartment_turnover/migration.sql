-- Add turnover fields for apartment-wide assumptions
ALTER TABLE "projects"
ADD COLUMN "turnover_pct" DECIMAL,
ADD COLUMN "turnover_cost_usd" DECIMAL;

