import {
  type ImageResult,
  type ImageUpload,
  MAX_IMAGE_BASE64,
  UPLOAD_IMAGE_TYPES
} from '@pocket-pilot/protocol';

const SHORT_SIDE = 768;
const LONG_SIDE = 2048;
const JPEG_QUALITY = 0.85;

type UploadType = ImageUpload['mimeType'];

export interface Size {
  width: number;
  height: number;
}

export function fitSize(width: number, height: number): Size {
  const scale = Math.min(
    1,
    SHORT_SIDE / Math.min(width, height),
    LONG_SIDE / Math.max(width, height)
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

export function dataUrl(image: { mimeType: string; data: string }): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

function render(bitmap: ImageBitmap, size: Size, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare photos');
  if (opaque) {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, mimeType: UploadType): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Cannot encode this photo'))),
      mimeType,
      JPEG_QUALITY
    );
  });
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Cannot read this photo'));
    reader.readAsDataURL(blob);
  });
}

async function upload(canvas: HTMLCanvasElement, mimeType: UploadType): Promise<ImageUpload> {
  return { mimeType, data: await base64(await encode(canvas, mimeType)) };
}

export async function preparePhoto(file: Blob): Promise<ImageUpload> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('Cannot read this photo');
  });
  try {
    const size = fitSize(bitmap.width, bitmap.height);
    if (file.type === 'image/png') {
      const png = await upload(render(bitmap, size, false), 'image/png');
      if (png.data.length <= MAX_IMAGE_BASE64) return png;
    }
    const jpeg = await upload(render(bitmap, size, true), 'image/jpeg');
    if (jpeg.data.length > MAX_IMAGE_BASE64) throw new Error('Photo is too large');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

function uploadType(mimeType: string): UploadType | null {
  return UPLOAD_IMAGE_TYPES.find((type) => type === mimeType) ?? null;
}

export function reusePhoto(image: Pick<ImageResult, 'mimeType' | 'data'>): Promise<ImageUpload> {
  const mimeType = uploadType(image.mimeType);
  if (mimeType && image.data.length <= MAX_IMAGE_BASE64) {
    return Promise.resolve({ mimeType, data: image.data });
  }
  const bytes = Uint8Array.from(atob(image.data), (char) => char.charCodeAt(0));
  return preparePhoto(new Blob([bytes], { type: image.mimeType }));
}
