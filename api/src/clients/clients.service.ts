import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { RequestUser } from '../common/user.decorator';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateClientDto, user: RequestUser) {
    return this.prisma.client.create({
      data: { ...dto, tenantId: user.tenantId },
    });
  }

  async findAll(user: RequestUser) {
    return this.prisma.client.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(id: string, dto: UpdateClientDto, user: RequestUser) {
    await this.ensureBelongs(id, user);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureBelongs(id, user);
    await this.prisma.task.deleteMany({ where: { clientId: id, tenantId: user.tenantId } });
    await this.prisma.invoice.deleteMany({ where: { clientId: id, tenantId: user.tenantId } });
    return this.prisma.client.delete({ where: { id } });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.client.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!exists) throw new NotFoundException('Client not found');
  }
}
