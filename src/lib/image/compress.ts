// Client-side image compression using Canvas + WebP.
// Receipts and damage photos are compressed in the browser before R2 upload.
// 3-5 MB phone photo -> ~150-400 KB WebP, OCR-readable.

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'webp' | 'jpeg';
}

export interface CompressionResult {
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  format: string;
}

const DEFAULTS = {
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.85,
  format: 'webp' as const,
};

export async function compressImage(
  file: File,
  opts: CompressionOptions = {},
): Promise<CompressionResult> {
  const maxWidth = opts.maxWidth ?? DEFAULTS.maxWidth;
  const maxHeight = opts.maxHeight ?? DEFAULTS.maxHeight;
  const quality = opts.quality ?? DEFAULTS.quality;
  const format = opts.format ?? DEFAULTS.format;

  const bitmap = await createImageBitmap(file);

  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxWidth || height > maxHeight) {
    const scale = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const canvas: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(width, height)
    : (() => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
      })();

  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const mimeType = format === 'webp' ? 'image/webp' : 'image/jpeg';

  let blob: Blob;
  if (canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: mimeType, quality });
  } else {
    blob = await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        mimeType,
        quality,
      );
    });
  }

  return {
    blob,
    originalSize: file.size,
    compressedSize: blob.size,
    width,
    height,
    format,
  };
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateCompression(
  result: CompressionResult,
  minSizeKb = 30,
  minWidth = 600,
): ValidationResult {
  if (result.width < minWidth) {
    return { ok: false, reason: 'Image resolution too low — please retake' };
  }
  if (result.compressedSize < minSizeKb * 1024) {
    return { ok: false, reason: 'Image too small — may not be readable' };
  }
  return { ok: true };
}
