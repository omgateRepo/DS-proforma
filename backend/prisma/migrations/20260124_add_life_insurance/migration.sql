-- Life Insurance Policies
CREATE TABLE "life_insurance_policies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "policy_number" TEXT,
    "carrier" TEXT,
    "face_amount" DECIMAL NOT NULL,
    "issue_date" DATE NOT NULL,
    "insured_name" TEXT,
    "insured_dob" DATE NOT NULL,
    "insured_sex" TEXT NOT NULL,
    "health_class" TEXT NOT NULL,
    "annual_premium" DECIMAL NOT NULL,
    "premium_payment_years" INTEGER NOT NULL,
    "guaranteed_rate" DECIMAL NOT NULL DEFAULT 0.04,
    "is_participating" BOOLEAN NOT NULL DEFAULT true,
    "dividend_rate" DECIMAL,
    "dividend_option" TEXT NOT NULL DEFAULT 'paid_up_additions',
    "loan_interest_rate" DECIMAL NOT NULL DEFAULT 0.06,
    "notes" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "life_insurance_policies_pkey" PRIMARY KEY ("id")
);

-- Life Insurance Cash Value History
CREATE TABLE "life_insurance_cash_values" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "policy_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "policy_year" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "cash_value" DECIMAL NOT NULL,
    "surrender_value" DECIMAL,
    "death_benefit" DECIMAL NOT NULL,
    "pua_cash_value" DECIMAL,
    "pua_death_benefit" DECIMAL,
    "dividend_amount" DECIMAL,
    "cumulative_premium" DECIMAL NOT NULL,
    "seven_pay_limit" DECIMAL,
    "is_mec" BOOLEAN NOT NULL DEFAULT false,
    "loan_balance" DECIMAL NOT NULL DEFAULT 0,
    "net_cash_value" DECIMAL,
    "net_death_benefit" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_insurance_cash_values_pkey" PRIMARY KEY ("id")
);

-- Life Insurance Loans
CREATE TABLE "life_insurance_loans" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "policy_id" UUID NOT NULL,
    "loan_date" DATE NOT NULL,
    "loan_amount" DECIMAL NOT NULL,
    "interest_rate" DECIMAL NOT NULL,
    "purpose" TEXT,
    "repayment_date" DATE,
    "repayment_amount" DECIMAL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_insurance_loans_pkey" PRIMARY KEY ("id")
);

-- Life Insurance Withdrawals (scheduled)
CREATE TABLE "life_insurance_withdrawals" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "policy_id" UUID NOT NULL,
    "start_age" INTEGER NOT NULL,
    "annual_amount" DECIMAL NOT NULL,
    "years" INTEGER NOT NULL,
    "withdrawal_type" TEXT NOT NULL DEFAULT 'loan',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_insurance_withdrawals_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for cash values per policy year
CREATE UNIQUE INDEX "life_insurance_cash_values_policy_id_policy_year_key" ON "life_insurance_cash_values"("policy_id", "policy_year");

-- Foreign keys
ALTER TABLE "life_insurance_policies" ADD CONSTRAINT "life_insurance_policies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "life_insurance_cash_values" ADD CONSTRAINT "life_insurance_cash_values_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "life_insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "life_insurance_loans" ADD CONSTRAINT "life_insurance_loans_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "life_insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "life_insurance_withdrawals" ADD CONSTRAINT "life_insurance_withdrawals_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "life_insurance_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
