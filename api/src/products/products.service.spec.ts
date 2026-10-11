import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

const user = { tenantId: 'tenant-a', userId: 'admin' } as any;

describe('Product additional fields', () => {
  it('validates standard product type and periodicity', async () => {
    expect(
      await validate(
        plainToInstance(CreateProductDto, { name: 'Pulse', productType: 'Subscription', periodicity: 'Monthly' }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(CreateProductDto, { name: 'Pulse', productType: 'invalid', periodicity: 'invalid' }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it('rejects null standard fields on updates while preserving optional price clearing', async () => {
    expect(
      (await validate(plainToInstance(UpdateProductDto, { productType: null, periodicity: null }))).length,
    ).toBeGreaterThan(0);
    expect(await validate(plainToInstance(UpdateProductDto, { price: null }))).toHaveLength(0);
  });

  it('accepts legacy text fields and validates typed values and dropdown choices', async () => {
    const valid = [
      { label: 'Legacy', value: 'anything' },
      { label: 'Seats', type: 'number', value: '12.5' },
      { label: 'Renewal', type: 'date', value: '2028-02-29' },
      { label: 'Edition', type: 'select', options: ['Basic', 'Premium'], value: 'Basic' },
      { label: 'Enabled', type: 'boolean', value: 'false' },
      { label: 'Optional date', type: 'date', value: '' },
    ];
    const invalid = [
      { label: 'Number', type: 'number', value: 'abc' },
      { label: 'Number', type: 'number', value: 'Infinity' },
      { label: 'Date', type: 'date', value: '2026-02-29' },
      { label: 'Date', type: 'date', value: '2026-04-31' },
      { label: 'Edition', type: 'select', options: ['Basic'], value: 'Premium' },
      { label: 'Edition', type: 'select', options: [], value: '' },
      { label: 'Edition', type: 'select', options: ['Basic', ' Basic '], value: '' },
      { label: 'Enabled', type: 'boolean', value: 'yes' },
      { label: 'Type', type: 'unknown', value: '' },
    ];
    for (const field of valid)
      expect(await validate(plainToInstance(CreateProductDto, { name: 'Test', extraFields: [field] }))).toHaveLength(0);
    for (const field of invalid)
      expect(
        (await validate(plainToInstance(CreateProductDto, { name: 'Test', extraFields: [field] }))).length,
      ).toBeGreaterThan(0);
  });

  it('keeps dropdown definitions when saving and editing a product', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 'product' }), create: jest.fn(), update: jest.fn() },
    };
    const service = new ProductsService(prisma as any);
    const field = { label: 'Edition', type: 'select' as const, options: ['Basic', 'Premium'], value: 'Premium' };
    await service.create(
      { name: 'Olivia', productType: 'Subscription', periodicity: 'Monthly', extraFields: [field] },
      user,
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        extraFields: [field],
        tenantId: user.tenantId,
        productType: 'Subscription',
        periodicity: 'Monthly',
      }),
    });
    await service.update('product', { extraFields: [field] }, user);
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product' },
      data: expect.objectContaining({ extraFields: [field] }),
    });
  });

  it('rejects blank labels, non-string values and excessive fields', async () => {
    for (const extraFields of [
      [{ label: ' ', value: 'ok' }],
      [{ label: 'Size', value: 42 }],
      Array.from({ length: 31 }, () => ({ label: 'Size', value: '' })),
    ]) {
      const dto = plainToInstance(CreateProductDto, {
        name: 'Product',
        extraFields,
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });

  it('persists fields and allows clearing them without affecting other tenants', async () => {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'product' }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new ProductsService(prisma as any);
    await service.create({ name: 'Product', extraFields: [{ label: 'Size', value: 'XL' }] }, user);
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: user.tenantId,
        extraFields: [{ label: 'Size', value: 'XL', type: 'text' }],
        productType: 'Product',
        periodicity: 'One-time',
      }),
    });
    await service.update('product', { extraFields: [] }, user);
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'product', tenantId: user.tenantId },
      }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product' },
      data: expect.objectContaining({ extraFields: [] }),
    });
  });
});
