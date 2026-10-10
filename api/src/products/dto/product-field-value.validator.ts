import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export const PRODUCT_FIELD_TYPES = ['text', 'number', 'date', 'select', 'boolean'] as const;
export type ProductFieldType = (typeof PRODUCT_FIELD_TYPES)[number];

@ValidatorConstraint({ name: 'productFieldValue', async: false })
export class ProductFieldValueValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (typeof value !== 'string') return false;
    const field = args.object as { type?: ProductFieldType; options?: unknown };
    if (field.type === 'select') {
      if (!Array.isArray(field.options) || field.options.length === 0) return false;
      return value === '' || field.options.includes(value);
    }
    if (value === '') return true;
    if (field.type === 'number') {
      return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
    }
    if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    if (field.type === 'boolean') return value === 'true' || value === 'false';
    return true;
  }

  defaultMessage() {
    return 'Additional field value must match its type; dropdown fields need choices and a value from those choices.';
  }
}
