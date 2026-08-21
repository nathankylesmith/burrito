import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  addGuestLike,
  clearGuestLikes,
  getGuestLikes,
  removeGuestLike,
  GuestLikedDish,
} from '../lib/guestLikes';

type FavoriteDish = {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  price?: number | null;
  cuisineType?: string | null;
  restaurantId?: string | null;
  restaurantName?: string | null;
  restaurantImage?: string | null;
  savedAt: string;
};

type FavoriteInput = {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string | null;
  price?: number | null;
  cuisineType?: string | null;
  restaurantId?: string | null;
  restaurantName?: string | null;
  restaurantImage?: string | null;
};

type FavoritesContextValue = {
  favorites: FavoriteDish[];
  favoriteIds: Set<string>;
  mode: 'guest' | 'user';
  loading: boolean;
  addFavorite: (input: FavoriteInput) => Promise<void>;
  removeFavorite: (dishId: string) => Promise<void>;
  removeFavorites: (dishIds: string[]) => Promise<void>;
  toggleFavorite: (input: FavoriteInput) => Promise<void>;
  resetFavorites: () => Promise<void>;
  refreshFavorites: () => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | undefined>(undefined);

const DEFAULT_IMAGE_URL = 'https://placehold.co/600x400?text=Dish';
const DISH_BUCKET = 'dish-images';

function resolveImageUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const { data } = supabase.storage.from(DISH_BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function mapGuestLikes(likes: GuestLikedDish[]): FavoriteDish[] {
  return likes.map((like) => ({
    dishId: like.dishId,
    name: like.name,
    description: like.description || '',
    imageUrl: like.imageUrl || null,
    price: like.price ?? null,
    cuisineType: like.cuisineType ?? null,
    restaurantId: like.restaurantId || null,
    restaurantName: like.restaurant || null,
    restaurantImage: like.imageUrl || null,
    savedAt: like.savedAt || new Date().toISOString(),
  }));
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteDish[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'guest' | 'user'>('guest');
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null | undefined>(undefined);
  const syncInFlightRef = useRef(false);

  const syncFavoriteIds = useCallback((list: FavoriteDish[]) => {
    setFavoriteIds(new Set(list.map((item) => item.dishId)));
  }, []);

  const ensureAuthState = useCallback(async () => {
    if (userIdRef.current !== undefined) {
      return userIdRef.current;
    }
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult?.user?.id ?? null;
      userIdRef.current = userId;
      setMode(userId ? 'user' : 'guest');
      return userId;
    } catch (error) {
      console.error('[Favorites] Failed to fetch auth state', error);
      userIdRef.current = null;
      setMode('guest');
      return null;
    }
  }, []);

  const buildUserFavorites = useCallback(async (userId: string): Promise<FavoriteDish[]> => {
    const { data: favoriteRows, error: favoritesError } = await supabase
      .from('favorites')
      .select('dish_id, restaurant_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (favoritesError) {
      throw favoritesError;
    }

    const orderedDishIds =
      favoriteRows?.map((row) => row.dish_id).filter((id): id is string => Boolean(id)) ?? [];

    if (orderedDishIds.length === 0) {
      return [];
    }

    const { data: dishes, error: dishesError } = await supabase
      .from('dishes')
      .select('id, name, description, image_url, price, cuisine_type, restaurant_id')
      .in('id', orderedDishIds);

    if (dishesError) {
      throw dishesError;
    }

    const restaurantIds = [
      ...new Set(dishes?.map((dish) => dish.restaurant_id).filter(Boolean) || []),
    ] as string[];

    let restaurants: { id: string; name?: string | null; image_url?: string | null }[] = [];
    if (restaurantIds.length > 0) {
      const { data: restaurantRows, error: restaurantsError } = await supabase
        .from('restaurants')
        .select('id, name, image_url')
        .in('id', restaurantIds);

      if (restaurantsError) {
        throw restaurantsError;
      }

      restaurants = restaurantRows ?? [];
    }

    const dishMap = new Map(
      (dishes ?? []).map((dish) => [dish.id, dish]),
    );
    const restaurantMap = new Map(
      restaurants.map((restaurant) => [restaurant.id, restaurant]),
    );
    const favoriteMetaMap = new Map(
      (favoriteRows ?? []).map((row) => [row.dish_id, row.created_at]),
    );

    const normalized = orderedDishIds
      .map((dishId) => {
        const dish = dishMap.get(dishId);
        if (!dish) return null;
        const restaurant = dish.restaurant_id ? restaurantMap.get(dish.restaurant_id) : undefined;

        return {
          dishId,
          name: dish.name || 'Untitled Dish',
          description: dish.description || '',
          imageUrl: resolveImageUrl(dish.image_url) ?? DEFAULT_IMAGE_URL,
          price: dish.price ?? null,
          cuisineType: dish.cuisine_type ?? null,
          restaurantId: dish.restaurant_id || null,
          restaurantName: restaurant?.name || 'Unknown Restaurant',
          restaurantImage: resolveImageUrl(restaurant?.image_url) ?? null,
          savedAt: favoriteMetaMap.get(dishId) || new Date().toISOString(),
        } satisfies FavoriteDish;
      })
      .filter((item): item is FavoriteDish => Boolean(item));

    return normalized;
  }, []);

  const refreshFavorites = useCallback(async () => {
    if (syncInFlightRef.current) {
      return;
    }
    syncInFlightRef.current = true;
    setLoading(true);
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult?.user?.id ?? null;
      userIdRef.current = userId;

      if (!userId) {
        const guestLikes = await getGuestLikes();
        const mapped = mapGuestLikes(guestLikes);
        setMode('guest');
        setFavorites(mapped);
        syncFavoriteIds(mapped);
        return;
      }

      setMode('user');
      const mapped = await buildUserFavorites(userId);
      setFavorites(mapped);
      syncFavoriteIds(mapped);
    } catch (error) {
      console.error('Failed to refresh favorites', error);
    } finally {
      setLoading(false);
      syncInFlightRef.current = false;
    }
  }, [buildUserFavorites, syncFavoriteIds]);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  const addFavorite = useCallback(
    async (input: FavoriteInput) => {
      if (!input?.dishId) return;
      if (favoriteIds.has(input.dishId)) return;

      const entry: FavoriteDish = {
        dishId: input.dishId,
        name: input.name,
        description: input.description || '',
        imageUrl: input.imageUrl || DEFAULT_IMAGE_URL,
        price: input.price ?? null,
        cuisineType: input.cuisineType ?? null,
        restaurantId: input.restaurantId || null,
        restaurantName: input.restaurantName || 'Unknown Restaurant',
        restaurantImage: input.restaurantImage || null,
        savedAt: new Date().toISOString(),
      };

      const userId = await ensureAuthState();

      if (!userId) {
        await addGuestLike({
          dishId: entry.dishId,
          name: entry.name,
          description: entry.description,
          imageUrl: entry.imageUrl ?? undefined,
          price: entry.price ?? undefined,
          cuisineType: entry.cuisineType ?? undefined,
          restaurant: entry.restaurantName || '',
          restaurantId: entry.restaurantId || undefined,
          savedAt: entry.savedAt,
        });
        setFavorites((prev) => {
          const next = [entry, ...prev.filter((item) => item.dishId !== entry.dishId)];
          syncFavoriteIds(next);
          return next;
        });
        return;
      }

      // Use manual REST API call since Supabase client INSERT might be broken
      const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
      const insertData = {
        user_id: userId,
        dish_id: entry.dishId,
        restaurant_id: entry.restaurantId,
      };

      // Get the user's session token for authenticated requests
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionToken = sessionData.session?.access_token;

      if (!sessionToken) {
        throw new Error('No user session available for authenticated request');
      }

      const insertResponse = await fetch(`${supabaseUrl}/rest/v1/favorites`, {
        method: 'POST',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(insertData),
      });

      const responseText = await insertResponse.text();

      if (!insertResponse.ok) {
        // Check if this is a duplicate key error
        const isDuplicateError = insertResponse.status === 409 ||
          responseText.includes('duplicate key') ||
          responseText.includes('unique constraint');

        if (!isDuplicateError) {
          console.error('Failed to add favorite:', insertResponse.status, responseText);
          throw new Error(`INSERT failed: ${insertResponse.status} ${responseText}`);
        }
        // If it's a duplicate error, we silently ignore it since the item is already favorited
      }

      setFavorites((prev) => {
        if (prev.some((item) => item.dishId === entry.dishId)) {
          return prev;
        }
        const next = [entry, ...prev];
        syncFavoriteIds(next);
        return next;
      });
    },
    [favoriteIds, syncFavoriteIds, ensureAuthState],
  );

  const removeFavorite = useCallback(
    async (dishId: string) => {
      if (!dishId) return;
      if (!favoriteIds.has(dishId)) return;

      const userId = await ensureAuthState();

      if (!userId) {
        await removeGuestLike(dishId);
      } else {
        // Use manual REST API call since Supabase client DELETE is broken
        const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
        const encodedUserId = encodeURIComponent(userId);
        const encodedDishId = encodeURIComponent(dishId);
        const deleteUrl = `${supabaseUrl}/rest/v1/favorites?user_id=eq.${encodedUserId}&dish_id=eq.${encodedDishId}`;

        // Get the user's session token for authenticated requests
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionToken = sessionData.session?.access_token;

        if (!sessionToken) {
          throw new Error('No user session available for authenticated request');
        }

        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('DELETE failed:', response.status, errorText, 'URL:', deleteUrl);
          throw new Error(`DELETE failed: ${response.status} ${errorText}`);
        }
      }

      setFavorites((prev) => {
        const next = prev.filter((item) => item.dishId !== dishId);
        syncFavoriteIds(next);
        return next;
      });
    },
    [favoriteIds, syncFavoriteIds, ensureAuthState],
  );

  const removeFavorites = useCallback(
    async (dishIds: string[]) => {
      if (dishIds.length === 0) return;

      const userId = await ensureAuthState();

      if (!userId) {
        await Promise.all(dishIds.map((id) => removeGuestLike(id)));
      } else {
        // Use manual REST API call since Supabase client DELETE is broken
        const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
        const encodedUserId = encodeURIComponent(userId);
        const dishConditions = dishIds.map(id => `dish_id=eq.${encodeURIComponent(id)}`).join('&');
        const deleteUrl = `${supabaseUrl}/rest/v1/favorites?user_id=eq.${encodedUserId}&${dishConditions}`;

        // Get the user's session token for authenticated requests
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionToken = sessionData.session?.access_token;

        if (!sessionToken) {
          throw new Error('No user session available for authenticated request');
        }

        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Bulk DELETE failed:', response.status, errorText, 'URL:', deleteUrl);
          throw new Error(`Bulk DELETE failed: ${response.status} ${errorText}`);
        }
      }

      setFavorites((prev) => {
        const removalSet = new Set(dishIds);
        const next = prev.filter((item) => !removalSet.has(item.dishId));
        syncFavoriteIds(next);
        return next;
      });
    },
    [syncFavoriteIds, ensureAuthState],
  );

  const resetFavorites = useCallback(async () => {
    const userId = await ensureAuthState();

    if (!userId) {
      await clearGuestLikes();
    } else {
      // Use manual REST API call since Supabase client DELETE is broken
      const { supabaseUrl, supabaseAnonKey } = await import('../lib/supabase');
      const encodedUserId = encodeURIComponent(userId);
      const deleteUrl = `${supabaseUrl}/rest/v1/favorites?user_id=eq.${encodedUserId}`;

      // Get the user's session token for authenticated requests
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionToken = sessionData.session?.access_token;

      if (!sessionToken) {
        throw new Error('No user session available for authenticated request');
      }

      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error('Reset DELETE failed:', response.status, responseText, 'URL:', deleteUrl);
        throw new Error(`Reset DELETE failed: ${response.status} ${responseText}`);
      } else {
        // Verify the delete actually worked
        const verifyUrl = `${supabaseUrl}/rest/v1/favorites?user_id=eq.${encodedUserId}&select=id`;
        const verifyResponse = await fetch(verifyUrl, {
          headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (verifyResponse.ok) {
          const remainingFavorites = await verifyResponse.json();
          if (remainingFavorites.length > 0) {
            console.error('ERROR: Reset did not actually delete favorites! Still have:', remainingFavorites.length);
          }
        } else {
          console.error('Could not verify reset, verification request failed');
        }
      }
    }

    setFavorites([]);
    syncFavoriteIds([]);
  }, [syncFavoriteIds]);

  const toggleFavorite = useCallback(
    async (input: FavoriteInput) => {
      if (favoriteIds.has(input.dishId)) {
        await removeFavorite(input.dishId);
      } else {
        await addFavorite(input);
      }
    },
    [favoriteIds, addFavorite, removeFavorite],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({
      favorites,
      favoriteIds,
      mode,
      loading,
      addFavorite,
      removeFavorite,
      removeFavorites,
      toggleFavorite,
      resetFavorites,
      refreshFavorites,
    }),
    [
      favorites,
      favoriteIds,
      mode,
      loading,
      addFavorite,
      removeFavorite,
      removeFavorites,
      toggleFavorite,
      resetFavorites,
      refreshFavorites,
    ],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}

