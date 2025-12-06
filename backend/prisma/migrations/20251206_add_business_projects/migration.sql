-- CreateTable: business_projects
CREATE TABLE "business_projects" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'exploring',
    "stage_entered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "legal_entity_name" TEXT,
    "legal_entity_type" TEXT,
    "jurisdiction" TEXT,
    "formed_at" DATE,
    "industry" TEXT NOT NULL DEFAULT 'retail_saas',
    "target_market" TEXT,
    "total_invested" DECIMAL,
    "current_mrr" DECIMAL,
    "current_runway" INTEGER,
    "owner_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "business_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_collaborators
CREATE TABLE "business_project_collaborators" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_documents
CREATE TABLE "business_project_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_founders
CREATE TABLE "business_project_founders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "equity_percent" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_founders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_monthly_metrics
CREATE TABLE "business_project_monthly_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "mrr" DECIMAL,
    "arr" DECIMAL,
    "revenue_growth_pct" DECIMAL,
    "total_customers" INTEGER,
    "new_customers" INTEGER,
    "churned_customers" INTEGER,
    "churn_rate_pct" DECIMAL,
    "cac" DECIMAL,
    "ltv" DECIMAL,
    "ltv_cac_ratio" DECIMAL,
    "gross_margin_pct" DECIMAL,
    "cash_balance" DECIMAL,
    "burn_rate" DECIMAL,
    "runway_months" INTEGER,
    "team_size" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_monthly_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_stage_criteria
CREATE TABLE "business_project_stage_criteria" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_stage_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable: business_project_stage_history
CREATE TABLE "business_project_stage_history" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_project_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique constraint on collaborators
CREATE UNIQUE INDEX "business_project_collaborators_project_id_user_id_key" ON "business_project_collaborators"("project_id", "user_id");

-- CreateIndex: unique constraint on monthly metrics (one per project per month)
CREATE UNIQUE INDEX "business_project_monthly_metrics_project_id_month_key" ON "business_project_monthly_metrics"("project_id", "month");

-- CreateIndex: unique constraint on stage criteria
CREATE UNIQUE INDEX "business_project_stage_criteria_project_id_stage_criterion__key" ON "business_project_stage_criteria"("project_id", "stage", "criterion_key");

-- AddForeignKey: business_projects -> users
ALTER TABLE "business_projects" ADD CONSTRAINT "business_projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: business_project_collaborators -> business_projects
ALTER TABLE "business_project_collaborators" ADD CONSTRAINT "business_project_collaborators_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_collaborators -> users
ALTER TABLE "business_project_collaborators" ADD CONSTRAINT "business_project_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_documents -> business_projects
ALTER TABLE "business_project_documents" ADD CONSTRAINT "business_project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_founders -> business_projects
ALTER TABLE "business_project_founders" ADD CONSTRAINT "business_project_founders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_monthly_metrics -> business_projects
ALTER TABLE "business_project_monthly_metrics" ADD CONSTRAINT "business_project_monthly_metrics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_stage_criteria -> business_projects
ALTER TABLE "business_project_stage_criteria" ADD CONSTRAINT "business_project_stage_criteria_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: business_project_stage_history -> business_projects
ALTER TABLE "business_project_stage_history" ADD CONSTRAINT "business_project_stage_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

