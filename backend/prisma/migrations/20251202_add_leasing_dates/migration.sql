-- Add start/leasing and stabilized dates to projects
ALTER TABLE "projects"
ADD COLUMN "start_leasing_date" DATE,
ADD COLUMN "stabilized_date" DATE;

