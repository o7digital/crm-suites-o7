import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: RequestUser) {
    return this.prisma.product.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateProductDto, user: RequestUser) {
    await this.ensureAdmin(user);
    return this.prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: (dto.currency ?? 'USD').toUpperCase(),
        isActive: dto.isActive ?? true,
        tenantId: user.tenantId,
      },
    });
  }

  async update(id: string, dto: UpdateProductDto, user: RequestUser) {
    await this.ensureAdmin(user);
    await this.ensureBelongs(id, user);
    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        currency: dto.currency ? dto.currency.toUpperCase() : undefined,
      },
    });
  }

  async remove(id: string, user: RequestUser) {
    await this.ensureAdmin(user);
    await this.ensureBelongs(id, user);

    const used = await this.prisma.dealItem.count({ where: { productId: id, tenantId: user.tenantId } });
    if (used > 0) {
      throw new BadRequestException('Product is used in deals. Deactivate it instead.');
    }

    return this.prisma.product.delete({ where: { id } });
  }

  private async ensureBelongs(id: string, user: RequestUser) {
    const exists = await this.prisma.product.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Product not found');
  }

  private async ensureAdmin(user: RequestUser) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!dbUser) throw new NotFoundException('User not found');
    if (dbUser.role !== 'OWNER' && dbUser.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required');
    }
  }
}

