import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

const statuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const applicationStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'DOCUMENTS', 'APPROVED', 'REJECTED'];

@Injectable()
export class KabinService {
  constructor(private readonly prisma: PrismaService) {}

  catalogue(tenantId: string) {
    return this.prisma.kabinVehicle.findMany({
      where: { tenantId, status: 'PUBLISHED' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, brand: true, model: true, version: true, modelYear: true, armorLevel: true,
        description: true, specifications: true, imageUrl: true, priceMxn: true, featured: true },
    });
  }
  vehicles(tenantId: string) {
    return this.prisma.kabinVehicle.findMany({ where: { tenantId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }
  private vehicleData(input: unknown) {
    const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const required = (key: string) => {
      const value = b[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new BadRequestException(`Invalid ${key}`);
      return value.trim();
    };
    const optional = (key: string, max = 1000) => {
      if (b[key] == null || b[key] === '') return null;
      if (typeof b[key] !== 'string' || b[key].length > max) throw new BadRequestException(`Invalid ${key}`);
      return b[key].trim();
    };
    const number = (key: string, min: number, max: number) => {
      if (b[key] == null || b[key] === '') return null;
      const n = Number(b[key]);
      if (!Number.isFinite(n) || n < min || n > max) throw new BadRequestException(`Invalid ${key}`);
      return n;
    };
    const imageUrl = optional('imageUrl');
    if (imageUrl && (!imageUrl.startsWith('https://') || !/^https:\/\/[^\s]+$/.test(imageUrl)))
      throw new BadRequestException('imageUrl must use HTTPS');
    const status = b.status ?? 'DRAFT';
    if (!statuses.includes(String(status))) throw new BadRequestException('Invalid status');
    if (b.specifications != null && (typeof b.specifications !== 'object' || Array.isArray(b.specifications)))
      throw new BadRequestException('Invalid specifications');
    return { brand: required('brand'), model: required('model'), version: optional('version'),
      modelYear: number('modelYear', 1990, 2100), armorLevel: optional('armorLevel', 100),
      description: optional('description', 3000), imageUrl, priceMxn: number('priceMxn', 0, 1000000000),
      specifications: (b.specifications ?? undefined) as Prisma.InputJsonValue | undefined,
      featured: b.featured === true, sortOrder: number('sortOrder', 0, 100000) ?? 0, status: String(status) };
  }
  createVehicle(tenantId: string, input: unknown) {
    return this.prisma.kabinVehicle.create({ data: { ...this.vehicleData(input), tenantId } });
  }
  async updateVehicle(tenantId: string, id: string, input: unknown) {
    const vehicle = await this.prisma.kabinVehicle.findFirst({ where: { id, tenantId } });
    if (!vehicle) throw new NotFoundException();
    return this.prisma.kabinVehicle.update({ where: { id }, data: this.vehicleData(input) });
  }
  applications(tenantId: string, status?: string) {
    if (status && !applicationStatuses.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.kabinApplication.findMany({ where: { tenantId, ...(status ? { status } : {}) },
      include: { vehicle: { select: { brand: true, model: true } }, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' } });
  }
  async createApplication(tenantId: string, input: unknown) {
    const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    const email = String(b.email ?? '').trim().toLowerCase();
    if (!name || name.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 250)
      throw new BadRequestException('Valid name and email required');
    const vehicleId = b.vehicleId ? String(b.vehicleId) : undefined;
    const clientId = b.clientId ? String(b.clientId) : undefined;
    if (vehicleId && !await this.prisma.kabinVehicle.findFirst({ where: { id: vehicleId, tenantId } }))
      throw new BadRequestException('Unknown vehicle');
    if (clientId && !await this.prisma.client.findFirst({ where: { id: clientId, tenantId } }))
      throw new BadRequestException('Unknown client');
    const amountMxn = b.amountMxn == null ? undefined : Number(b.amountMxn);
    const downPercent = b.downPercent == null ? undefined : Number(b.downPercent);
    const termMonths = b.termMonths == null ? undefined : Number(b.termMonths);
    const annualRate = b.annualRate == null ? undefined : Number(b.annualRate);
    if (amountMxn !== undefined && (!Number.isFinite(amountMxn) || amountMxn < 0 || amountMxn > 1000000000) ||
        downPercent !== undefined && (!Number.isInteger(downPercent) || downPercent < 0 || downPercent > 100) ||
        termMonths !== undefined && (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) ||
        annualRate !== undefined && (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 100))
      throw new BadRequestException('Invalid financing scenario');
    const bounded = (key: string, max: number) => b[key] == null ? undefined : String(b[key]).slice(0, max);
    return this.prisma.kabinApplication.create({ data: { tenantId, name, email, clientId, vehicleId,
      phone: bounded('phone', 40), company: bounded('company', 160), message: bounded('message', 3000),
      amountMxn, downPercent, termMonths, annualRate } });
  }
  async updateStatus(tenantId: string, id: string, input: unknown) {
    const status = (input as { status?: unknown })?.status;
    if (typeof status !== 'string' || !applicationStatuses.includes(status)) throw new BadRequestException('Invalid status');
    const application = await this.prisma.kabinApplication.findFirst({ where: { id, tenantId } });
    if (!application) throw new NotFoundException();
    return this.prisma.kabinApplication.update({ where: { id }, data: { status } });
  }
}
