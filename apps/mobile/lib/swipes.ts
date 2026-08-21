import { supabase } from './supabase';
import { addGuestLike } from './guestLikes';

export interface SwipeDishPayload {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string;
  restaurant: string;
  restaurantId?: string | null;
  price?: number | null;
  cuisineType?: string | null;
}

export async function recordSwipe(dish: SwipeDishPayload, liked: boolean) {
  try {
    const { data: userResult, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.warn('Unable to look up authenticated user', userError);
      return;
    }

    const userId = userResult?.user?.id;
    const userEmail = userResult?.user?.email ?? null;
    if (!userId) {
      if (liked) {
        await addGuestLike({
          dishId: dish.dishId,
          name: dish.name,
          description: dish.description,
          imageUrl: dish.imageUrl,
          restaurant: dish.restaurant,
          restaurantId: dish.restaurantId,
          price: dish.price,
          cuisineType: dish.cuisineType,
          savedAt: new Date().toISOString(),
        });
      }
      return;
    }

    if (!dish.dishId) {
      console.error('Invalid dish ID provided to recordSwipe');
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error verifying user profile before recording swipe:', profileError);
      return;
    }

    if (!profile) {
      const { error: insertProfileError } = await supabase.from('profiles').insert({
        id: userId,
        email: userEmail,
      });

      if (insertProfileError) {
        console.error('Error creating profile before recording swipe:', insertProfileError);
        return;
      }
    }

    const { error } = await supabase.from('swipes').upsert({
      user_id: userId,
      dish_id: dish.dishId,
      direction: liked ? 'like' : 'pass',
    });

    if (error) {
      console.error('Error recording swipe:', error);
    }
  } catch (error) {
    console.error('Unexpected error in recordSwipe:', error);
  }
}

