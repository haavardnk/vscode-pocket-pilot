import { z } from 'zod';

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BASE64 = 2_800_000;
export const UPLOAD_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;
export const SHOWN_IMAGE_TYPES = [...UPLOAD_IMAGE_TYPES, 'image/webp', 'image/gif'] as const;

export const imageUploadSchema = z.object({
  mimeType: z.enum(UPLOAD_IMAGE_TYPES),
  data: z.base64().min(1).max(MAX_IMAGE_BASE64)
});

export const imageUploadsSchema = z.array(imageUploadSchema).max(MAX_IMAGES);

export const requestImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.enum(SHOWN_IMAGE_TYPES)
});

export const imageQuerySchema = z.object({
  kind: z.literal('requestImage'),
  windowId: z.string(),
  sessionId: z.string(),
  requestId: z.string(),
  imageId: z.string()
});

export const imageResultSchema = z.object({
  kind: z.literal('requestImage'),
  mimeType: z.enum(SHOWN_IMAGE_TYPES),
  data: z.string()
});

export type ImageUpload = z.infer<typeof imageUploadSchema>;
export type RequestImage = z.infer<typeof requestImageSchema>;
export type ShownImageType = RequestImage['mimeType'];
export type ImageQuery = z.infer<typeof imageQuerySchema>;
export type ImageResult = z.infer<typeof imageResultSchema>;
