/**
 * Demo seed — populates every one of the 19 entity types (roadmap Gate 1).
 *
 * The data tells one coherent story rather than being random rows:
 *   - Nile Trading  : a closed-out order, documents released, both payments in
 *   - Delta Imports : mid-flight order, goods received, awaiting shipment
 *   - Cairo Retail  : delivered but balance unpaid — documents withheld
 *
 * The last case is the one that matters: it is the fixture for the strongest
 * business rule in the domain (roadmap Phase 4).
 *
 * Safe to re-run. By default it refuses to touch a database that already has
 * data — SEED_ON_START runs on every container start, and silently wiping the
 * developer's work would be the wrong default. Set SEED_FORCE=true to reset.
 */
import {
  ClientDocumentType,
  ContainerStatus,
  CounterpartyType,
  DocumentType,
  EntityType,
  NotificationChannel,
  NotificationStatus,
  OrderStatus,
  PaymentDirection,
  PaymentType,
  PrismaClient,
  PricingBasis,
  ProductionOrderStatus,
  QcOutcome,
  RecipientType,
  RouteType,
  StockStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'CargoTrack!2026';

async function reset(): Promise<void> {
  // Order matters — children before parents.
  await prisma.notification.deleteMany();
  await prisma.statusHistory.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.transitLeg.deleteMany();
  await prisma.containerAllocation.deleteMany();
  await prisma.container.deleteMany();
  await prisma.stockRecord.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.qcInspection.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.clientDocument.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.freightProvider.deleteMany();
  await prisma.customsAgent.deleteMany();
}

async function main(): Promise<void> {
  const force = process.env.SEED_FORCE === 'true';
  const existingClients = await prisma.client.count();

  if (existingClients > 0 && !force) {
    console.log(
      `Database already contains data (${existingClients} clients) — skipping seed.`,
    );
    console.log('Set SEED_FORCE=true to wipe and reseed.');
    return;
  }

  console.log('Seeding CargoTrack demo data…');
  await reset();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // -------------------------------------------------------------------------
  // Parties
  // -------------------------------------------------------------------------
  const nileTrading = await prisma.client.create({
    data: {
      companyName: 'Nile Trading Co.',
      contactName: 'Hassan Fahmy',
      email: 'hassan@niletrading.example',
      phone: '+20 100 555 0142',
      country: 'Egypt',
      address: '14 Corniche El Nil, Cairo',
      isConsolidator: true,
    },
  });

  const deltaImports = await prisma.client.create({
    data: {
      companyName: 'Delta Imports',
      contactName: 'Mona Saleh',
      email: 'mona@deltaimports.example',
      phone: '+20 122 555 0198',
      country: 'Egypt',
      address: '7 El Geish Road, Alexandria',
    },
  });

  const cairoRetail = await prisma.client.create({
    data: {
      companyName: 'Cairo Retail Group',
      contactName: 'Youssef Adel',
      email: 'youssef@cairoretail.example',
      phone: '+20 111 555 0166',
      country: 'Egypt',
      address: '22 Talaat Harb St, Cairo',
    },
  });

  const officeManager = await prisma.user.create({
    data: {
      name: 'Amira Rashad',
      email: 'manager@cargotrack.example',
      passwordHash,
      role: UserRole.OFFICE_MANAGER,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        name: 'Hassan Fahmy',
        email: 'hassan@niletrading.example',
        passwordHash,
        role: UserRole.CLIENT,
        clientId: nileTrading.id,
      },
      {
        name: 'Mona Saleh',
        email: 'mona@deltaimports.example',
        passwordHash,
        role: UserRole.CLIENT,
        clientId: deltaImports.id,
      },
      {
        name: 'Youssef Adel',
        email: 'youssef@cairoretail.example',
        passwordHash,
        role: UserRole.CLIENT,
        clientId: cairoRetail.id,
      },
    ],
  });

  await prisma.clientDocument.createMany({
    data: [
      {
        clientId: nileTrading.id,
        docType: ClientDocumentType.PASSPORT_SCAN,
        fileRef: 's3://cargotrack-demo/clients/nile/passport.pdf',
        retentionExpiresAt: new Date('2029-01-31'),
      },
      {
        clientId: deltaImports.id,
        docType: ClientDocumentType.TRADE_LICENSE,
        fileRef: 's3://cargotrack-demo/clients/delta/trade-licence.pdf',
        retentionExpiresAt: new Date('2028-06-30'),
      },
    ],
  });

  const guangzhouFurniture = await prisma.supplier.create({
    data: {
      name: 'Guangzhou Furniture Works',
      country: 'China',
      contactPhone: '+86 20 5555 0110',
      notes: 'Reliable on lead times. Requires 20% deposit before production.',
    },
  });

  const yiwuHousewares = await prisma.supplier.create({
    data: {
      name: 'Yiwu Housewares Ltd',
      country: 'China',
      contactPhone: '+86 579 5555 0187',
    },
  });

  const pacificLine = await prisma.freightProvider.create({
    data: {
      name: 'Pacific Line Shipping',
      country: 'Singapore',
      contactPhone: '+65 6555 0123',
    },
  });

  const redSeaFreight = await prisma.freightProvider.create({
    data: {
      name: 'Red Sea Freight',
      country: 'Egypt',
      contactPhone: '+20 3 555 0177',
    },
  });

  const alexCustoms = await prisma.customsAgent.create({
    data: {
      name: 'Alexandria Customs Bureau',
      country: 'Egypt',
      phone: '+20 3 555 0144',
      notes: 'Handles clearance at Alexandria Port.',
    },
  });

  // -------------------------------------------------------------------------
  // Orders
  // -------------------------------------------------------------------------
  const closedOrder = await prisma.order.create({
    data: {
      clientId: nileTrading.id,
      status: OrderStatus.CLOSED_OUT,
      agreedPrice: '48000.00',
      currency: 'USD',
      depositPercentage: '20.00',
      totalCbm: '12.400',
      totalWeightKg: '3150.000',
      requiredBy: new Date('2026-05-20'),
      placedAt: new Date('2026-01-12T09:15:00Z'),
      closedAt: new Date('2026-06-02T14:40:00Z'),
      items: {
        create: [
          {
            description: 'Oak dining chairs, flat-packed',
            category: 'Furniture',
            quantity: 400,
            unitCbm: '0.0260',
            unitWeightKg: '6.500',
            unitPrice: '78.00',
          },
          {
            description: 'Dining tables, 180cm',
            category: 'Furniture',
            quantity: 60,
            unitCbm: '0.0300',
            unitWeightKg: '18.000',
            unitPrice: '270.00',
          },
        ],
      },
    },
    include: { items: true },
  });

  const inProductionOrder = await prisma.order.create({
    data: {
      clientId: deltaImports.id,
      status: OrderStatus.GOODS_RECEIVED,
      agreedPrice: '21500.00',
      currency: 'USD',
      depositPercentage: '20.00',
      totalCbm: '7.100',
      totalWeightKg: '1480.000',
      requiredBy: new Date('2026-09-30'),
      placedAt: new Date('2026-06-18T11:00:00Z'),
      items: {
        create: [
          {
            description: 'Stainless steel cookware sets',
            category: 'Housewares',
            quantity: 900,
            unitCbm: '0.0079',
            unitWeightKg: '1.640',
            unitPrice: '23.90',
          },
        ],
      },
    },
    include: { items: true },
  });

  // The document-withholding fixture: delivered, balance unpaid.
  const withheldOrder = await prisma.order.create({
    data: {
      clientId: cairoRetail.id,
      status: OrderStatus.DOCUMENTS_WITHHELD,
      agreedPrice: '33750.00',
      currency: 'USD',
      depositPercentage: '20.00',
      totalCbm: '9.250',
      totalWeightKg: '2010.000',
      requiredBy: new Date('2026-08-15'),
      placedAt: new Date('2026-03-02T08:30:00Z'),
      items: {
        create: [
          {
            description: 'LED ceiling panels, 60x60',
            category: 'Lighting',
            quantity: 1500,
            unitCbm: '0.0062',
            unitWeightKg: '1.340',
            unitPrice: '22.50',
          },
        ],
      },
    },
    include: { items: true },
  });

  // -------------------------------------------------------------------------
  // Production & QC
  // -------------------------------------------------------------------------
  const closedProduction = await prisma.productionOrder.create({
    data: {
      orderId: closedOrder.id,
      supplierId: guangzhouFurniture.id,
      agreedCost: '31200.00',
      currency: 'USD',
      expectedReadyDate: new Date('2026-03-10'),
      actualReceivedDate: new Date('2026-03-14'),
      status: ProductionOrderStatus.RECEIVED,
    },
  });

  const activeProduction = await prisma.productionOrder.create({
    data: {
      orderId: inProductionOrder.id,
      supplierId: yiwuHousewares.id,
      agreedCost: '14100.00',
      currency: 'USD',
      expectedReadyDate: new Date('2026-08-22'),
      actualReceivedDate: new Date('2026-08-20'),
      status: ProductionOrderStatus.RECEIVED,
    },
  });

  const withheldProduction = await prisma.productionOrder.create({
    data: {
      orderId: withheldOrder.id,
      supplierId: yiwuHousewares.id,
      agreedCost: '21900.00',
      currency: 'USD',
      expectedReadyDate: new Date('2026-05-05'),
      actualReceivedDate: new Date('2026-05-09'),
      status: ProductionOrderStatus.RECEIVED,
    },
  });

  await prisma.qcInspection.create({
    data: {
      productionOrderId: closedProduction.id,
      inspectedAt: new Date('2026-03-15T10:00:00Z'),
      outcome: QcOutcome.PASSED,
      clientSignedOffAt: new Date('2026-03-15T12:30:00Z'),
      signedOffBy: officeManager.id,
    },
  });

  // Signed off, so the balance invoice is unblocked.
  await prisma.qcInspection.create({
    data: {
      productionOrderId: withheldProduction.id,
      inspectedAt: new Date('2026-05-10T09:00:00Z'),
      outcome: QcOutcome.PASSED,
      clientSignedOffAt: new Date('2026-05-10T15:00:00Z'),
      signedOffBy: officeManager.id,
    },
  });

  // Inspected but NOT signed off — the balance invoice is blocked here.
  await prisma.qcInspection.create({
    data: {
      productionOrderId: activeProduction.id,
      inspectedAt: new Date('2026-08-21T09:30:00Z'),
      outcome: QcOutcome.PARTIAL,
      rejectionNotes: '12 sets with lid scratches, awaiting client decision.',
    },
  });

  // -------------------------------------------------------------------------
  // Warehousing
  // -------------------------------------------------------------------------
  const alexWarehouse = await prisma.warehouse.create({
    data: {
      name: 'Alexandria Bonded Warehouse',
      country: 'Egypt',
      address: 'Gate 4, Alexandria Port',
    },
  });

  const guangzhouWarehouse = await prisma.warehouse.create({
    data: {
      name: 'Guangzhou Consolidation Hub',
      country: 'China',
      address: 'Block 9, Nansha District',
    },
  });

  await prisma.stockRecord.create({
    data: {
      warehouseId: guangzhouWarehouse.id,
      orderItemId: inProductionOrder.items[0].id,
      quantity: 900,
      status: StockStatus.ON_HOLD,
      holdReason:
        'Client asked to hold until after the seasonal rate drop in October.',
      receivedAt: new Date('2026-08-20T13:00:00Z'),
    },
  });

  await prisma.stockRecord.create({
    data: {
      warehouseId: alexWarehouse.id,
      orderItemId: closedOrder.items[0].id,
      quantity: 400,
      status: StockStatus.RELEASED,
      receivedAt: new Date('2026-05-28T07:45:00Z'),
      releasedAt: new Date('2026-06-01T10:20:00Z'),
    },
  });

  // -------------------------------------------------------------------------
  // Shipping — one consolidated container carrying two clients' orders
  // -------------------------------------------------------------------------
  const closedContainer = await prisma.container.create({
    data: {
      freightProviderId: pacificLine.id,
      customsAgentId: alexCustoms.id,
      containerRef: 'MSKU-4471820',
      containerType: '40HC',
      capacityCbm: '67.700',
      capacityWeightKg: '28000.000',
      pricingBasis: PricingBasis.CBM,
      bookingCost: '4200.00',
      currency: 'USD',
      originPort: 'Nansha, Guangzhou',
      destinationPort: 'Alexandria',
      routeType: RouteType.TRANSIT,
      insuranceRef: 'INS-2026-00841',
      status: ContainerStatus.CLOSED,
      bookedAt: new Date('2026-04-02T08:00:00Z'),
      departedAt: new Date('2026-04-11T22:15:00Z'),
      arrivedAt: new Date('2026-05-26T06:40:00Z'),
    },
  });

  const openContainer = await prisma.container.create({
    data: {
      freightProviderId: redSeaFreight.id,
      customsAgentId: alexCustoms.id,
      containerRef: 'TGHU-9920355',
      containerType: '20GP',
      capacityCbm: '33.200',
      capacityWeightKg: '21500.000',
      pricingBasis: PricingBasis.CBM,
      originPort: 'Ningbo',
      destinationPort: 'Alexandria',
      routeType: RouteType.DIRECT,
      status: ContainerStatus.OPEN_FOR_ALLOCATION,
    },
  });

  // Consolidated shipping: two orders sharing one container.
  await prisma.containerAllocation.createMany({
    data: [
      {
        containerId: closedContainer.id,
        orderId: closedOrder.id,
        allocatedCbm: '12.400',
        allocatedWeightKg: '3150.000',
        allocatedCost: '2480.00',
        currency: 'USD',
      },
      {
        containerId: closedContainer.id,
        orderId: withheldOrder.id,
        allocatedCbm: '9.250',
        allocatedWeightKg: '2010.000',
        allocatedCost: '1720.00',
        currency: 'USD',
      },
    ],
  });

  // Transit route sub-flow: one stop between origin and destination.
  await prisma.transitLeg.createMany({
    data: [
      {
        containerId: closedContainer.id,
        sequence: 1,
        port: 'Singapore',
        arrivedAt: new Date('2026-04-19T04:00:00Z'),
        departedAt: new Date('2026-04-21T17:30:00Z'),
      },
      {
        containerId: closedContainer.id,
        sequence: 2,
        port: 'Jeddah',
        arrivedAt: new Date('2026-05-14T11:10:00Z'),
        departedAt: new Date('2026-05-16T03:45:00Z'),
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Documents — including a version chain and a withheld set
  // -------------------------------------------------------------------------
  const draftBl = await prisma.document.create({
    data: {
      orderId: closedOrder.id,
      containerId: closedContainer.id,
      docType: DocumentType.BILL_OF_LADING,
      version: 1,
      fileRef: 's3://cargotrack-demo/docs/bl-4471820-v1.pdf',
      preparedBy: officeManager.id,
      createdAt: new Date('2026-04-12T09:00:00Z'),
    },
  });

  // v2 supersedes v1 — the self-referencing version chain.
  await prisma.document.create({
    data: {
      orderId: closedOrder.id,
      containerId: closedContainer.id,
      docType: DocumentType.BILL_OF_LADING,
      version: 2,
      supersedesId: draftBl.id,
      fileRef: 's3://cargotrack-demo/docs/bl-4471820-v2.pdf',
      preparedBy: officeManager.id,
      createdAt: new Date('2026-04-14T16:20:00Z'),
      releasedToClientAt: new Date('2026-06-02T14:35:00Z'),
    },
  });

  await prisma.document.create({
    data: {
      orderId: closedOrder.id,
      docType: DocumentType.COMMERCIAL_INVOICE,
      fileRef: 's3://cargotrack-demo/docs/inv-nile-0114.pdf',
      preparedBy: officeManager.id,
      releasedToClientAt: new Date('2026-06-02T14:35:00Z'),
    },
  });

  // released_to_client_at stays null — the balance payment has not cleared.
  await prisma.document.createMany({
    data: [
      {
        orderId: withheldOrder.id,
        containerId: closedContainer.id,
        docType: DocumentType.BILL_OF_LADING,
        fileRef: 's3://cargotrack-demo/docs/bl-cairo-0302.pdf',
        preparedBy: officeManager.id,
      },
      {
        orderId: withheldOrder.id,
        docType: DocumentType.PACKING_LIST,
        fileRef: 's3://cargotrack-demo/docs/pl-cairo-0302.pdf',
        preparedBy: officeManager.id,
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------
  await prisma.payment.createMany({
    data: [
      {
        orderId: closedOrder.id,
        paymentType: PaymentType.DEPOSIT,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: nileTrading.id,
        amount: '9600.00',
        currency: 'USD',
        paidAt: new Date('2026-01-15T10:00:00Z'),
        reference: 'DEP-NILE-0115',
      },
      {
        orderId: closedOrder.id,
        paymentType: PaymentType.BALANCE,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: nileTrading.id,
        amount: '38400.00',
        currency: 'USD',
        paidAt: new Date('2026-06-02T13:50:00Z'),
        reference: 'BAL-NILE-0602',
      },
      {
        orderId: closedOrder.id,
        paymentType: PaymentType.FREIGHT,
        direction: PaymentDirection.OUTBOUND,
        counterpartyType: CounterpartyType.FREIGHT_PROVIDER,
        counterpartyId: pacificLine.id,
        amount: '2480.00',
        currency: 'USD',
        paidAt: new Date('2026-04-03T09:00:00Z'),
        reference: 'FRT-PAC-0403',
      },
      {
        orderId: inProductionOrder.id,
        paymentType: PaymentType.DEPOSIT,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: deltaImports.id,
        amount: '4300.00',
        currency: 'USD',
        paidAt: new Date('2026-06-20T09:10:00Z'),
        reference: 'DEP-DELTA-0620',
      },
      {
        orderId: withheldOrder.id,
        paymentType: PaymentType.DEPOSIT,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: cairoRetail.id,
        amount: '6750.00',
        currency: 'USD',
        paidAt: new Date('2026-03-05T11:25:00Z'),
        reference: 'DEP-CAIRO-0305',
      },
      // Balance raised but never paid — paidAt is null. This is what keeps
      // the Cairo Retail documents withheld.
      {
        orderId: withheldOrder.id,
        paymentType: PaymentType.BALANCE,
        direction: PaymentDirection.INBOUND,
        counterpartyType: CounterpartyType.CLIENT,
        counterpartyId: cairoRetail.id,
        amount: '27000.00',
        currency: 'USD',
        reference: 'BAL-CAIRO-PENDING',
      },
    ],
  });

  // -------------------------------------------------------------------------
  // Append-only tables
  // -------------------------------------------------------------------------
  const closedOrderTrail: OrderStatus[] = [
    OrderStatus.ORDER_PLACED,
    OrderStatus.ORDER_CONFIRMED,
    OrderStatus.GOODS_RECEIVED,
    OrderStatus.SHIPMENT_BOOKING,
    OrderStatus.ROUTE_DECISION,
    OrderStatus.IN_TRANSIT,
    OrderStatus.DELIVERED,
    OrderStatus.CLOSED_OUT,
  ];

  await prisma.statusHistory.createMany({
    data: closedOrderTrail.slice(1).map((toStatus, index) => ({
      entityType: EntityType.ORDER,
      entityId: closedOrder.id,
      fromStatus: closedOrderTrail[index],
      toStatus,
      changedBy: officeManager.id,
      reason: null,
      changedAt: new Date(
        Date.UTC(2026, 0, 20 + index * 18, 10, 0, 0),
      ),
    })),
  });

  await prisma.statusHistory.createMany({
    data: [
      {
        entityType: EntityType.CONTAINER,
        entityId: closedContainer.id,
        fromStatus: ContainerStatus.OPEN_FOR_ALLOCATION,
        toStatus: ContainerStatus.FULLY_ALLOCATED,
        changedBy: officeManager.id,
        changedAt: new Date('2026-04-02T08:05:00Z'),
      },
      {
        entityType: EntityType.CONTAINER,
        entityId: closedContainer.id,
        fromStatus: ContainerStatus.FULLY_ALLOCATED,
        toStatus: ContainerStatus.DEPARTED,
        changedBy: officeManager.id,
        changedAt: new Date('2026-04-11T22:15:00Z'),
      },
      {
        entityType: EntityType.CONTAINER,
        entityId: closedContainer.id,
        fromStatus: ContainerStatus.DEPARTED,
        toStatus: ContainerStatus.ARRIVED,
        changedBy: officeManager.id,
        changedAt: new Date('2026-05-26T06:40:00Z'),
      },
      {
        entityType: EntityType.ORDER,
        entityId: withheldOrder.id,
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.DOCUMENTS_WITHHELD,
        changedBy: officeManager.id,
        reason: 'Balance payment not received within terms.',
        changedAt: new Date('2026-06-10T09:00:00Z'),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        eventType: 'order.closed_out',
        entityType: EntityType.ORDER,
        entityId: closedOrder.id,
        recipientType: RecipientType.CLIENT,
        recipientId: nileTrading.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        sentAt: new Date('2026-06-02T14:41:00Z'),
      },
      {
        eventType: 'container.arrived',
        entityType: EntityType.CONTAINER,
        entityId: closedContainer.id,
        recipientType: RecipientType.CLIENT,
        recipientId: cairoRetail.id,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        sentAt: new Date('2026-05-26T07:00:00Z'),
      },
      // Exhausted its retries — surfaces in the Office Manager dashboard.
      {
        eventType: 'order.documents_withheld',
        entityType: EntityType.ORDER,
        entityId: withheldOrder.id,
        recipientType: RecipientType.CLIENT,
        recipientId: cairoRetail.id,
        channel: NotificationChannel.SMS,
        status: NotificationStatus.DEAD_LETTER,
        retryCount: 5,
        lastError: 'SMS gateway timeout after 30s',
        scheduledAt: new Date('2026-06-10T09:01:00Z'),
      },
      {
        eventType: 'qc.awaiting_signoff',
        entityType: EntityType.PRODUCTION_ORDER,
        entityId: activeProduction.id,
        recipientType: RecipientType.USER,
        recipientId: officeManager.id,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
        clientVisible: false,
      },
    ],
  });

  // Keeps the "open" container referenced so it is obviously not orphaned.
  await prisma.statusHistory.create({
    data: {
      entityType: EntityType.CONTAINER,
      entityId: openContainer.id,
      fromStatus: null,
      toStatus: ContainerStatus.OPEN_FOR_ALLOCATION,
      changedBy: officeManager.id,
      reason: 'Container opened for the October consolidation run.',
    },
  });

  await summarise();
}

async function summarise(): Promise<void> {
  const counts = {
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    client_documents: await prisma.clientDocument.count(),
    suppliers: await prisma.supplier.count(),
    freight_providers: await prisma.freightProvider.count(),
    customs_agents: await prisma.customsAgent.count(),
    orders: await prisma.order.count(),
    order_items: await prisma.orderItem.count(),
    production_orders: await prisma.productionOrder.count(),
    qc_inspections: await prisma.qcInspection.count(),
    warehouses: await prisma.warehouse.count(),
    stock_records: await prisma.stockRecord.count(),
    containers: await prisma.container.count(),
    container_allocations: await prisma.containerAllocation.count(),
    transit_legs: await prisma.transitLeg.count(),
    documents: await prisma.document.count(),
    payments: await prisma.payment.count(),
    status_history: await prisma.statusHistory.count(),
    notifications: await prisma.notification.count(),
  };

  console.table(counts);

  const empty = Object.entries(counts).filter(([, n]) => n === 0);
  if (empty.length > 0) {
    throw new Error(
      `Seed incomplete — no rows in: ${empty.map(([t]) => t).join(', ')}`,
    );
  }

  console.log(`\nAll ${Object.keys(counts).length} entity types populated.`);
  console.log(`Demo login password for every seeded user: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
