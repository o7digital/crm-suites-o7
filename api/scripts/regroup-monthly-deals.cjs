const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const { monthlyWorkflow } = require('/app/dist/deals/monthly-workflow');
const p = new PrismaClient();
const pipelineId = process.argv[2];
const snapshotPath = process.argv[3];
if (!pipelineId || !snapshotPath)
  throw Error(
    'Usage: node regroup-monthly-deals.cjs <Post-Sale-pipeline-id> <private-snapshot-path>',
  );
(async () => {
  try {
    const pipe = await p.pipeline.findUnique({
      where: { id: pipelineId },
      include: { stages: true },
    });
    if (!pipe || pipe.name !== 'Post Sale')
      throw Error('Target workflow changed');
    const before = await p.deal.findMany({
      where: { tenantId: pipe.tenantId, recurrenceGroupId: { not: null } },
      orderBy: { id: 'asc' },
    });
    fs.writeFileSync(snapshotPath, JSON.stringify(before), { mode: 0o600 });
    let changed = 0;
    await p.$transaction(
      async (tx) => {
        await monthlyWorkflow(tx, pipe.tenantId, 12);
        await tx.$queryRaw`SELECT id FROM "Deal" WHERE "tenantId"=${pipe.tenantId} AND "recurrenceGroupId" IS NOT NULL FOR UPDATE`;
        for (const deal of before) {
          const stage = pipe.stages.find(
            (s) =>
              s.status === 'OPEN' &&
              new RegExp(
                '^' + deal.recurrenceMonths + '\\s*months?$',
                'i',
              ).test(s.name.trim()),
          );
          if (!stage) throw Error('Missing duration ' + deal.recurrenceMonths);
          if (deal.pipelineId !== pipe.id || deal.stageId !== stage.id) {
            await tx.dealStageHistory.create({
              data: {
                tenantId: pipe.tenantId,
                dealId: deal.id,
                fromStageId: deal.stageId,
                toStageId: stage.id,
              },
            });
            await tx.deal.update({
              where: { id: deal.id },
              data: {
                pipelineId: pipe.id,
                stageId: stage.id,
                ...(deal.recurrenceIndex === 1
                  ? { recurrenceStageId: stage.id }
                  : {}),
              },
            });
            changed++;
          }
        }
      },
      { timeout: 30000 },
    );
    const after = await p.deal.findMany({
      where: { tenantId: pipe.tenantId, recurrenceGroupId: { not: null } },
      orderBy: { id: 'asc' },
    });
    for (let i = 0; i < before.length; i++) {
      const a = after[i],
        b = before[i];
      for (const key of [
        'id',
        'title',
        'value',
        'currency',
        'status',
        'closedAt',
        'recurrenceGroupId',
        'recurrenceIndex',
        'recurrenceMonths',
        'recurrenceStartAt',
        'recurrenceGeneratedThrough',
        'clientId',
        'ownerId',
      ]) {
        if (JSON.stringify(a[key]) !== JSON.stringify(b[key]))
          throw Error('Preserved field mismatch ' + key);
      }
      if (a.pipelineId !== pipe.id) throw Error('Not centralized');
    }
    console.log(
      JSON.stringify({
        regrouped: changed,
        totalMonthly: after.length,
        wonPreserved: after.filter((d) => d.status === 'WON').length,
        pipelineId,
      }),
    );
  } finally {
    await p.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
