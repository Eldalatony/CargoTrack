import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { StorageModule } from './common/storage/storage.module';
import { validateApiEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientDocumentsModule } from './modules/client-documents/client-documents.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ContainerAllocationsModule } from './modules/container-allocations/container-allocations.module';
import { ContainersModule } from './modules/containers/containers.module';
import { CustomsAgentsModule } from './modules/customs-agents/customs-agents.module';
import { FreightProvidersModule } from './modules/freight-providers/freight-providers.module';
import { OrderItemsModule } from './modules/order-items/order-items.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductionOrdersModule } from './modules/production-orders/production-orders.module';
import { QcInspectionsModule } from './modules/qc-inspections/qc-inspections.module';
import { StatusHistoryModule } from './modules/status-history/status-history.module';
import { StockRecordsModule } from './modules/stock-records/stock-records.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { TransitLegsModule } from './modules/transit-legs/transit-legs.module';
import { UsersModule } from './modules/users/users.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

/**
 * API process.
 *
 * The two APP_GUARD entries are the whole authorization story: every route is
 * authenticated unless it says @Public(), and role-restricted where it says
 * @Roles(). Adding a controller cannot accidentally add an open endpoint.
 *
 * Phase 4 adds documents, payments and notifications.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Values come from the process environment only — injected by Docker
      // Compose locally and by the platform in production.
      ignoreEnvFile: true,
      validate: validateApiEnv,
    }),
    PrismaModule,
    RedisModule,
    JobsModule,
    StorageModule,
    StatusHistoryModule,
    HealthModule,

    AuthModule,
    UsersModule,
    ClientsModule,
    ClientDocumentsModule,
    SuppliersModule,
    FreightProvidersModule,
    CustomsAgentsModule,
    OrdersModule,
    OrderItemsModule,
    ProductionOrdersModule,
    QcInspectionsModule,

    ContainersModule,
    ContainerAllocationsModule,
    TransitLegsModule,
    WarehousesModule,
    StockRecordsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
