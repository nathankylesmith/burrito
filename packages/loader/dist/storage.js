import { createLogger } from './logger.js';
const storageLogger = createLogger('storage');
const resolveLogger = (logger) => logger ?? storageLogger;
export const getFileExtension = (contentType) => {
    if (!contentType)
        return 'jpg';
    if (contentType.includes('png'))
        return 'png';
    if (contentType.includes('webp'))
        return 'webp';
    if (contentType.includes('gif'))
        return 'gif';
    return 'jpg';
};
export const uploadPhotoToStorage = async (supabase, photoData, bucket, filePath, logger) => {
    const scopedLogger = resolveLogger(logger);
    if (!photoData) {
        scopedLogger.debug('Skipping upload because no photo data was provided.', { bucket, filePath });
        return null;
    }
    const bucketClient = supabase.storage.from(bucket);
    const uploadResult = await bucketClient.upload(filePath, photoData.buffer, {
        contentType: photoData.contentType,
        upsert: true,
    });
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
export const uploadRestaurantPhoto = async (supabase, photoData, placeId, bucket, logger) => {
    const extension = getFileExtension(photoData?.contentType || 'image/jpeg');
    const filePath = `restaurants/${placeId}.${extension}`;
    return uploadPhotoToStorage(supabase, photoData, bucket, filePath, logger);
};
export const uploadDishPhoto = async (supabase, photoData, placeId, photoReference, bucket, logger) => {
    const extension = getFileExtension(photoData?.contentType || 'image/jpeg');
    const filePath = `dishes/${placeId}/${photoReference}.${extension}`;
    return uploadPhotoToStorage(supabase, photoData, bucket, filePath, logger);
};
