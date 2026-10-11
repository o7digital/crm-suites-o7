import { Prisma } from '@prisma/client';

export const MONTHLY_DURATIONS = [12, 24, 36, 48, 60, 72];

// Serialize setup per tenant so simultaneous conversions share one workflow.
export async function monthlyWorkflow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  months: number,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext('monthly-post-sale'))`;
  let pipeline = await tx.pipeline.findFirst({
    where: { tenantId, name: { equals: 'Post Sale', mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });
  if (!pipeline)
    pipeline = await tx.pipeline.create({
      data: { tenantId, name: 'Post Sale' },
    });
  const stages = await tx.stage.findMany({
    where: { tenantId, pipelineId: pipeline.id },
    orderBy: { position: 'asc' },
  });
  let position = Math.max(0, ...stages.map((stage) => stage.position));
  for (const duration of [...new Set([...MONTHLY_DURATIONS, months])]) {
    let stage = stages.find(
      (item) =>
        item.status === 'OPEN' &&
        new RegExp(`^${duration}\\s*(months?|mois|meses?)$`, 'i').test(
          item.name.trim(),
        ),
    );
    if (!stage) {
      stage = await tx.stage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          name: `${duration} months`,
          position: ++position,
          status: 'OPEN',
          probability: 0.5,
        },
      });
      stages.push(stage);
    }
  }
  // Closed stages stay out of the monthly Kanban columns but support WIN/LOST.
  for (const status of ['WON', 'LOST'] as const) {
    if (!stages.some((stage) => stage.status === status)) {
      await tx.stage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          name: status === 'WON' ? 'Won' : 'Lost',
          position: ++position,
          status,
          probability: status === 'WON' ? 1 : 0,
        },
      });
    }
  }
  const stage = stages.find(
    (item) =>
      item.status === 'OPEN' &&
      new RegExp(`^${months}\\s*(months?|mois|meses?)$`, 'i').test(
        item.name.trim(),
      ),
  )!;
  return { pipelineId: pipeline.id, stageId: stage.id };
}
