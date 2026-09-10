import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO = {
  tenantName: 'Nebula Fitness Group (Demo)',
  owner: {
    email: 'demo.owner@o7-demo.local',
    name: 'Camille Rivera',
    password: 'DemoCRM2026!',
  },
  admin: {
    email: 'demo.admin@o7-demo.local',
    name: 'Leo Martin',
    password: 'DemoCRM2026!',
  },
  member: {
    email: 'demo.member@o7-demo.local',
    name: 'Sofia Duarte',
    password: 'DemoCRM2026!',
  },
};

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

async function ensureDemoTenant() {
  const ownerHash = await bcrypt.hash(DEMO.owner.password, 10);

  const existingOwner = await prisma.user.findUnique({
    where: { email: DEMO.owner.email },
    select: { id: true, tenantId: true },
  });

  if (existingOwner) {
    await prisma.user.update({
      where: { email: DEMO.owner.email },
      data: {
        name: DEMO.owner.name,
        password: ownerHash,
        role: 'OWNER',
        firstLoginAt: existingOwner.id ? new Date() : undefined,
        lastLoginAt: new Date(),
      },
    });
    await prisma.tenant.update({
      where: { id: existingOwner.tenantId },
      data: {
        name: DEMO.tenantName,
        crmDisplayCurrency: 'MXN',
      },
    });
    return existingOwner.tenantId;
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: DEMO.tenantName,
      crmDisplayCurrency: 'MXN',
      users: {
        create: {
          email: DEMO.owner.email,
          name: DEMO.owner.name,
          password: ownerHash,
          role: 'OWNER',
          firstLoginAt: new Date(),
          lastLoginAt: new Date(),
        },
      },
    },
  });

  return tenant.id;
}

async function ensureUser(tenantId, user, role) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const existing = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });

  if (existing) {
    return prisma.user.update({
      where: { email: user.email },
      data: {
        tenantId,
        name: user.name,
        password: passwordHash,
        role,
        lastLoginAt: new Date(),
      },
    });
  }

  return prisma.user.create({
    data: {
      tenantId,
      email: user.email,
      name: user.name,
      password: passwordHash,
      role,
      firstLoginAt: new Date(),
      lastLoginAt: new Date(),
    },
  });
}

async function ensurePipeline(tenantId, name, isDefault, stageTemplates) {
  const pipeline =
    (await prisma.pipeline.findFirst({
      where: { tenantId, name },
      orderBy: { createdAt: 'asc' },
    })) ||
    (await prisma.pipeline.create({
      data: { tenantId, name, isDefault },
    }));

  if (pipeline.isDefault !== isDefault) {
    await prisma.pipeline.update({
      where: { id: pipeline.id },
      data: { isDefault },
    });
  }

  for (const stage of stageTemplates) {
    const existingStage = await prisma.stage.findFirst({
      where: { tenantId, pipelineId: pipeline.id, name: stage.name },
      select: { id: true },
    });

    if (existingStage) {
      await prisma.stage.update({
        where: { id: existingStage.id },
        data: {
          position: stage.position,
          probability: stage.probability,
          status: stage.status,
        },
      });
    } else {
      await prisma.stage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          name: stage.name,
          position: stage.position,
          probability: stage.probability,
          status: stage.status,
        },
      });
    }
  }

  return pipeline;
}

async function ensureClient(tenantId, ownerId, data) {
  const existing = await prisma.client.findFirst({
    where: { tenantId, email: data.email },
    select: { id: true },
  });

  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        firstName: data.firstName,
        function: data.function,
        clientStatus: data.clientStatus,
        company: data.company,
        companySector: data.companySector,
        website: data.website,
        phone: data.phone,
        address: data.address,
        ownerUserId: ownerId,
        notes: data.notes,
      },
    });
  }

  return prisma.client.create({
    data: {
      tenantId,
      ownerUserId: ownerId,
      ...data,
    },
  });
}

async function ensureProduct(tenantId, data) {
  const existing = await prisma.product.findFirst({
    where: { tenantId, name: data.name },
    select: { id: true },
  });

  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.product.create({ data: { tenantId, ...data } });
}

async function ensureDeal(tenantId, ownerId, pipelineId, stageId, clientId, data) {
  const existing = await prisma.deal.findFirst({
    where: { tenantId, title: data.title },
    select: { id: true },
  });

  if (existing) {
    return prisma.deal.update({
      where: { id: existing.id },
      data: {
        ...data,
        ownerId,
        clientId,
        pipelineId,
        stageId,
      },
    });
  }

  return prisma.deal.create({
    data: {
      ...data,
      tenantId,
      ownerId,
      clientId,
      pipelineId,
      stageId,
    },
  });
}

async function ensureTask(tenantId, clientId, postSalesCaseId, data) {
  const existing = await prisma.task.findFirst({
    where: { tenantId, clientId, title: data.title },
    select: { id: true },
  });

  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        ...data,
        clientId,
        postSalesCaseId,
      },
    });
  }

  return prisma.task.create({
    data: {
      ...data,
      tenantId,
      clientId,
      postSalesCaseId,
    },
  });
}

