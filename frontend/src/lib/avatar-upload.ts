/** Client helpers for Cloudflare R2 avatar upload (presigned PUT + confirm). */

import { apiErrorMessage, type OwnedProfile } from '@/lib/profile';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE_PX = 1024;

export interface AvatarUploadSlot {
  upload_url: string;
  public_url: string;
  key: string;
  expires_in: number;
  max_bytes: number;
  content_type: string;
  cache_control: string;
}

export class AvatarUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarUploadError';
  }
}

/** Downscale large images client-side before upload (keeps JPEG for photo inputs). */
export async function prepareAvatarBlob(file: File): Promise<{
  blob: Blob;
  contentType: string;
}> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new AvatarUploadError('Use a JPEG, PNG, or WebP image.');
  }
  if (file.size > MAX_BYTES * 4) {
    throw new AvatarUploadError('Image is too large.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new AvatarUploadError('Could not process image.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const contentType =
      file.type === 'image/png' || file.type === 'image/webp'
        ? file.type
        : 'image/jpeg';
    const quality = contentType === 'image/jpeg' ? 0.9 : undefined;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new AvatarUploadError('Could not encode image.'));
          }
        },
        contentType,
        quality,
      );
    });
    if (blob.size > MAX_BYTES) {
      throw new AvatarUploadError(
        'Image is still too large after resize (max 2MB).',
      );
    }
    return { blob, contentType };
  } finally {
    bitmap.close();
  }
}

export async function requestAvatarUploadUrl(
  contentType: string,
  byteSize: number,
): Promise<AvatarUploadSlot> {
  const res = await fetch('/api/proxy/api/v1/users/me/avatar/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content_type: contentType, byte_size: byteSize }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (res.status === 503) {
    throw new AvatarUploadError(
      'Avatar storage is not configured yet (Cloudflare R2).',
    );
  }
  if (!res.ok) {
    throw new AvatarUploadError(
      apiErrorMessage(data, 'Could not start upload'),
    );
  }
  return data as AvatarUploadSlot;
}

export async function putAvatarToR2(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  // Content-Length is a forbidden fetch header — the browser sets it from `blob`.
  // It must still match the size signed into the presigned URL (upload-url byte_size).
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    },
    body: blob,
  });
  if (!res.ok) {
    throw new AvatarUploadError(
      `Upload to storage failed (HTTP ${res.status}).`,
    );
  }
}

export async function confirmAvatarUpload(key: string): Promise<OwnedProfile> {
  const res = await fetch('/api/proxy/api/v1/users/me/avatar/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AvatarUploadError(apiErrorMessage(data, 'Could not save avatar'));
  }
  return data as OwnedProfile;
}

export async function deleteAvatar(): Promise<OwnedProfile> {
  const res = await fetch('/api/proxy/api/v1/users/me/avatar', {
    method: 'DELETE',
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AvatarUploadError(
      apiErrorMessage(data, 'Could not remove avatar'),
    );
  }
  return data as OwnedProfile;
}

export async function uploadAvatarFile(file: File): Promise<OwnedProfile> {
  const { blob, contentType } = await prepareAvatarBlob(file);
  const slot = await requestAvatarUploadUrl(contentType, blob.size);
  if (blob.size > slot.max_bytes) {
    throw new AvatarUploadError(
      `Image is too large after resize (max ${Math.floor(slot.max_bytes / (1024 * 1024))}MB).`,
    );
  }
  await putAvatarToR2(slot.upload_url, blob, contentType, slot.cache_control);
  return confirmAvatarUpload(slot.key);
}

export function avatarFileAccept(): string {
  return 'image/jpeg,image/png,image/webp';
}
