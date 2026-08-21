import { describe, expect, it, vi } from 'vitest';
import { generateRegionKey, uploadPhotoToStorage } from '../index.js';
import { formatLocation } from '../google.js';
import type { LoaderLogger } from '../logger.js';

const createLoggerStub = (): LoaderLogger => {
  const stub: LoaderLogger = {
    level: 'info',
    scope: 'test',
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  (stub.child as unknown as ReturnType<typeof vi.fn>).mockReturnValue(stub);
  return stub;
};

const createSupabaseStub = () => {
  const upload = vi.fn().mockResolvedValue({ data: null, error: null });
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/photo.jpg' } });
  const storageFrom = { upload, getPublicUrl };
  const storage = {
    from: vi.fn().mockReturnValue(storageFrom),
  };

  return { storage, upload, getPublicUrl };
};

describe('generateRegionKey', () => {
  it('normalizes coordinates and keyword', () => {
    const key = generateRegionKey({
      latitude: 37.77495,
      longitude: -122.41942,
      radius: 1500,
      keyword: '  Sushi   ',
    });

    expect(key).toBe('37.7749:-122.4194:1500:sushi');
  });

  it('handles missing keywords', () => {
    const key = generateRegionKey({
      latitude: 0,
      longitude: 0,
      radius: 1000,
      keyword: undefined,
    });

    expect(key).toBe('0.0000:0.0000:1000:');
  });
});

describe('formatLocation', () => {
  it('returns string locations unchanged', () => {
    expect(formatLocation('1,2')).toBe('1,2');
  });

  it('serializes object locations', () => {
    expect(formatLocation({ lat: 1.23456, lng: -2.98765 })).toBe('1.23456,-2.98765');
  });

  it('throws for invalid data', () => {
    expect(() => formatLocation({ lat: 1 } as any)).toThrow();
  });
});

describe('uploadPhotoToStorage', () => {
  it('returns null when no photo data provided', async () => {
    const supabase = createSupabaseStub();
    const logger = createLoggerStub();

    const url = await uploadPhotoToStorage(
      supabase as any,
      null,
      'bucket',
      'path.jpg',
      logger
    );

    expect(url).toBeNull();
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });

  it('uploads and returns public url', async () => {
    const supabase = createSupabaseStub();
    const logger = createLoggerStub();

    const url = await uploadPhotoToStorage(
      supabase as any,
      {
        buffer: new Uint8Array([1, 2, 3]),
        contentType: 'image/jpeg',
      },
      'dish-images',
      'restaurants/abc.jpg',
      logger
    );

    expect(url).toBe('https://example.com/photo.jpg');
    expect(supabase.storage.from).toHaveBeenCalledWith('dish-images');
    expect(supabase.upload).toHaveBeenCalledWith(
      'restaurants/abc.jpg',
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true })
    );
    expect(supabase.getPublicUrl).toHaveBeenCalledWith('restaurants/abc.jpg');
  });

  it('returns null when upload fails', async () => {
    const supabase = createSupabaseStub();
    supabase.upload.mockResolvedValue({
      error: { message: 'boom' },
      data: null,
    });
    const logger = createLoggerStub();

    const url = await uploadPhotoToStorage(
      supabase as any,
      {
        buffer: new Uint8Array([1]),
        contentType: 'image/png',
      },
      'dish-images',
      'restaurants/fail.png',
      logger
    );

    expect(url).toBeNull();
    expect(supabase.getPublicUrl).not.toHaveBeenCalled();
  });
});

