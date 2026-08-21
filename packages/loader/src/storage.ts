import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlacePhotoResponse } from './google.js';
import { createLogger, type LoaderLogger } from './logger.js';

const storageLogger = createLogger('storage');

const resolveLogger = (logger?: LoaderLogger) => logger ?? storageLogger;

export const getFileExtension = (contentType: string) => {
  if (!contentType) return 'jpg';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
};

export const uploadPhotoToStorage = async (
  supabase: SupabaseClient,
  photoData: PlacePhotoResponse | null,
  bucket: string,
  filePath: string,
  logger?: LoaderLogger
) => {
  const scopedLogger = resolveLogger(logger);
  if (!photoData) {
    scopedLogger.debug('Skipping upload because no photo data was provided.', { bucket, filePath });
    return null;
  }

  const bucketClient = supabase.storage.from(bucket);

  const uploadResult = await bucketClient.upload(
    filePath,
    photoData.buffer,
    {
      contentType: photoData.contentType,
      upsert: true,
    }
  );

  if (uploadResult.error) {
    scopedLogger.warn('Failed to upload photo to storage.', {
      bucket,
      filePath,
      error: uploadResult.error.message,
    });
    return null;
  }

  const { data } = bucketClient.getPublicUrl(filePath);

  if (!data?.publicUrl) {
    scopedLogger.warn('Public URL missing after upload.', { bucket, filePath });
    return null;
  }

  scopedLogger.debug('Photo uploaded to storage.', { bucket, filePath });
  return data.publicUrl;
};

export const uploadRestaurantPhoto = async (
  supabase: SupabaseClient,
  photoData: PlacePhotoResponse | null,
  placeId: string,
  bucket: string,
  logger?: LoaderLogger
) => {
  const extension = getFileExtension(photoData?.contentType || 'image/jpeg');
  const filePath = `restaurants/${placeId}.${extension}`;
  return uploadPhotoToStorage(supabase, photoData, bucket, filePath, logger);
};

export const uploadDishPhoto = async (
  supabase: SupabaseClient,
  photoData: PlacePhotoResponse | null,
  placeId: string,
  photoReference: string,
  bucket: string,
  logger?: LoaderLogger
) => {
  const extension = getFileExtension(photoData?.contentType || 'image/jpeg');
  const filePath = `dishes/${placeId}/${photoReference}.${extension}`;
  return uploadPhotoToStorage(supabase, photoData, bucket, filePath, logger);
};

