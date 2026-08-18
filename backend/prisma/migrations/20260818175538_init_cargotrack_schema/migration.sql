-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OFFICE_MANAGER', 'CLIENT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ORDER_PLACED', 'ORDER_CONFIRMED', 'GOODS_RECEIVED', 'SHIPMENT_BOOKING', 'ROUTE_DECISION', 'IN_TRANSIT', 'DELIVERED', 'CLOSED_OUT', 'CANCELLED', 'FACTORY_CANNOT_FULFIL', 'QC_REJECTED', 'DOCUMENTS_WITHHELD');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('OPEN_FOR_ALLOCATION', 'FULLY_ALLOCATED', 'DEPARTED', 'ARRIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'READY', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QcOutcome" AS ENUM ('PASSED', 'REJECTED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'ON_HOLD', 'RELEASED');

-- CreateEnum
CREATE TYPE "RouteType" AS ENUM ('DIRECT', 'TRANSIT');

-- CreateEnum
CREATE TYPE "PricingBasis" AS ENUM ('CBM', 'WEIGHT', 'FLAT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('BILL_OF_LADING', 'PACKING_LIST', 'COMMERCIAL_INVOICE', 'CERTIFICATE_OF_ORIGIN', 'CUSTOMS_DECLARATION', 'INSURANCE_CERTIFICATE', 'QC_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientDocumentType" AS ENUM ('PASSPORT_SCAN', 'TRADE_LICENSE', 'TAX_CARD', 'SIGNATURE_SPECIMEN', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'BALANCE', 'FREIGHT', 'CUSTOMS', 'STORAGE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "CounterpartyType" AS ENUM ('CLIENT', 'SUPPLIER', 'FREIGHT_PROVIDER', 'CUSTOMS_AGENT', 'WAREHOUSE');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('ORDER', 'CONTAINER', 'PRODUCTION_ORDER', 'STOCK_RECORD', 'DOCUMENT', 'PAYMENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "RecipientType" AS ENUM ('CLIENT', 'USER', 'SUPPLIER', 'FREIGHT_PROVIDER', 'CUSTOMS_AGENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "client_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "is_consolidator" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_documents" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "doc_type" "ClientDocumentType" NOT NULL,
    "file_ref" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_expires_at" TIMESTAMP(3),

    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contact_phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freight_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freight_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customs_agents" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customs_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDER_PLACED',
    "agreed_price" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "deposit_percentage" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "total_cbm" DECIMAL(10,3),
    "total_weight_kg" DECIMAL(12,3),
    "required_by" DATE,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_cbm" DECIMAL(10,4) NOT NULL,
    "unit_weight_kg" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "agreed_cost" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "expected_ready_date" DATE,
    "actual_received_date" DATE,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_inspections" (
    "id" UUID NOT NULL,
    "production_order_id" UUID NOT NULL,
    "inspected_at" TIMESTAMP(3) NOT NULL,
    "outcome" "QcOutcome" NOT NULL,
    "rejection_notes" TEXT,
    "client_signed_off_at" TIMESTAMP(3),
    "signed_off_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qc_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_records" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "StockStatus" NOT NULL DEFAULT 'IN_STOCK',
    "hold_reason" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" UUID NOT NULL,
    "freight_provider_id" UUID,
    "customs_agent_id" UUID,
    "container_ref" TEXT NOT NULL,
    "container_type" TEXT NOT NULL,
    "capacity_cbm" DECIMAL(10,3) NOT NULL,
    "capacity_weight_kg" DECIMAL(12,3) NOT NULL,
    "pricing_basis" "PricingBasis" NOT NULL DEFAULT 'CBM',
    "booking_cost" DECIMAL(14,2),
    "currency" CHAR(3),
    "origin_port" TEXT NOT NULL,
    "destination_port" TEXT NOT NULL,
    "route_type" "RouteType" NOT NULL DEFAULT 'DIRECT',
    "insurance_ref" TEXT,
    "status" "ContainerStatus" NOT NULL DEFAULT 'OPEN_FOR_ALLOCATION',
    "booked_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_allocations" (
    "id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "allocated_cbm" DECIMAL(10,3) NOT NULL,
    "allocated_weight_kg" DECIMAL(12,3) NOT NULL,
    "allocated_cost" DECIMAL(14,2),
    "currency" CHAR(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "container_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transit_legs" (
    "id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "port" TEXT NOT NULL,
    "arrived_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transit_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "order_id" UUID,
    "container_id" UUID,
    "doc_type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedes_id" UUID,
    "file_ref" TEXT NOT NULL,
    "prepared_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_to_client_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "payment_type" "PaymentType" NOT NULL,
    "direction" "PaymentDirection" NOT NULL,
    "counterparty_type" "CounterpartyType" NOT NULL,
    "counterparty_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fx_rate" DECIMAL(14,6),
    "paid_at" TIMESTAMP(3),
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" UUID NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" UUID,
    "reason" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "recipient_type" "RecipientType" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "client_visible" BOOLEAN NOT NULL DEFAULT true,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_client_id_idx" ON "users"("client_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "clients_company_name_idx" ON "clients"("company_name");

-- CreateIndex
CREATE INDEX "client_documents_client_id_idx" ON "client_documents"("client_id");

-- CreateIndex
CREATE INDEX "client_documents_retention_expires_at_idx" ON "client_documents"("retention_expires_at");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "freight_providers_name_idx" ON "freight_providers"("name");

-- CreateIndex
CREATE INDEX "customs_agents_name_idx" ON "customs_agents"("name");

-- CreateIndex
CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_placed_at_idx" ON "orders"("placed_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "production_orders_order_id_idx" ON "production_orders"("order_id");

-- CreateIndex
CREATE INDEX "production_orders_supplier_id_idx" ON "production_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "qc_inspections_production_order_id_idx" ON "qc_inspections"("production_order_id");

-- CreateIndex
CREATE INDEX "stock_records_warehouse_id_idx" ON "stock_records"("warehouse_id");

-- CreateIndex
CREATE INDEX "stock_records_order_item_id_idx" ON "stock_records"("order_item_id");

-- CreateIndex
CREATE INDEX "stock_records_status_idx" ON "stock_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "containers_container_ref_key" ON "containers"("container_ref");

-- CreateIndex
CREATE INDEX "containers_status_idx" ON "containers"("status");

-- CreateIndex
CREATE INDEX "containers_freight_provider_id_idx" ON "containers"("freight_provider_id");

-- CreateIndex
CREATE INDEX "container_allocations_order_id_idx" ON "container_allocations"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "container_allocations_container_id_order_id_key" ON "container_allocations"("container_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "transit_legs_container_id_sequence_key" ON "transit_legs"("container_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "documents_supersedes_id_key" ON "documents"("supersedes_id");

-- CreateIndex
CREATE INDEX "documents_order_id_idx" ON "documents"("order_id");

-- CreateIndex
CREATE INDEX "documents_container_id_idx" ON "documents"("container_id");

-- CreateIndex
CREATE INDEX "documents_doc_type_idx" ON "documents"("doc_type");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_payment_type_idx" ON "payments"("payment_type");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "status_history_entity_type_entity_id_idx" ON "status_history"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "status_history_changed_at_idx" ON "status_history"("changed_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "notifications_scheduled_at_idx" ON "notifications"("scheduled_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_signed_off_by_fkey" FOREIGN KEY ("signed_off_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_records" ADD CONSTRAINT "stock_records_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_records" ADD CONSTRAINT "stock_records_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_freight_provider_id_fkey" FOREIGN KEY ("freight_provider_id") REFERENCES "freight_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_customs_agent_id_fkey" FOREIGN KEY ("customs_agent_id") REFERENCES "customs_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_allocations" ADD CONSTRAINT "container_allocations_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_allocations" ADD CONSTRAINT "container_allocations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transit_legs" ADD CONSTRAINT "transit_legs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_prepared_by_fkey" FOREIGN KEY ("prepared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
