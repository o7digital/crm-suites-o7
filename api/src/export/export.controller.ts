import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../common/user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('clients')
  @Header('Content-Type', 'text/csv')
  clients(@CurrentUser() user: RequestUser) {
    return this.exportService.clients(user);
  }

  @Get('invoices')
  @Header('Content-Type', 'text/csv')
  invoices(@CurrentUser() user: RequestUser) {
    return this.exportService.invoices(user);
  }
}
