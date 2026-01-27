-- Add planning_mode column to life_insurance_policies
ALTER TABLE "life_insurance_policies" ADD COLUMN IF NOT EXISTS "planning_mode" TEXT NOT NULL DEFAULT 'manual';
