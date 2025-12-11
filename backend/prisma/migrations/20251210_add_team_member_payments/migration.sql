-- CreateTable
CREATE TABLE "admin_team_member_payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "team_member_id" UUID NOT NULL,
    "invoice_url" TEXT,
    "amount_usd" DECIMAL NOT NULL,
    "invoice_date" DATE,
    "payment_date" DATE NOT NULL,
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_team_member_payments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "admin_team_member_payments" ADD CONSTRAINT "admin_team_member_payments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_team_member_payments" ADD CONSTRAINT "admin_team_member_payments_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "admin_team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
