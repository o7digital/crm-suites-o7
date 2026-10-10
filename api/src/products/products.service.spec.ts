import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';

const user = { tenantId: 'tenant-a', userId: 'admin' } as any;

describe('Product additional fields', () => {
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
        extraFields: [{ label: 'Size', value: 'XL' }],
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
