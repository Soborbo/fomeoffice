// Zod schemas for the damage reports API.

import { z } from 'zod';

export const DamageCategorySchema = z.enum([
  'scratch',
  'mirror_damage',
  'dent',
  'paint_damage',
  'wheel_damage',
  'interior_damage',
  'glass_damage',
  'other',
]);

export const ResolutionStatusSchema = z.enum([
  'open',
  'in_progress',
  'resolved',
  'escalated',
  'cancelled',
]);

const R2Key = z
  .string()
  .max(200)
  .regex(/^(receipts|damage|profile)\/\d+\/\d{8}-[0-9a-f-]{36}\.(webp|jpg|jpeg)$/i);

// occurred_at: ISO datetime — accept "YYYY-MM-DDTHH:mm" (datetime-local) and
// full ISO. The DB stores it as text.
const IsoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);

// Stricter validation as of 2025-05:
//   - categories: array of >= 1 distinct damage categories
//   - description: required, min 100 chars
//   - customer_name + customer_phone: required (the wash needs to be able to
//     reach the customer about any damage we caused)
//   - photo_r2_keys: required, at least one photo
//   - resolution: required (forces operators to write *something* — even a
//     "TBD" first pass — instead of leaving reports unaddressed)
export const CreateDamageSchema = z.object({
  occurred_at: IsoDateTime,
  worker_responsible: z.coerce.number().int().positive().optional().nullable(),
  categories: z
    .array(DamageCategorySchema)
    .min(1, 'Pick at least one category')
    .max(8),
  description: z
    .string()
    .min(100, 'Description must be at least 100 characters')
    .max(2000),
  customer_name: z.string().min(1, 'Customer name is required').max(120),
  customer_phone: z
    .string()
    .min(5, 'Customer phone is required')
    .max(40)
    .refine((v) => /\d/.test(v), 'Customer phone must contain digits'),
  vehicle_registration: z.string().max(20).optional().or(z.literal('')),
  photo_r2_keys: z
    .array(R2Key)
    .min(1, 'At least one photo is required')
    .max(10),
  resolution: z.string().min(1, 'Resolution is required').max(2000),
  resolution_status: ResolutionStatusSchema.optional(),
  compensation_amount: z.coerce.number().int().nonnegative().max(100_000_000).optional().nullable(),
});

export const UpdateDamageSchema = z.object({
  resolution: z.string().max(2000).optional().or(z.literal('')),
  resolution_status: ResolutionStatusSchema.optional(),
  compensation_amount: z.coerce.number().int().nonnegative().max(100_000_000).optional().nullable(),
  worker_responsible: z.coerce.number().int().positive().optional().nullable(),
});

export const ListDamageQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: ResolutionStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export type CreateDamageInput = z.infer<typeof CreateDamageSchema>;
export type UpdateDamageInput = z.infer<typeof UpdateDamageSchema>;
