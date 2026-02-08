import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { readdir } from 'node:fs/promises';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      const dealColumns = await this.prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Deal'
      `;

      const tables = await this.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('DealItem', 'Product')
      `;

      const hasColumn = (name: string) => dealColumns.some((c) => c.column_name === name);
      const hasTable = (name: string) => tables.some((t) => t.table_name === name);

      let migrations: Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }> = [];
      try {
        migrations = await this.prisma.$queryRaw<
          Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
        >`
          SELECT migration_name, finished_at, rolled_back_at
          FROM _prisma_migrations
          ORDER BY started_at DESC
          LIMIT 10
        `;
      } catch {
        // _prisma_migrations may not exist if DB was created outside Prisma
      }

      let migrationsOnDisk: string[] = [];
      try {
        const entries = await readdir('prisma/migrations', { withFileTypes: true });
        migrationsOnDisk = entries
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
      } catch {
        // ignore fs errors (ex: missing folder)
      }

      return {
        ok: true,
        db: true,
        schema: {
          deal: {
            hasClientId: hasColumn('clientId'),
            hasExpectedCloseDate: hasColumn('expectedCloseDate'),
          },
          hasProductTables: hasTable('Product') && hasTable('DealItem'),
        },
        migrations,
        migrationsOnDisk,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return {
        ok: false,
        db: false,
        error: message,
      };
    }
  }
}