async function ensureInvoice(tenantId, clientId, data) {
  const existing = await prisma.invoice.findFirst({
    where: { tenantId, filePath: data.filePath },
    select: { id: true },
  });

  if (existing) {
    return prisma.invoice.update({
      where: { id: existing.id },
      data: {
        ...data,
        clientId,
      },
    });
  }

  return prisma.invoice.create({
    data: {
      ...data,
      tenantId,
      clientId,
    },
  });
}

async function main() {
  const tenantId = await ensureDemoTenant();

  const [adminUser, memberUser] = await Promise.all([
    ensureUser(tenantId, DEMO.admin, 'ADMIN'),
    ensureUser(tenantId, DEMO.member, 'MEMBER'),
  ]);

  const ownerUser = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO.owner.email },
    select: { id: true },
  });

  const newSales = await ensurePipeline(tenantId, 'New Sales', true, [
    { name: 'Lead', position: 1, probability: 0.1, status: 'OPEN' },
    { name: 'Qualified', position: 2, probability: 0.3, status: 'OPEN' },
    { name: 'Proposal', position: 3, probability: 0.5, status: 'OPEN' },
    { name: 'Negotiation', position: 4, probability: 0.7, status: 'OPEN' },
    { name: 'Verbal yes', position: 5, probability: 0.9, status: 'OPEN' },
    { name: 'Contract', position: 6, probability: 0.95, status: 'OPEN' },
    { name: 'Won', position: 7, probability: 1.0, status: 'WON' },
    { name: 'Lost', position: 8, probability: 0.0, status: 'LOST' },
  ]);

  await ensurePipeline(tenantId, 'Post Sales', false, [
    { name: 'INVOICE Customer', position: 1, probability: 1.0, status: 'OPEN' },
    { name: 'TRANSFER PAYMENT', position: 2, probability: 1.0, status: 'OPEN' },
  ]);

  await ensurePipeline(tenantId, 'B2C', false, [
    { name: 'Lead', position: 1, probability: 0.1, status: 'OPEN' },
    { name: 'Qualified', position: 2, probability: 0.3, status: 'OPEN' },
    { name: 'Offer', position: 3, probability: 0.5, status: 'OPEN' },
    { name: 'Checkout', position: 4, probability: 0.7, status: 'OPEN' },
    { name: 'Won', position: 5, probability: 1.0, status: 'WON' },
    { name: 'Lost', position: 6, probability: 0.0, status: 'LOST' },
  ]);

  const [leadStage, proposalStage, wonStage] = await Promise.all([
    prisma.stage.findFirstOrThrow({
      where: { tenantId, pipelineId: newSales.id, name: 'Lead' },
      select: { id: true },
    }),
    prisma.stage.findFirstOrThrow({
      where: { tenantId, pipelineId: newSales.id, name: 'Proposal' },
      select: { id: true },
    }),
    prisma.stage.findFirstOrThrow({
      where: { tenantId, pipelineId: newSales.id, name: 'Won' },
      select: { id: true },
    }),
  ]);

  const [clientA, clientB, clientC] = await Promise.all([
    ensureClient(tenantId, ownerUser.id, {
      firstName: 'Nora',
      name: 'Nora Velasquez',
      function: 'CEO',
      companySector: 'Health & Wellness',
      clientStatus: 'LEAD',
      email: 'nora@aurorafit.example',
      phone: '+52 55 1000 2001',
      company: 'Aurora Fit Studio',
      website: 'https://aurorafit.example',
      address: 'Polanco, CDMX',
      notes: 'Prospect warm from partner referral.',
    }),
    ensureClient(tenantId, adminUser.id, {
      firstName: 'Diego',
      name: 'Diego Ramos',
      function: 'Operations Director',
      companySector: 'Retail',
      clientStatus: 'PROSPECT',
      email: 'diego@tiendaorbita.example',
      phone: '+52 55 1000 2002',
      company: 'Tienda Orbita',
      website: 'https://tiendaorbita.example',
      address: 'Monterrey, NL',
      notes: 'Needs CRM + invoicing bundle.',
    }),
    ensureClient(tenantId, memberUser.id, {
      firstName: 'Eva',
      name: 'Eva Contreras',
      function: 'Founder',
      companySector: 'EdTech',
      clientStatus: 'CLIENT',
      email: 'eva@aprendemax.example',
      phone: '+52 55 1000 2003',
      company: 'AprendeMax',
      website: 'https://aprendemax.example',
      address: 'Guadalajara, JAL',
      notes: 'Active customer, candidate for upsell.',
    }),
  ]);

  const [productA, productB, productC] = await Promise.all([
    ensureProduct(tenantId, {
      name: 'CRM Core Annual',
      description: 'Core CRM license per company (annual)',
      price: '18000',
      currency: 'MXN',
      isActive: true,
    }),
    ensureProduct(tenantId, {
      name: 'Automation Add-on',
      description: 'Automated reminders and playbooks',
      price: '6500',
      currency: 'MXN',
      isActive: true,
    }),
    ensureProduct(tenantId, {
      name: 'Onboarding Concierge',
      description: 'Post-sales onboarding package',
      price: '9500',
      currency: 'MXN',
      isActive: true,
    }),
  ]);

  const [deal1, deal2, deal3] = await Promise.all([
    ensureDeal(tenantId, ownerUser.id, newSales.id, leadStage.id, clientA.id, {
      title: 'Aurora Fit - Discovery',
      value: '120000',
      currency: 'MXN',
      probability: 0.25,
      expectedCloseDate: daysFromNow(20),
    }),
    ensureDeal(tenantId, adminUser.id, newSales.id, proposalStage.id, clientB.id, {
      title: 'Orbita Retail - Proposal Q4',
      value: '240000',
      currency: 'MXN',
      probability: 0.55,
      expectedCloseDate: daysFromNow(35),
    }),
    ensureDeal(tenantId, memberUser.id, newSales.id, wonStage.id, clientC.id, {
      title: 'AprendeMax - Expansion',
      value: '98000',
      currency: 'MXN',
      probability: 1,
      expectedCloseDate: daysFromNow(-4),
    }),
  ]);

  const dealItems = [
    { deal: deal1, product: productA, quantity: 1, unitPrice: '18000' },
    { deal: deal2, product: productA, quantity: 1, unitPrice: '18000' },
    { deal: deal2, product: productB, quantity: 1, unitPrice: '6500' },
    { deal: deal3, product: productA, quantity: 1, unitPrice: '18000' },
    { deal: deal3, product: productC, quantity: 1, unitPrice: '9500' },
  ];

  for (const item of dealItems) {
    await prisma.dealItem.upsert({
      where: {
        dealId_productId: {
          dealId: item.deal.id,
          productId: item.product.id,
        },
      },
      update: { quantity: item.quantity, unitPrice: item.unitPrice, tenantId },
      create: {
        tenantId,
        dealId: item.deal.id,
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      },
    });
  }

  const postSalesCase = await prisma.postSalesCase.upsert({
    where: { dealId: deal3.id },
    update: {
      tenantId,
      clientId: clientC.id,
      name: 'Onboarding AprendeMax',
      ownerUserId: memberUser.id,
      status: 'in_progress',
      priority: 'high',
      dueDate: daysFromNow(12),
    },
    create: {
      tenantId,
      clientId: clientC.id,
      dealId: deal3.id,
      name: 'Onboarding AprendeMax',
      ownerUserId: memberUser.id,
      status: 'in_progress',
      priority: 'high',
      dueDate: daysFromNow(12),
    },
  });

  await Promise.all([
    ensureTask(tenantId, clientA.id, null, {
      title: 'Call de qualification avec Aurora Fit',
      status: 'PENDING',
      dueDate: daysFromNow(2),
      timeSpentHours: '0',
      amount: '0',
      currency: 'MXN',
    }),
    ensureTask(tenantId, clientB.id, null, {
      title: 'Envoyer proposition commerciale Orbita',
      status: 'IN_PROGRESS',
      dueDate: daysFromNow(3),
      timeSpentHours: '1.5',
      amount: '0',
      currency: 'MXN',
    }),
    ensureTask(tenantId, clientC.id, postSalesCase.id, {
      title: 'Kick-off onboarding AprendeMax',
      status: 'DONE',
      dueDate: daysFromNow(-1),
      timeSpentHours: '2',
      amount: '4500',
      currency: 'MXN',
    }),
    ensureTask(tenantId, clientC.id, postSalesCase.id, {
      title: 'Importer base clients historique',
      status: 'IN_PROGRESS',
      dueDate: daysFromNow(5),
      timeSpentHours: '3',
      amount: '3000',
      currency: 'MXN',
    }),
  ]);

  await Promise.all([
    ensureInvoice(tenantId, clientC.id, {
      amount: '28500',
      currency: 'MXN',
      status: 'READY',
      filePath: 'demo/invoices/aprendemax-2026-08.pdf',
      issuedDate: daysFromNow(-3),
      dueDate: daysFromNow(12),
      extractedRaw: {
        source: 'demo-seed',
        invoiceNumber: 'AMX-2026-0811',
        note: 'Fictive invoice for demo only',
      },
    }),
    ensureInvoice(tenantId, clientB.id, {
      amount: '18000',
      currency: 'MXN',
      status: 'PROCESSING',
      filePath: 'demo/invoices/orbita-2026-09-proforma.pdf',
      issuedDate: daysFromNow(-1),
      dueDate: daysFromNow(14),
      extractedRaw: {
        source: 'demo-seed',
        invoiceNumber: 'ORB-2026-0902',
        note: 'Fictive invoice for demo only',
      },
    }),
  ]);

  console.log('\nDemo CRM data is ready.');
  console.log(`Tenant: ${DEMO.tenantName}`);
  console.log('Login accounts:');
  console.log(`- OWNER  : ${DEMO.owner.email} / ${DEMO.owner.password}`);
  console.log(`- ADMIN  : ${DEMO.admin.email} / ${DEMO.admin.password}`);
  console.log(`- MEMBER : ${DEMO.member.email} / ${DEMO.member.password}`);
  console.log('All data above is fictitious and safe for product demos.\n');
}

main()
  .catch((error) => {
    console.error('Demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });