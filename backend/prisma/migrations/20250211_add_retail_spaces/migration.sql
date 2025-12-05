-- CreateTable
CREATE TABLE "retail_spaces" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "type_label" TEXT NOT NULL,
    "unit_sqft" INTEGER,
    "unit_count" INTEGER NOT NULL DEFAULT 0,
    "rent_budget" DECIMAL,
    "rent_actual" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vacancy_pct" DECIMAL NOT NULL DEFAULT 5,
    "start_month" INTEGER,

    CONSTRAINT "retail_spaces_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "retail_spaces" ADD CONSTRAINT "retail_spaces_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
