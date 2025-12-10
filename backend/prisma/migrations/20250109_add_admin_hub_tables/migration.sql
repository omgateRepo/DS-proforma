-- Create Admin Hub tables

-- Admin Entities (legal entities like LLCs, Corps, etc.)
CREATE TABLE "admin_entities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "ein" TEXT,
    "state_of_formation" TEXT,
    "formation_date" DATE,
    "registered_agent" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "company_type" TEXT,
    "legal_structure" TEXT,
    "tax_status" TEXT,
    "linked_project_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "admin_entities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_entities_linked_project_id_key" UNIQUE ("linked_project_id")
);

-- Admin Entity Ownership (parent-child relationships between entities)
CREATE TABLE "admin_entity_ownership" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "parent_entity_id" UUID NOT NULL,
    "child_entity_id" UUID NOT NULL,
    "ownership_percentage" DECIMAL NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_entity_ownership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_entity_ownership_parent_child_key" UNIQUE ("parent_entity_id", "child_entity_id")
);

-- Admin Tax Items (gifts, contributions, returns, etc.)
CREATE TABLE "admin_tax_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "tax_year" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "entity_id" UUID,
    "description" TEXT NOT NULL,
    "amount_usd" DECIMAL,
    "recipient_or_source" TEXT,
    "item_date" DATE,
    "due_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_tax_items_pkey" PRIMARY KEY ("id")
);

-- Admin Team Members (external professionals)
CREATE TABLE "admin_team_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "specialty" TEXT,
    "hourly_rate" DECIMAL,
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_team_members_pkey" PRIMARY KEY ("id")
);

-- Admin Engagements (engagement letters with team members)
CREATE TABLE "admin_engagements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "team_member_id" UUID NOT NULL,
    "entity_id" UUID,
    "title" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "scope" TEXT,
    "fee_structure" TEXT,
    "document_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_engagements_pkey" PRIMARY KEY ("id")
);

-- Admin Entity Documents (documents linked to entities)
CREATE TABLE "admin_entity_documents" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entity_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "year" INTEGER,
    "notes" TEXT,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_entity_documents_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
ALTER TABLE "admin_entities" ADD CONSTRAINT "admin_entities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_entities" ADD CONSTRAINT "admin_entities_linked_project_id_fkey" FOREIGN KEY ("linked_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "admin_entity_ownership" ADD CONSTRAINT "admin_entity_ownership_parent_entity_id_fkey" FOREIGN KEY ("parent_entity_id") REFERENCES "admin_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_entity_ownership" ADD CONSTRAINT "admin_entity_ownership_child_entity_id_fkey" FOREIGN KEY ("child_entity_id") REFERENCES "admin_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_tax_items" ADD CONSTRAINT "admin_tax_items_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "admin_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_tax_items" ADD CONSTRAINT "admin_tax_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_team_members" ADD CONSTRAINT "admin_team_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_engagements" ADD CONSTRAINT "admin_engagements_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "admin_team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_engagements" ADD CONSTRAINT "admin_engagements_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "admin_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin_engagements" ADD CONSTRAINT "admin_engagements_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_entity_documents" ADD CONSTRAINT "admin_entity_documents_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "admin_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_entity_documents" ADD CONSTRAINT "admin_entity_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "admin_entities_owner_id_idx" ON "admin_entities"("owner_id");
CREATE INDEX "admin_tax_items_owner_id_tax_year_idx" ON "admin_tax_items"("owner_id", "tax_year");
CREATE INDEX "admin_team_members_owner_id_idx" ON "admin_team_members"("owner_id");
CREATE INDEX "admin_engagements_team_member_id_idx" ON "admin_engagements"("team_member_id");
CREATE INDEX "admin_entity_documents_entity_id_idx" ON "admin_entity_documents"("entity_id");

