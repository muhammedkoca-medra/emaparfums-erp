import { type DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { createPrismaClient } from "@atelier/db";
import { parseKeyring } from "@atelier/shared/node";
import { type Logger } from "pino";
import { AdminController } from "./admin/admin.controller.js";
import { PermissionsAdminController } from "./admin/permissions-admin.controller.js";
import { AuditInterceptor } from "./audit/audit.interceptor.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService, PII_KEYRING } from "./auth/auth.service.js";
import { SessionService } from "./auth/session.service.js";
import { RateLimitGuard } from "./common/rate-limit.js";
import { APP_CONFIG, type AppConfig } from "./config.js";
import { LOGGER } from "./logger.js";
import { AuthGuard, PermissionGuard } from "./permissions/guards.js";
import { PermissionService } from "./permissions/permission.service.js";
import { IntegrationsService } from "./common/integrations.service.js";
import { PiiService } from "./common/pii.service.js";
import { PrismaService } from "./prisma.service.js";
import { CatalogController } from "./catalog/catalog.controller.js";
import { CustomersController } from "./customers/customers.controller.js";
import { DashboardController } from "./dashboard/dashboard.controller.js";
import { FormulasController } from "./formulas/formulas.controller.js";
import { CountsController } from "./stock/counts.controller.js";
import { StockController } from "./stock/stock.controller.js";
import { ProductionController } from "./production/production.controller.js";
import { PaymentsController } from "./payments/payments.controller.js";
import { InvoicesController } from "./invoices/invoices.controller.js";
import { ShippingController } from "./shipping/shipping.controller.js";
import { OrdersController } from "./sales/orders.controller.js";
import { SalesController } from "./sales/sales.controller.js";
import { ShowcaseController } from "./showcase/showcase.controller.js";
import { SystemController } from "./system/system.controller.js";
import { TaxController } from "./tax/tax.controller.js";

@Module({})
export class AppModule {
  static register(config: AppConfig, logger: Logger): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        AuthController,
        AdminController,
        SystemController,
        StockController,
        CountsController,
        CatalogController,
        FormulasController,
        TaxController,
        PermissionsAdminController,
        DashboardController,
        ShowcaseController,
        CustomersController,
        SalesController,
        OrdersController,
        PaymentsController,
        InvoicesController,
        ShippingController,
        ProductionController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: LOGGER, useValue: logger },
        {
          provide: PrismaService,
          useFactory: () => createPrismaClient(config.DATABASE_URL),
        },
        {
          provide: PII_KEYRING,
          useFactory: () => parseKeyring(config.PII_ENC_KEYS, config.PII_ENC_ACTIVE_KEY, config.PII_HASH_KEY),
        },
        SessionService,
        AuthService,
        PermissionService,
        PiiService,
        IntegrationsService,
        RateLimitGuard,
        // Global guard sırası: hız sınırı → oturum → yetki.
        { provide: APP_GUARD, useExisting: RateLimitGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
      ],
    };
  }
}
