import { supabase } from './supabase';
import { imagePublicUrl } from './images';

type NullableString = string | null | undefined;

export interface FavoriteDish {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string;
  price?: number | null;
  restaurant?: string;
}

interface SaveFavoriteOptions {
  userId: string;
  dishId: string;
  restaurantId?: NullableString;
}


export async function saveFavoriteForUser(options: SaveFavoriteOptions): Promise<void> {
  const { userId, dishId, restaurantId } = options;

  if (!userId || !dishId) {
    return;
  }

  const { error } = await supabase.from('favorites').upsert(
    {
      user_id: userId,
      dish_id: dishId,
      restaurant_id: restaurantId ?? null,
    },
    { onConflict: 'user_id,dish_id' }
  );

  if (error) {
    console.error('Failed to save favorite', { error, userId, dishId });
    throw error;
  }
}

export async function removeFavoriteForUser(userId: string, dishId: string): Promise<void> {
  if (!userId || !dishId) {
    return;
  }

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('dish_id', dishId);

  if (error) {
    console.error('Failed to remove favorite', { error, userId, dishId });
    throw error;
  }
}

export async function resetFavoritesForUser(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to reset favorites', { error, userId });
    throw error;
  }
}

export async function fetchFavoriteDishesForUser(userId: string): Promise<FavoriteDish[]> {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from('favorites')
    .select(
      `
        dish_id,
        dishes (
          id,
          name,
          description,
          image_url,
          price,
          restaurants (
            name
          )
        )
      `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch favorites', { error, userId });
    throw error;
  }

  const favorites = (data ?? [])
    .map((favorite: any) => {
      const dish = favorite.dishes;
      if (!dish) {
        return null;
      }

      return {
        dishId: dish.id ?? favorite.dish_id,
        name: dish.name ?? 'Unknown dish',
        description: dish.description ?? '',
        imageUrl: imagePublicUrl(dish.image_url ?? null),
        price: dish.price,
        restaurant: dish.restaurants?.name ?? 'Unknown restaurant',
      } as FavoriteDish;
    })
    .filter(Boolean) as FavoriteDish[];

  return favorites;
}

