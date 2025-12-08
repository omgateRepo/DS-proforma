-- CreateTable: subscription_packages
CREATE TABLE "subscription_packages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "suggested_price" DECIMAL NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: subscription_package_items
CREATE TABLE "subscription_package_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "package_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "metric_value" TEXT,
    "cost" DECIMAL NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_package_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "subscription_packages" ADD CONSTRAINT "subscription_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "business_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_package_items" ADD CONSTRAINT "subscription_package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "subscription_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

