/**
 * Automatically downsizes and compresses large image files on the client
 * so that camera photos (often 4MB - 12MB on modern phones) can be shared
 * smoothly within the 3MB upload limit without failure.
 */
export async function compressImageIfNeeded(file: File, maxBytes: number = 2.9 * 1024 * 1024): Promise<File> {
  // Only process images
  if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
    return file;
  }

  // If already under maxBytes, no need to compress
  if (file.size <= maxBytes) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2048;
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);

    // Try WebP first, fallback to JPEG
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    
    // Test with quality 0.85
    let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, 0.85));
    
    // If still too large, step down quality
    if (blob && blob.size > maxBytes) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    }
    if (blob && blob.size > maxBytes) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.65));
    }

    if (!blob) return file;

    const newName = file.name.replace(/\.[^/.]+$/, '') + (mimeType === 'image/jpeg' ? '.jpg' : '.png');
    return new File([blob], newName, { type: blob.type, lastModified: Date.now() });
  } catch {
    // If browser doesn't support canvas/createImageBitmap, return original
    return file;
  }
}
