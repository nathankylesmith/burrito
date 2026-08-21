import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFavorites } from '../../context/FavoritesContext';

interface LikedDish {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  cuisineType: string | null;
  restaurantId: string;
  restaurantName: string;
}

interface RestaurantGroup {
  restaurantId: string;
  restaurantName: string;
  heroImage?: string | null;
  dishes: LikedDish[];
}

const DEFAULT_IMAGE_URL = 'https://placehold.co/400x300?text=Dish';

export default function FindsScreen() {
  const {
    favorites,
    mode,
    loading,
    removeFavorite,
    removeFavorites,
    resetFavorites,
    refreshFavorites,
  } = useFavorites();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'price' | 'likes' | 'rating' | 'distance'>('likes');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, RestaurantGroup>();

    favorites.forEach((dish) => {
      const key = dish.restaurantId || dish.restaurantName || dish.dishId;
      const entry: LikedDish = {
        id: dish.dishId,
        name: dish.name,
        description: dish.description,
        imageUrl: dish.imageUrl || DEFAULT_IMAGE_URL,
        price: dish.price ?? null,
        cuisineType: dish.cuisineType ?? null,
        restaurantId: dish.restaurantId || '',
        restaurantName: dish.restaurantName || 'Unknown Restaurant',
      };

      const existing = map.get(key);
      if (existing) {
        existing.dishes.push(entry);
      } else {
        map.set(key, {
          restaurantId: entry.restaurantId || key,
          restaurantName: entry.restaurantName,
          heroImage: dish.restaurantImage || dish.imageUrl || DEFAULT_IMAGE_URL,
          dishes: [entry],
        });
      }
    });

    const restaurantGroups = Array.from(map.values());

    // Sort the groups based on selected criteria
    return restaurantGroups.sort((a, b) => {
      switch (sortBy) {
        case 'price':
          // Sort by average dish price (highest first)
          const avgPriceA = a.dishes.reduce((sum, dish) => sum + (dish.price || 0), 0) / a.dishes.length;
          const avgPriceB = b.dishes.reduce((sum, dish) => sum + (dish.price || 0), 0) / b.dishes.length;
          return avgPriceB - avgPriceA;

        case 'likes':
          // Sort by number of dishes (most liked first)
          return b.dishes.length - a.dishes.length;

        case 'rating':
          // Sort by restaurant rating (highest first), fallback to name
          const ratingA = (favorites.find(f => f.restaurantId === a.restaurantId)?.restaurantRating) || 0;
          const ratingB = (favorites.find(f => f.restaurantId === b.restaurantId)?.restaurantRating) || 0;
          if (ratingB !== ratingA) return ratingB - ratingA;
          return a.restaurantName.localeCompare(b.restaurantName);

        case 'distance':
          // Sort by distance (closest first), fallback to name
          const latA = favorites.find(f => f.restaurantId === a.restaurantId)?.restaurantLatitude;
          const latB = favorites.find(f => f.restaurantId === b.restaurantId)?.restaurantLatitude;
          if (latA && latB) {
            const lngA = favorites.find(f => f.restaurantId === a.restaurantId)?.restaurantLongitude || 0;
            const lngB = favorites.find(f => f.restaurantId === b.restaurantId)?.restaurantLongitude || 0;

            // Try to get user's location from AsyncStorage, fallback to Charlottesville
            const getUserLocation = async () => {
              try {
                const savedLocation = await AsyncStorage.getItem('userLocation');
                if (savedLocation) {
                  const locationData = JSON.parse(savedLocation);
                  return { lat: locationData.latitude, lng: locationData.longitude };
                }
              } catch (error) {
                console.error('Error getting user location for sorting:', error);
              }
              return { lat: 38.0293, lng: -78.4767 }; // Charlottesville fallback
            };

            // For now, use simple distance calculation since we can't await in sort
            // In a real app, you'd pre-calculate distances or use a different approach
            const userLat = 38.0293; // Would be from user's actual location
            const userLng = -78.4767;
            const distA = Math.abs(latA - userLat) + Math.abs(lngA - userLng);
            const distB = Math.abs(latB - userLat) + Math.abs(lngB - userLng);
            return distA - distB;
          }
          return a.restaurantName.localeCompare(b.restaurantName);

        default:
          return 0;
      }
    });
  }, [favorites, sortBy]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFavorites();
    } catch (error) {
      console.error('Failed to refresh favorites', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshFavorites]);

  const handleRemoveDish = useCallback(
    async (dishId: string) => {
      try {
        await removeFavorite(dishId);
      } catch (error) {
        console.error('Failed to remove favorite', error);
      }
    },
    [removeFavorite],
  );

  const toggleDishSelection = useCallback((dishId: string) => {
    setSelectedForDeletion((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) {
        next.delete(dishId);
      } else {
        next.add(dishId);
      }
      return next;
    });
  }, []);

  const exitDeleteMode = useCallback(() => {
    setIsDeleteMode(false);
    setSelectedForDeletion(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedForDeletion.size === 0) return;
    try {
      await removeFavorites(Array.from(selectedForDeletion));
      exitDeleteMode();
    } catch (error) {
      console.error('Failed to bulk delete favorites', error);
    }
  }, [selectedForDeletion, removeFavorites, exitDeleteMode]);

  const renderRestaurantCard = useCallback(
    (group: RestaurantGroup, index: number) => (
      <View key={group.restaurantId} style={styles.restaurantCard}>
        {/* Restaurant Header with Visual Info Bar - No Image */}
        <View style={styles.restaurantHeader}>
          {/* Restaurant Name on the Left */}
          <Text style={styles.restaurantName}>{group.restaurantName}</Text>

          {/* Info Icons Grid on the Right */}
          <View style={styles.infoGrid}>
            {/* Rating Stars */}
            <View style={styles.gridItem}>
              <MaterialIcons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>
                4.2
              </Text>
            </View>

            {/* Price Range */}
            <View style={styles.gridItem}>
              <Text style={styles.priceText}>
                {group.dishes.reduce((sum, dish) => sum + (dish.price || 0), 0) / group.dishes.length >= 25 ? '$$$' :
                 group.dishes.reduce((sum, dish) => sum + (dish.price || 0), 0) / group.dishes.length >= 15 ? '$$' : '$'}
              </Text>
            </View>

            {/* Dish Count */}
            <View style={styles.gridItem}>
              <MaterialIcons name="restaurant-menu" size={12} color="#666" />
              <Text style={styles.dishCountText}>
                {group.dishes.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Horizontal Dish Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dishCarousel}
          style={styles.dishScrollView}
        >
          {group.dishes.map((dish) => (
            <TouchableOpacity
              key={dish.id}
              style={[
                styles.carouselDish,
                isDeleteMode && selectedForDeletion.has(dish.id) && styles.carouselDishSelected,
              ]}
              onPress={() => {
                if (isDeleteMode) {
                  toggleDishSelection(dish.id);
                } else {
                  router.push(`/dish/${dish.id}`);
                }
              }}
            >
              <Image
                source={{ uri: dish.imageUrl || DEFAULT_IMAGE_URL }}
                style={styles.carouselDishImage}
                resizeMode="cover"
              />
              {isDeleteMode && (
                <View style={styles.dishSelectionOverlay}>
                  <MaterialIcons
                    name={selectedForDeletion.has(dish.id) ? 'check-circle' : 'radio-button-unchecked'}
                    size={24}
                    color="#fff"
                  />
                </View>
              )}
              <View style={styles.dishInfo}>
                <Text style={styles.dishName} numberOfLines={2}>
                  {dish.name}
                </Text>
                {dish.price && (
                  <Text style={styles.dishPrice}>${dish.price.toFixed(2)}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ),
    [isDeleteMode, selectedForDeletion, toggleDishSelection, handleRemoveDish, router],
  );

  const handleReset = useCallback(async () => {
    // Add confirmation dialog
    Alert.alert(
      'Reset All Finds',
      'Are you sure you want to clear all your saved dishes? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetFavorites();
              exitDeleteMode();
            } catch (error) {
              console.error('Failed to reset finds', error);
              setResetting(false);
            } finally {
              setResetting(false);
            }
          }
        },
      ]
    );
  }, [resetFavorites, exitDeleteMode]);

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  if (!loading && groups.length === 0) {
    return (
      <SafeAreaView style={styles.safeContainer}>
        <View style={styles.centeredContainer}>
          <Text style={styles.infoText}>
            {mode === 'guest'
              ? 'Swipe right on dishes to store them here.'
              : 'No finds yet. Swipe right on dishes to save them.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.flexContainer}>
        <View style={styles.resetBar}>
          <TouchableOpacity
            style={[styles.editButton, isDeleteMode && styles.editButtonActive]}
            onPress={isDeleteMode ? exitDeleteMode : () => setIsDeleteMode(true)}
          >
            <MaterialIcons
              name={isDeleteMode ? 'close' : 'edit'}
              size={20}
              color={isDeleteMode ? '#fff' : '#007AFF'}
            />
            <Text
              style={[styles.editButtonText, isDeleteMode && styles.editButtonTextActive]}
            >
              {isDeleteMode ? 'Cancel' : 'Select'}
            </Text>
          </TouchableOpacity>

          {/* Sort Button */}
          <TouchableOpacity
            style={[styles.sortButton, isDeleteMode && styles.sortButtonDisabled]}
            onPress={() => setShowSortMenu(!showSortMenu)}
            disabled={isDeleteMode}
          >
            <MaterialIcons name="sort" size={20} color={isDeleteMode ? '#ccc' : '#007AFF'} />
            <Text style={[styles.sortButtonText, isDeleteMode && styles.sortButtonTextDisabled]}>
              {sortBy === 'price' ? 'Price' : sortBy === 'likes' ? 'Most Liked' : sortBy === 'rating' ? 'Rating' : 'Distance'}
            </Text>
            <MaterialIcons
              name={showSortMenu ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={20}
              color={isDeleteMode ? '#ccc' : '#007AFF'}
            />
          </TouchableOpacity>

          {isDeleteMode && selectedForDeletion.size > 0 && (
            <TouchableOpacity style={styles.bulkDeleteButton} onPress={handleBulkDelete}>
              <MaterialIcons name="delete" size={20} color="#fff" />
              <Text style={styles.bulkDeleteButtonText}>
                Delete ({selectedForDeletion.size})
              </Text>
            </TouchableOpacity>
          )}

          {showSortMenu && !isDeleteMode && (
            <View style={styles.sortMenu}>
              <TouchableOpacity
                style={[styles.sortOption, sortBy === 'likes' && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy('likes');
                  setShowSortMenu(false);
                }}
              >
                <Text style={[styles.sortOptionText, sortBy === 'likes' && styles.sortOptionTextActive]}>
                  Most Liked
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortBy === 'price' && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy('price');
                  setShowSortMenu(false);
                }}
              >
                <Text style={[styles.sortOptionText, sortBy === 'price' && styles.sortOptionTextActive]}>
                  Price
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortBy === 'rating' && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy('rating');
                  setShowSortMenu(false);
                }}
              >
                <Text style={[styles.sortOptionText, sortBy === 'rating' && styles.sortOptionTextActive]}>
                  Rating
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sortOption, sortBy === 'distance' && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy('distance');
                  setShowSortMenu(false);
                }}
              >
                <Text style={[styles.sortOptionText, sortBy === 'distance' && styles.sortOptionTextActive]}>
                  Distance
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.resetButton, (resetting || isDeleteMode) && styles.resetButtonDisabled]}
            onPress={handleReset}
            disabled={resetting || isDeleteMode}
          >
            <MaterialIcons
              name={resetting ? 'hourglass-empty' : 'delete-sweep'}
              size={20}
              color={(resetting || isDeleteMode) ? '#ccc' : '#007AFF'}
            />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.restaurantsWrapper}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          onScrollBeginDrag={() => setShowSortMenu(false)} // Close sort menu on scroll
        >
          {groups.map((group, index) => renderRestaurantCard(group, index))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  flexContainer: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  infoText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
  },
  resetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    gap: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  editButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  editButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  editButtonTextActive: {
    color: '#fff',
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ff3b30',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bulkDeleteButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  resetButton: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  resetButtonDisabled: {
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flex: 1,
  },
  masonryWrapper: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  masonryColumn: {
    flex: 1,
    gap: 12,
  },
  masonryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
    position: 'relative',
  },
  cardVariantA: {
    minHeight: 260,
  },
  cardVariantB: {
    minHeight: 200,
  },
  cardSelected: {
    opacity: 0.85,
  },
  masonryImage: {
    width: '100%',
    height: 200,
  },
  masonryMeta: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dishName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  dishPrice: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 4,
  },
  dishCuisine: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  restaurantTag: {
    fontSize: 12,
    color: '#9c9c9c',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  // Sort button styles
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  sortButtonDisabled: {
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  sortButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  sortButtonTextDisabled: {
    color: '#ccc',
  },
  sortMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 140,
    zIndex: 1000,
  },
  sortOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sortOptionActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  sortOptionText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  sortOptionTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  // New restaurant card styles
  restaurantsWrapper: {
    padding: 16,
    gap: 20,
  },
  restaurantCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  restaurantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12, // Reduced vertical padding
    backgroundColor: '#f8f8f8',
  },
  restaurantInfo: {
    flex: 1,
  },
  restaurantName: {
    fontSize: 16, // Slightly smaller for the new layout
    fontWeight: '700',
    color: '#222',
    flex: 1, // Allow text to wrap if needed
  },
  infoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // Compact spacing between items
  },
  gridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minWidth: 35, // Consistent minimum width
    justifyContent: 'center',
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  priceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 30,
    textAlign: 'center',
  },
  dishCountText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  indicatorsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dishScrollView: {
    maxHeight: 140,
  },
  dishCarousel: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  carouselDish: {
    width: 120,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  carouselDishSelected: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  carouselDishImage: {
    width: '100%',
    height: 80,
  },
  dishSelectionOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0, 122, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
  },
  dishInfo: {
    padding: 8,
  },
  dishName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#222',
    marginBottom: 2,
  },
  dishPrice: {
    fontSize: 11,
    fontWeight: '600',
    color: '#007AFF',
  },
});

