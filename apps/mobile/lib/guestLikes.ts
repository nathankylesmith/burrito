import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GuestLikedDish {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string;
  restaurant: string;
  restaurantId?: string;
  price?: number;
  cuisineType?: string | null;
  savedAt: string;
}

const STORAGE_KEY = 'dishswipe:guestLikes:v1';

async function readLikes(): Promise<GuestLikedDish[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item): item is GuestLikedDish =>
          typeof item === 'object' && item !== null && typeof item.dishId === 'string'
      );
    }
    return [];
  } catch {
    return [];
  }
}

async function writeLikes(likes: GuestLikedDish[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(likes));
  } catch {
    // ignore write errors
  }
}

export async function addGuestLike(dish: GuestLikedDish) {
  const existing = await readLikes();
  const filtered = existing.filter((item) => item.dishId !== dish.dishId);
  const entry: GuestLikedDish = {
    ...dish,
    savedAt: dish.savedAt || new Date().toISOString(),
  };
  filtered.unshift(entry);
  await writeLikes(filtered.slice(0, 100));
}

export async function getGuestLikes(): Promise<GuestLikedDish[]> {
  return readLikes();
}

export async function removeGuestLike(dishId: string) {
  const existing = await readLikes();
  const filtered = existing.filter((item) => item.dishId !== dishId);
  await writeLikes(filtered);
}

export async function clearGuestLikes() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

const LAST_RESET_KEY = 'dishswipe:lastResetTime';

export async function recordResetTime() {
  try {
    await AsyncStorage.setItem(LAST_RESET_KEY, Date.now().toString());
  } catch {
    // ignore errors
  }
}

export async function getLastResetTime(): Promise<number | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_RESET_KEY);
    return value ? parseInt(value, 10) : null;
  } catch {
    return null;
  }
}

export async function clearResetTime() {
  try {
    await AsyncStorage.removeItem(LAST_RESET_KEY);
  } catch {
    // ignore errors
  }
}

