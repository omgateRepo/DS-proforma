-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "apartment_types" (
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

    CONSTRAINT "apartment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashflow_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "month_index" INTEGER NOT NULL,
    "budget_inflows" DECIMAL,
    "budget_outflows" DECIMAL,
    "actual_inflows" DECIMAL,
    "actual_outflows" DECIMAL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashflow_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "cost_name" TEXT NOT NULL,
    "amount_usd" DECIMAL,
    "payment_month" INTEGER,
    "start_month" INTEGER,
    "end_month" INTEGER,
    "carrying_type" TEXT,
    "principal_amount_usd" DECIMAL,
    "interest_rate_pct" DECIMAL,
    "term_years" DECIMAL,
    "interval" TEXT,
    "start_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost_group" TEXT,
    "payment_mode" TEXT NOT NULL DEFAULT 'single',
    "month_list" JSONB,
    "month_percentages" JSONB,
    "measurement_unit" TEXT,
    "price_per_unit" DECIMAL,
    "units_count" DECIMAL,
    "loan_mode" TEXT,
    "loan_amount_usd" DECIMAL,
    "loan_term_months" INTEGER,
    "funding_month" INTEGER,
    "repayment_start_month" INTEGER,
    "interval_unit" TEXT,

    CONSTRAINT "cost_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gp_contributions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "partner" TEXT NOT NULL,
    "amount_usd" DECIMAL NOT NULL,
    "contribution_month" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gp_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "type_label" TEXT NOT NULL,
    "space_count" INTEGER NOT NULL DEFAULT 0,
    "monthly_rent_usd" DECIMAL,
    "vacancy_pct" DECIMAL NOT NULL DEFAULT 5,
    "start_month" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_stage_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "property_type" TEXT,
    "purchase_price_usd" DECIMAL,
    "closing_date" DATE,
    "target_units" INTEGER,
    "target_sqft" INTEGER,
    "description" TEXT,
    "deleted_at" TIMESTAMPTZ(6),
    "latitude" DECIMAL,
    "longitude" DECIMAL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "apartment_types" ADD CONSTRAINT "apartment_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cashflow_entries" ADD CONSTRAINT "cashflow_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "gp_contributions" ADD CONSTRAINT "gp_contributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "parking_types" ADD CONSTRAINT "parking_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_stage_history" ADD CONSTRAINT "project_stage_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

