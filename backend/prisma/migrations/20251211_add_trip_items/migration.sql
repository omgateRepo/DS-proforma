-- CreateTable
CREATE TABLE "trip_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "trip_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "confirmation_no" TEXT,
    "notes" TEXT,
    "cost_usd" DECIMAL,
    "start_date" DATE NOT NULL,
    "start_time" TEXT,
    "end_date" DATE,
    "end_time" TEXT,
    "depart_time" TEXT,
    "arrive_time" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_items" ADD CONSTRAINT "trip_items_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
