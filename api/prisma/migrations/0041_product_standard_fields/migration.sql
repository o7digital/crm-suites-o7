BEGIN;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "productType" TEXT NOT NULL DEFAULT 'Product';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "periodicity" TEXT NOT NULL DEFAULT 'One-time';
-- Move the former standard dropdown values out of additional fields without losing custom values.
UPDATE "Product" p SET
  "productType" = COALESCE((SELECT f->>'value' FROM jsonb_array_elements(p."extraFields") f WHERE lower(trim(f->>'label')) = 'type' AND f->>'type' = 'select' AND f->>'value' IN ('Product','Service','Rental','Subscription') LIMIT 1), p."productType"),
  "periodicity" = COALESCE((SELECT f->>'value' FROM jsonb_array_elements(p."extraFields") f WHERE lower(trim(f->>'label')) = 'periodicity' AND f->>'type' = 'select' AND f->>'value' IN ('One-time','Monthly','Quarterly','Yearly') LIMIT 1), p."periodicity"),
  "extraFields" = COALESCE((SELECT jsonb_agg(f ORDER BY position) FROM jsonb_array_elements(p."extraFields") WITH ORDINALITY AS fields(f, position) WHERE NOT COALESCE(f->>'type' = 'select' AND ((lower(trim(f->>'label')) = 'type' AND (f->>'value' IN ('Product','Service','Rental','Subscription') OR (f->>'value' = '' AND f->'options' = '["Product","Service","Rental","Subscription"]'::jsonb))) OR (lower(trim(f->>'label')) = 'periodicity' AND (f->>'value' IN ('One-time','Monthly','Quarterly','Yearly') OR (f->>'value' = '' AND f->'options' = '["One-time","Monthly","Quarterly","Yearly"]'::jsonb)))), false)), '[]'::jsonb)
WHERE jsonb_typeof(p."extraFields") = 'array';
COMMIT;
