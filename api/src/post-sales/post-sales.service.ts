import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/user.decorator';
import { MovePostSalesCaseDto } from './dto/move-post-sales-case.dto';
import { UpdatePostSalesCaseDto } from './dto/update-post-sales-case.dto';

@Injectable()
export class PostSalesService {
  constructor(private prisma: PrismaService) {}

  private readonly caseInclude = {
    client: { select: { id: true, firstName: true, name: true, company: true } },
    owner: { select: { id: true, name: true, email: true } },
    deal: { select: { id: true, title: true } },
  } as const;

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
    await this.backfillWonDealsForTenant(user);

    return this.prisma.postSalesCase.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: this.caseInclude,
    });
  }

  async backfillWonDeals(user: RequestUser) {
    await this.ensurePostSalesAccess(user);
    return this.backfillWonDealsForTenant(user);
  }

  async move(id: string, dto: MovePostSalesCaseDto, user: RequestUser) {
    await this.ensurePostSalesAccess(user);
    await this.ensureBelongs(id, user.tenantId);
    return this.prisma.postSalesCase.update({
      where: { id },
      data: { status: dto.status },
      include: this.caseInclude,
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
      include: this.caseInclude,
    });
  }

  private async backfillWonDealsForTenant(user: RequestUser) {
    const wonDeals = await this.prisma.deal.findMany({
      where: {
        tenantId: user.tenantId,
        stage: { status: 'WON' },
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        ownerId: true,
      },
    });

    if (!wonDeals.length) {
      return { wonDeals: 0, created: 0 };
    }

    const existingCases = await this.prisma.postSalesCase.findMany({
      where: {
        tenantId: user.tenantId,
        dealId: { in: wonDeals.map((deal) => deal.id) },
      },
      select: { dealId: true },
    });
    const existingDealIds = new Set(existingCases.map((item) => item.dealId).filter(Boolean));

    const missing = wonDeals.filter((deal) => !existingDealIds.has(deal.id));
    if (!missing.length) {
      return { wonDeals: wonDeals.length, created: 0 };
    }

    const created = await this.prisma.postSalesCase.createMany({
      data: missing.map((deal) => ({
        tenantId: user.tenantId,
        clientId: deal.clientId ?? null,
        dealId: deal.id,
        name: deal.title,
        status: 'onboarding',
        priority: 'medium',
        ownerUserId: deal.ownerId ?? user.userId,
      })),
      skipDuplicates: true,
    });

    return { wonDeals: wonDeals.length, created: created.count };
  }

  private async ensureBelongs(id: string, tenantId: string) {
    const exists = await this.prisma.postSalesCase.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Post-Sales case not found');
  }
}
