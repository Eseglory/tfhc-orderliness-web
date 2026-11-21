/**
 * Client-Side Receipt Optimization Utility
 *
 * Automatically compresses large camera photos and screenshots into high-efficiency
 * WebP format (max 1920px dimension) while keeping PDFs preserved intact.
 * Enforces strict 10MB upload limit with friendly user error messages.
 */

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10MB

export interface OptimizedReceiptClientResult {
  dataUrl: string;
  name: string;
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  mimeType: string;
  isOptimized: boolean;
  summary: string;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export async function optimizeReceiptFile(file: File): Promise<OptimizedReceiptClientResult> {
  if (!file) {
    throw new Error('Please select a receipt file to upload.');
  }

  // 1. Strict 10MB size limit check
  if (file.size > MAX_RECEIPT_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Receipt file is too large (${sizeMb} MB). The maximum allowed upload size is 10MB per file.`
    );
  }

  const fileName = file.name || 'receipt';
  const mimeType = (file.type || '').toLowerCase();
  const lowerName = fileName.toLowerCase();

  // 2. Validate format: Images and PDFs only
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
  const isImage =
    mimeType.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].some((ext) => lowerName.endsWith(ext));

  if (!isPdf && !isImage) {
    throw new Error(
      'Invalid file format. Please upload a clear photo (JPG, PNG, WebP) or PDF document of your receipt.'
    );
  }

  // 3. PDF: Preserve original document format without altering bytes
  if (isPdf) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      name: lowerName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      originalSize: file.size,
      optimizedSize: file.size,
      compressionRatio: 0,
      mimeType: 'application/pdf',
      isOptimized: false,
      summary: `PDF Document (${formatFileSize(file.size)}) preserved intact`,
    };
  }

  // 4. Image: Automatic browser canvas compression to WebP (max 1920px dimension)
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const optimized = await compressImageOnCanvas(dataUrl, file.name);

    // If optimized is smaller, return optimized WebP
    if (optimized.optimizedSize < file.size) {
      return optimized;
    }

    // Otherwise return original data URL
    return {
      dataUrl,
      name: fileName,
      originalSize: file.size,
      optimizedSize: file.size,
      compressionRatio: 0,
      mimeType: mimeType || 'image/jpeg',
      isOptimized: false,
      summary: `Image (${formatFileSize(file.size)}) ready`,
    };
  } catch (err: any) {
    // Graceful fallback to raw file if canvas fails in edge environments
    const fallbackDataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackDataUrl,
      name: fileName,
      originalSize: file.size,
      optimizedSize: file.size,
      compressionRatio: 0,
      mimeType: mimeType || 'image/jpeg',
      isOptimized: false,
      summary: `Image (${formatFileSize(file.size)}) ready`,
    };
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read selected file. Please try again.'));
    reader.readAsDataURL(file);
  });
}

function compressImageOnCanvas(
  dataUrl: string,
  fileName: string
): Promise<OptimizedReceiptClientResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        const maxDim = 1920;
        let width = originalWidth;
        let height = originalHeight;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context unavailable');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first (supported by modern browsers)
        let mimeType = 'image/webp';
        let optimizedDataUrl = canvas.toDataURL(mimeType, 0.85);

        // If browser falls back to image/png or does not support webp
        if (!optimizedDataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/jpeg';
          optimizedDataUrl = canvas.toDataURL(mimeType, 0.85);
        }

        // Calculate size from base64 string
        const base64Content = optimizedDataUrl.split(',')[1] || '';
        const optimizedSize = Math.round((base64Content.length * 3) / 4);

        const base64Original = dataUrl.split(',')[1] || '';
        const originalSize = Math.round((base64Original.length * 3) / 4);

        const baseName = fileName.replace(/\.[^/.]+$/, '');
        const extension = mimeType === 'image/webp' ? '.webp' : '.jpg';
        const newName = `${baseName}${extension}`;

        const compressionRatio =
          originalSize > 0
            ? Math.round(((originalSize - optimizedSize) / originalSize) * 100)
            : 0;

        resolve({
          dataUrl: optimizedDataUrl,
          name: newName,
          originalSize,
          optimizedSize,
          compressionRatio: Math.max(0, compressionRatio),
          mimeType,
          isOptimized: compressionRatio > 0,
          summary:
            compressionRatio > 0
              ? `Optimized: ${formatFileSize(originalSize)} → ${formatFileSize(optimizedSize)} (${compressionRatio}% smaller)`
              : `Image ready (${formatFileSize(optimizedSize)})`,
        });
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Could not load image for optimization.'));
    img.src = dataUrl;
  });
}
