import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { MovePostSalesCaseDto } from './dto/move-post-sales-case.dto';
import { UpdatePostSalesCaseDto } from './dto/update-post-sales-case.dto';

@Injectable()
export class PostSalesService {
  constructor(private prisma: PrismaService) {}

  private async getUserRole(user: RequestUser): Promise<'OWNER' | 'ADMIN' | 'MEMBER'> {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.userId, tenantId: user.tenantId },
      select: { role: true },
    });
    if (!dbUser) throw new NotFoundException('User not found');
    return dbUser.role;
  }

  private async ensurePostSalesAccess(user: RequestUser) {
    // Current workspace roles are OWNER/ADMIN/MEMBER.
    // Mapping to requested product roles:
    // - OWNER -> GERANT
    // - ADMIN -> ADMIN/OPERATIONS
    // - MEMBER -> SALES
    const role = await this.getUserRole(user);
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException('Post-Sales access denied');
    }
  }

  async findAll(user: RequestUser) {
    await this.ensurePostSalesAccess(user);
    return this.prisma.postSalesCase.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        client: { select: { id: true, firstName: true, name: true, company: true } },
        owner: { select: { id: true, name: true, email: true } },
        deal: { select: { id: true, title: true } },
      },
    });
  }

  async move(id: string, dto: MovePostSalesCaseDto, user: RequestUser) {
    await this.ensurePostSalesAccess(user);
    await this.ensureBelongs(id, user.tenantId);
    return this.prisma.postSalesCase.update({
      where: { id },
      data: { status: dto.status },
      include: {
        client: { select: { id: true, firstName: true, name: true, company: true } },
        owner: { select: { id: true, name: true, email: true } },
        deal: { select: { id: true, title: true } },
      },
    });
  }

  async update(id: string, dto: UpdatePostSalesCaseDto, user: RequestUser) {
    await this.ensurePostSalesAccess(user);
    await this.ensureBelongs(id, user.tenantId);

    if (dto.ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: dto.ownerUserId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!owner) {
        throw new NotFoundException('Owner user not found in workspace');
      }
    }

    const patch = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
    };

    return this.prisma.postSalesCase.update({
      where: { id },
      data: patch,
      include: {
        client: { select: { id: true, firstName: true, name: true, company: true } },
        owner: { select: { id: true, name: true, email: true } },
        deal: { select: { id: true, title: true } },
      },
    });
  }

  private async ensureBelongs(id: string, tenantId: string) {
    const exists = await this.prisma.postSalesCase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Post-Sales case not found');
  }
}
