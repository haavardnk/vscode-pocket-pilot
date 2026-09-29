import { z } from 'zod';

import { branchQuerySchema, branchResultSchema } from './branches.ts';
import { codeQuerySchema, codeResultSchema } from './code.ts';
import { imageQuerySchema, imageResultSchema } from './images.ts';
import { windowQuerySchema, windowResultSchema } from './windows.ts';

export const querySchema = z.discriminatedUnion('kind', [
  ...codeQuerySchema.options,
  windowQuerySchema,
  branchQuerySchema,
  imageQuerySchema
]);

export const queryResultSchema = z.discriminatedUnion('kind', [
  ...codeResultSchema.options,
  windowResultSchema,
  branchResultSchema,
  imageResultSchema
]);

export type Query = z.infer<typeof querySchema>;
export type QueryResult = z.infer<typeof queryResultSchema>;
export type QueryResultFor<K extends Query['kind']> = Extract<QueryResult, { kind: K }>;
