import { supabase } from './supabase';

export const DEFAULT_IMAGE_URL = 'https://placehold.co/600x400?text=Dish';

/**
 * Normalises a dish image path into a publicly accessible URL.
 *
 * Older records store a Supabase Storage path while newer rows contain the
 * resolved CDN URL. This helper handles both cases so callers do not need to
 * duplicate the logic.
 */
export function imagePublicUrl(path: string | null): string | undefined {
  if (!path) {
    return undefined;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const { data } = supabase.storage.from('dish-images').getPublicUrl(path);
  return data?.publicUrl || undefined;
}

