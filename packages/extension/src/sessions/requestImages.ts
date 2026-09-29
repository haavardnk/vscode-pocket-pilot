import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  type ImageResult,
  type RequestImage,
  SHOWN_IMAGE_TYPES,
  type ShownImageType
} from '@pocket-pilot/protocol';

import { asArray, asRecord, asString, type JsonRecord } from '../json';

export const MAX_SHOWN_IMAGE_BYTES = 4 * 1024 * 1024;

const HEADER_BYTES = 12;
const SIGNATURES: { mimeType: ShownImageType; bytes: (number | null)[] }[] = [
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  {
    mimeType: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]
  }
];

interface ImageVariable {
  id: string;
  name: string;
  mimeType: ShownImageType;
  value: unknown;
}

export function shownType(value: unknown): ShownImageType | null {
  return SHOWN_IMAGE_TYPES.find((type) => type === value) ?? null;
}

function header(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.slice(0, HEADER_BYTES);
  const record = asRecord(value);
  const encoded = asString(record.$base64);
  if (encoded !== null) return [...Buffer.from(encoded.slice(0, 16), 'base64')];
  return Array.from({ length: HEADER_BYTES }, (_, index) => record[String(index)]);
}

function sniffedType(value: unknown): ShownImageType | null {
  const bytes = header(value);
  const match = SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => byte === null || bytes[index] === byte)
  );
  return match?.mimeType ?? null;
}

export function bytesType(bytes: Uint8Array): ShownImageType | null {
  return sniffedType([...bytes.subarray(0, HEADER_BYTES)]);
}

function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  const record = asRecord(value);
  return typeof record.$base64 === 'string' || '0' in record;
}

function imageVariables(request: JsonRecord): ImageVariable[] {
  const variables = asArray(asRecord(request.variableData).variables).map(asRecord);
  return variables
    .filter((variable) => variable.kind === 'image')
    .flatMap((variable, index) => {
      if (!hasData(variable.value)) return [];
      const mimeType = sniffedType(variable.value) ?? shownType(variable.mimeType);
      if (!mimeType) return [];
      return [
        {
          id: asString(variable.id) ?? `image-${index}`,
          name: asString(variable.name) ?? 'Image',
          mimeType,
          value: variable.value
        }
      ];
    });
}

function isByte(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255;
}

export function imageBytes(value: unknown): Buffer | null {
  const encoded = asString(asRecord(value).$base64);
  if (encoded !== null) return Buffer.from(encoded, 'base64');
  const values = Array.isArray(value) ? value : Object.values(asRecord(value));
  if (values.length === 0 || !values.every(isByte)) return null;
  return Buffer.from(values);
}

export function requestImages(request: JsonRecord): RequestImage[] {
  return imageVariables(request).map(({ id, name, mimeType }) => ({ id, name, mimeType }));
}

export function requestImage(request: JsonRecord, imageId: string): ImageResult | null {
  const image = imageVariables(request).find((variable) => variable.id === imageId);
  const bytes = image ? imageBytes(image.value) : null;
  if (!image || !bytes || bytes.length === 0) return null;
  return shownImage(image.mimeType, bytes);
}

export async function fileImage(image: RequestImage): Promise<ImageResult | null> {
  if (!image.id.startsWith('file:')) return null;
  const bytes = await readFile(fileURLToPath(image.id)).catch(() => null);
  if (!bytes || bytes.length === 0) return null;
  return shownImage(image.mimeType, bytes);
}

function shownImage(mimeType: ShownImageType, bytes: Buffer): ImageResult {
  if (bytes.length > MAX_SHOWN_IMAGE_BYTES) throw new Error('Photo is too large to show');
  return { kind: 'requestImage', mimeType, data: bytes.toString('base64') };
}
