CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email")
);

CREATE TABLE "project_collaborators" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "project_collaborators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_collaborators_project_id_user_id_key" UNIQUE ("project_id", "user_id"),
    CONSTRAINT "project_collaborators_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "project_collaborators_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

ALTER TABLE "projects"
    ADD COLUMN "owner_id" UUID;

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

WITH upsert AS (
    INSERT INTO "users" ("email", "display_name", "password_hash", "is_super_admin")
    VALUES ('ds', 'Super Admin', '$2a$10$u.UE5K8FkDlZhVnDdEpKvu6VfS1pJlPIh34d2D9MAC2wUu99sSLBm', true)
    ON CONFLICT ("email") DO UPDATE
        SET updated_at = NOW()
    RETURNING id
)
UPDATE "projects"
SET "owner_id" = (SELECT id FROM upsert)
WHERE "owner_id" IS NULL;

