// Zod validation for the expense API.

import { z } from 'zod';

export const ExpenseCategorySchema = z.enum([
  'staff',
  'supplies',
  'utilities',
  'equipment',
  'food',
  'rent',
  'maintenance',
  'marketing',
  'other',
]);

export const ExpenseMethodSchema = z.enum(['cash', 'card', 'bank_transfer']);
export const StaffPaymentMethodSchema = z.enum([
  'cash',
  'bank_transfer',
  'cheque',
]);

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format');

const R2Key = z
  .string()
  .max(200)
  .regex(/^(receipts|damage|profile)\/\d+\/\d{8}-[0-9a-f-]{36}\.(webp|jpg|jpeg)$/i);

const BaseExpense = z.object({
  date: DateOnly,
  amount: z.coerce.number().int().positive().max(100_000_000), // £1m cap, pence
  expense_method: ExpenseMethodSchema,
  description: z.string().max(500).optional().or(z.literal('')),
  vendor: z.string().max(120).optional().or(z.literal('')),
  vat_amount: z.coerce.number().int().nonnegative().max(100_000_000).optional().default(0),
  vat_rate: z.coerce.number().int().nonnegative().max(100).optional().default(0),
  receipt_r2_key: R2Key.optional().or(z.literal('')),
});

const NonStaffExpense = BaseExpense.extend({
  category: z.enum([
    'supplies',
    'utilities',
    'equipment',
    'food',
    'rent',
    'maintenance',
    'marketing',
    'other',
  ]),
});

const StaffExpense = BaseExpense.extend({
  category: z.literal('staff'),
  worker_id: z.coerce.number().int().positive(),
  payment_method: StaffPaymentMethodSchema,
  covers_period_start: DateOnly.optional().or(z.literal('')),
  covers_period_end: DateOnly.optional().or(z.literal('')),
});

export const CreateExpenseSchema = z.discriminatedUnion('category', [
  NonStaffExpense.extend({ category: z.literal('supplies') }),
  NonStaffExpense.extend({ category: z.literal('utilities') }),
  NonStaffExpense.extend({ category: z.literal('equipment') }),
  NonStaffExpense.extend({ category: z.literal('food') }),
  NonStaffExpense.extend({ category: z.literal('rent') }),
  NonStaffExpense.extend({ category: z.literal('maintenance') }),
  NonStaffExpense.extend({ category: z.literal('marketing') }),
  NonStaffExpense.extend({ category: z.literal('other') }),
  StaffExpense,
]);

export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export const ListExpensesQuerySchema = z.object({
  from: DateOnly.optional(),
  to: DateOnly.optional(),
  category: ExpenseCategorySchema.optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});
