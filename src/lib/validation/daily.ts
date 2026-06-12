// Zod validation schemas for the daily reconciliation API.

import { z } from 'zod';

export const ShiftSchema = z.enum(['full', 'half', 'overtime']);

export const AttendanceEntrySchema = z.object({
  worker_id: z.coerce.number().int().positive(),
  shift: ShiftSchema,
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const DailySubmitSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  cash_total: z.coerce.number().int().nonnegative().max(10_000_000),
  card_total: z.coerce.number().int().nonnegative().max(10_000_000),
  cars_inside: z.coerce.number().int().nonnegative().max(10_000),
  cars_outside: z.coerce.number().int().nonnegative().max(10_000),
  notes: z.string().max(2000).optional().or(z.literal('')),
  attendance: z.array(AttendanceEntrySchema).max(50),
});

export type DailySubmitInput = z.infer<typeof DailySubmitSchema>;
export type AttendanceEntryInput = z.infer<typeof AttendanceEntrySchema>;
