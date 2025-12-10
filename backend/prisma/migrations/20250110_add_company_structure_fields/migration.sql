-- Add company structure fields to admin_entities
ALTER TABLE "admin_entities" ADD COLUMN "company_type" TEXT;
ALTER TABLE "admin_entities" ADD COLUMN "legal_structure" TEXT;
ALTER TABLE "admin_entities" ADD COLUMN "tax_status" TEXT;
ALTER TABLE "admin_entities" ADD COLUMN "linked_project_id" UUID;

-- Add unique constraint for linked_project_id
ALTER TABLE "admin_entities" ADD CONSTRAINT "admin_entities_linked_project_id_key" UNIQUE ("linked_project_id");

-- Add foreign key to projects table
ALTER TABLE "admin_entities" ADD CONSTRAINT "admin_entities_linked_project_id_fkey" FOREIGN KEY ("linked_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

