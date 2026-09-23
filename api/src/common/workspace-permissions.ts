import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './user.decorator';

export async function requireWorkspaceAdmin(prisma: PrismaService, user: RequestUser) {
  const member = await prisma.user.findFirst({
    where: { id: user.userId, tenantId: user.tenantId },
    select: { role: true },
  });
  if (member?.role !== 'OWNER' && member?.role !== 'ADMIN') {
    throw new ForbiddenException('Admin access required');
  }
}
