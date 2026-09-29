import { z } from 'zod';

import { branchQuerySchema, branchResultSchema } from './branches.ts';
import { codeQuerySchema, codeResultSchema } from './code.ts';
import { windowQuerySchema, windowResultSchema } from './windows.ts';

export const querySchema = z.discriminatedUnion('kind', [
  ...codeQuerySchema.options,
  windowQuerySchema,
  branchQuerySchema
]);

export const queryResultSchema = z.discriminatedUnion('kind', [
  ...codeResultSchema.options,
  windowResultSchema,
  branchResultSchema
]);

export type Query = z.infer<typeof querySchema>;
export type QueryResult = z.infer<typeof queryResultSchema>;
export type QueryResultFor<K extends Query['kind']> = Extract<QueryResult, { kind: K }>;
