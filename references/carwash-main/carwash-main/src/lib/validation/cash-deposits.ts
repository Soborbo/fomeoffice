// Zod validation for cash deposit endpoints.

import { z } from 'zod';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format');

export const CreateCashDepositSchema = z.object({
  deposit_date: DateOnly,
  amount: z.coerce.number().int().positive().max(100_000_000), // £1m cap, pence
  reference: z.string().max(120).optional().or(z.literal('')),
  note: z.string().max(500).optional().or(z.literal('')),
});

export type CreateCashDepositInput = z.infer<typeof CreateCashDepositSchema>;

export const ListCashDepositsQuerySchema = z.object({
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});
