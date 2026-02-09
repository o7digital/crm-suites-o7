import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { TasksModule } from './tasks/tasks.module';
import { InvoicesModule } from './invoices/invoices.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExportModule } from './export/export.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { PipelinesModule } from './pipelines/pipelines.module';
import { StagesModule } from './stages/stages.module';
import { DealsModule } from './deals/deals.module';
import { ForecastModule } from './forecast/forecast.module';
import { AdminModule } from './admin/admin.module';
import { ProductsModule } from './products/products.module';
import { FxModule } from './fx/fx.module';
import { IaModule } from './ia/ia.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FxModule,
    IaModule,
    PrismaModule,
    AuthModule,
    ClientsModule,
    TasksModule,
    InvoicesModule,
    DashboardModule,
    ExportModule,
    BootstrapModule,
    PipelinesModule,
    StagesModule,
    DealsModule,
    ForecastModule,
    AdminModule,
    ProductsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
