import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { SwipeDishPayload } from '../../lib/swipes';

interface DishDetail extends SwipeDishPayload {
  photoTags?: string[] | null;
  photoInsight?: Record<string, any> | null;
  photoInsightModel?: string | null;
  photoInsightConfidence?: number | null;
}

interface RestaurantInfo {
  id: string;
  name: string;
  address?: string | null;
  price_range?: string | null;
  rating?: number | null;
  review_count?: number | null;
  website_url?: string | null;
  phone_number?: string | null;
}

interface DishMedia {
  id: string;
  url: string;
  caption?: string | null;
}

const DEFAULT_IMAGE_URL = 'https://placehold.co/800x600?text=Dish';

function imagePublicUrl(path: string | null): string | undefined {
  if (!path) {
    return undefined;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const { data } = supabase.storage.from('dish-images').getPublicUrl(path);
  return data?.publicUrl || undefined;
}

export default function DishDetailScreen() {
  const params = useLocalSearchParams<{ dishId?: string | string[] }>();
  const router = useRouter();
  const resolvedDishId = useMemo(() => {
    const raw = params?.dishId;
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (!first) {
      return undefined;
    }
    const trimmed = `${first}`.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
      return undefined;
    }
    return trimmed;
  }, [params?.dishId]);

  const isValidDishId = useMemo(() => {
    if (!resolvedDishId) return false;
    return /^[0-9a-fA-F-]{36}$/.test(resolvedDishId);
  }, [resolvedDishId]);

  const [dish, setDish] = useState<DishDetail | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);
  const [gallery, setGallery] = useState<DishMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingLink, setOpeningLink] = useState(false);

  useEffect(() => {
    // Reset state immediately when dishId changes
    setDish(null);
    setRestaurant(null);
    setGallery([]);
    setLoading(true);
    setErrorMessage(null);
  }, [resolvedDishId]);

  useFocusEffect(
    useCallback(() => {
      if (resolvedDishId && isValidDishId) {
        loadDishDetails(resolvedDishId);
      }
      // no cleanup needed
      return undefined;
    }, [resolvedDishId, isValidDishId])
  );

  async function loadDishDetails(id: string) {
    if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) {
      setErrorMessage('Missing or invalid dish identifier.');
      setDish(null);
      setRestaurant(null);
      setGallery([]);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setDish(null);
    setRestaurant(null);
    setGallery([]);
    try {
      const { supabaseUrl, supabaseKey } = supabase.supabaseUrl ? { supabaseUrl: supabase.supabaseUrl, supabaseKey: supabase.supabaseKey } : { supabaseUrl: '', supabaseKey: '' };

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase config not available');
      }

      // Direct fetch with URL query parameters - properly encode for security
      const encodedId = encodeURIComponent(id);
      const selectFields = 'id,name,description,image_url,price,cuisine_type,restaurant_id,photo_tags,photo_insight,photo_insight_model,photo_insight_confidence';
      const url = `${supabaseUrl}/rest/v1/dishes?id=eq.${encodedId}&select=${encodeURIComponent(selectFields)}&limit=1`;

      const response = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Raw query failed:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const dishRows = await response.json();

      if (!dishRows || dishRows.length === 0) {
        throw new Error('Dish not found');
      }

      const dishData = dishRows[0];

      if (!dishData) {
        setErrorMessage('Dish not found.');
        setDish(null);
        setRestaurant(null);
        setGallery([]);
        return;
      }

      const normalizedDish: DishDetail = {
        dishId: dishData.id,
        name: dishData.name,
        description: dishData.description || '',
        imageUrl: imagePublicUrl(dishData.image_url) ?? DEFAULT_IMAGE_URL,
        restaurant: 'Unknown Restaurant',
        restaurantId: dishData.restaurant_id,
        price: dishData.price,
        cuisineType: dishData.cuisine_type,
        photoTags: dishData.photo_tags,
        photoInsight: dishData.photo_insight,
        photoInsightModel: dishData.photo_insight_model,
        photoInsightConfidence: dishData.photo_insight_confidence,
      };

      let restaurantInfo: RestaurantInfo | null = null;
      let galleryPhotos: DishMedia[] = [];

      if (dishData.restaurant_id) {
        const [restaurantResult, galleryResult] = await Promise.all([
          supabase
            .from('restaurants')
            .select('id, name, address, price_range, rating, review_count, website_url, phone_number')
            .eq('id', dishData.restaurant_id)
            .limit(1),
          supabase
            .from('raw_place_photos')
            .select('id, storage_path, insight')
            .eq('restaurant_id', dishData.restaurant_id)
            .eq('is_dish', true)
            .limit(12),
        ]);

        if (restaurantResult.data && restaurantResult.data.length > 0) {
          restaurantInfo = restaurantResult.data[0] as RestaurantInfo;
          normalizedDish.restaurant = restaurantInfo.name;
        }

        if (galleryResult.data) {
          galleryPhotos = galleryResult.data
            .map((photo) => {
              const url = imagePublicUrl(photo.storage_path);
              if (!url) return null;
              const caption =
                typeof photo.insight === 'object' && photo.insight !== null
                  ? photo.insight?.summary ?? photo.insight?.description ?? null
                  : null;
              return {
                id: photo.id,
                url,
                caption,
              };
            })
            .filter((photo): photo is DishMedia => Boolean(photo));
        }
      }

      if (!normalizedDish.restaurant) {
        normalizedDish.restaurant = restaurantInfo?.name || 'Unknown Restaurant';
      }

      setDish(normalizedDish);
      setRestaurant(restaurantInfo);
      setGallery(galleryPhotos);
    } catch (error) {
      console.error('Failed to load dish detail', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load dish details right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  const insightEntries = useMemo(() => {
    if (!dish?.photoInsight || typeof dish.photoInsight !== 'object') return [];
    return Object.entries(dish.photoInsight).filter(([_, value]) => value !== null);
  }, [dish?.photoInsight]);

  const heroImage = dish?.imageUrl ?? DEFAULT_IMAGE_URL;

  const handleOrderNow = useCallback(async () => {
    const website = restaurant?.website_url;
    if (!website) {
      Alert.alert('No Online Ordering', 'This restaurant has not provided a website yet.');
      return;
    }
    try {
      setOpeningLink(true);
      const supported = await Linking.canOpenURL(website);
      if (supported) {
        await Linking.openURL(website);
      } else {
        Alert.alert('Unable to open link', 'The restaurant website could not be opened.');
      }
    } catch (error) {
      console.error('Failed to open restaurant website', error);
      Alert.alert('Unable to open link', 'Please try again later.');
    } finally {
      setOpeningLink(false);
    }
  }, [restaurant?.website_url]);

  const renderTag = (tag: string) => (
    <View key={tag} style={styles.tagChip}>
      <Text style={styles.tagText}>{tag}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Summoning the dish data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage || !dish) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{errorMessage || 'Dish not found.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back to gallery</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <Image source={{ uri: heroImage }} style={styles.heroImage} resizeMode="cover" />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroTitle}>{dish.name}</Text>
            <Text style={styles.heroSubtitle}>{restaurant?.name || dish.restaurant || ''}</Text>
            <View style={styles.heroMetaRow}>
              {!!dish.price && <Text style={styles.heroMetaText}>${dish.price.toFixed(2)}</Text>}
              {!!dish.cuisineType && <Text style={styles.heroMetaText}>{dish.cuisineType}</Text>}
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>Dish Overview</Text>
          <Text style={styles.descriptionText}>{dish.description || 'No description available.'}</Text>
          <View style={styles.statGrid}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Restaurant</Text>
              <Text style={styles.statValue}>{restaurant?.name || dish.restaurant || 'Unknown'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Price</Text>
              <Text style={styles.statValue}>
                {dish.price != null ? `$${dish.price.toFixed(2)}` : 'Unknown'}
              </Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Cuisine</Text>
              <Text style={styles.statValue}>{dish.cuisineType || 'Unknown'}</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Rating</Text>
              <Text style={styles.statValue}>
                {restaurant?.rating ? `${restaurant.rating.toFixed(1)} ⭐` : 'TBD'}
              </Text>
            </View>
          </View>
          {restaurant?.address && (
            <Text style={styles.secondaryInfo}>{restaurant.address}</Text>
          )}
          {(restaurant?.phone_number || restaurant?.website_url) && (
            <View style={styles.secondaryInfoRow}>
              {restaurant?.phone_number && (
                <Text style={styles.secondaryInfo}>{restaurant.phone_number}</Text>
              )}
              {restaurant?.website_url && (
                <Text style={styles.secondaryInfo}>{restaurant.website_url}</Text>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              (!restaurant?.website_url || openingLink) && styles.primaryButtonDisabled,
            ]}
            onPress={handleOrderNow}
            disabled={!restaurant?.website_url || openingLink}
          >
            <Text style={styles.primaryButtonText}>
              {openingLink ? 'Opening...' : restaurant?.website_url ? 'Order Now' : 'No Website Available'}
            </Text>
          </TouchableOpacity>
        </View>

        {dish.photoTags && dish.photoTags.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionLabel}>Tags</Text>
            <View style={styles.tagRow}>{dish.photoTags.map(renderTag)}</View>
          </View>
        )}

        {insightEntries.length > 0 && (
          <View style={styles.infoCard}>
            <Text style={styles.sectionLabel}>Vision Insights</Text>
            {dish.photoInsightModel && (
              <Text style={styles.insightMeta}>
                Model: {dish.photoInsightModel}
                {dish.photoInsightConfidence != null &&
                  ` · ${(dish.photoInsightConfidence * 100).toFixed(0)}% confidence`}
              </Text>
            )}
            {insightEntries.map(([key, value]) => (
              <View key={key} style={styles.insightRow}>
                <Text style={styles.insightLabel}>{key.replace(/_/g, ' ')}</Text>
                <Text style={styles.insightValue}>
                  {typeof value === 'string'
                    ? value
                    : typeof value === 'number'
                    ? value.toString()
                    : Array.isArray(value)
                    ? value.join(', ')
                    : JSON.stringify(value)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.sectionLabel}>Tagged Photos</Text>
          {gallery.length === 0 ? (
            <Text style={styles.secondaryInfo}>No additional photos yet.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScroll}
            >
              {gallery.map((photo) => (
                <View key={photo.id} style={styles.galleryItem}>
                  <Image source={{ uri: photo.url }} style={styles.galleryItemImage} />
                  {!!photo.caption && (
                    <Text numberOfLines={2} style={styles.galleryItemCaption}>
                      {photo.caption}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f2f0ff',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  backButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroImage: {
    width: '100%',
    height: 260,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 18,
    color: '#f0f0f0',
    marginTop: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  heroMetaText: {
    color: '#fff',
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f1f39',
  },
  descriptionText: {
    fontSize: 16,
    color: '#4a4a68',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCell: {
    flexBasis: '47%',
    backgroundColor: '#f5f5ff',
    borderRadius: 16,
    padding: 12,
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#8a8ab0',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2e2e4d',
    marginTop: 4,
  },
  secondaryInfo: {
    color: '#6b6b85',
    fontSize: 14,
  },
  secondaryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderRadius: 999,
    backgroundColor: '#ffe8cc',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  tagText: {
    color: '#a05a00',
    fontWeight: '600',
  },
  insightMeta: {
    color: '#777',
    fontSize: 13,
  },
  insightRow: {
    marginTop: 6,
  },
  insightLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#a5a5c3',
  },
  insightValue: {
    fontSize: 15,
    color: '#2b2b42',
    marginTop: 2,
  },
  galleryScroll: {
    gap: 12,
  },
  galleryItem: {
    width: 180,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fafafa',
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  galleryItemImage: {
    width: '100%',
    height: 160,
  },
  galleryItemCaption: {
    padding: 10,
    fontSize: 13,
    color: '#4a4a68',
  },
  primaryButton: {
    backgroundColor: '#6C5CE7',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorText: {
    color: '#D0342C',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
});

