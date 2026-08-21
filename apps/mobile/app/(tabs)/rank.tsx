import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

interface Dish {
  dishId: string;
  name: string;
  description: string;
  imageUrl?: string;
  restaurant: string;
  cuisineType?: string | null;
  price?: number | null;
}

const DEFAULT_IMAGE_URL = 'https://placehold.co/500x350?text=Dish';
const MAX_RANK_DISHES = 10;
const ALL_CUISINE = '__ALL__';

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

function buildPairs(count: number): [number, number][] {
  const combinations: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      combinations.push([i, j]);
    }
  }
  for (let i = combinations.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [combinations[i], combinations[randomIndex]] = [combinations[randomIndex], combinations[i]];
  }
  return combinations;
}

export default function RankScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activeCuisine, setActiveCuisine] = useState<string>(ALL_CUISINE);
  const [isLoading, setIsLoading] = useState(false);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [pairs, setPairs] = useState<[number, number][]>([]);
  const [pairIndex, setPairIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string>(ALL_CUISINE);

  useEffect(() => {
    loadCuisineTypes();
  }, []);

  async function loadCuisineTypes() {
    const { data, error } = await supabase
      .from('dishes')
      .select('cuisine_type', { distinct: true })
      .order('cuisine_type');

    if (error) {
      console.error('Failed to load cuisine types for rank tab', error);
      return;
    }

    const types =
      data
        ?.map((item: { cuisine_type: string | null }) => item.cuisine_type)
        .filter((type): type is string => Boolean(type)) || [];

    const uniqueTypes = Array.from(new Set(types));
    setCuisineTypes(uniqueTypes);
  }

  const loadRankDishes = useCallback(
    async (options?: { query?: string; cuisine?: string }) => {
      const queryText = options?.query ?? searchQuery;
      const cuisineFilter = options?.cuisine ?? selectedCuisine;
      const trimmed = queryText.trim();

      setIsLoading(true);
      setErrorMessage(null);
      setHasStarted(true);
      setActiveQuery(trimmed);
      setActiveCuisine(cuisineFilter);
      setPairIndex(0);
      setScores({});

      try {
        let builder = supabase
          .from('dishes')
          .select('id, name, description, image_url, cuisine_type, price, restaurant_id')
          .limit(40);

        if (cuisineFilter && cuisineFilter !== ALL_CUISINE) {
          builder = builder.eq('cuisine_type', cuisineFilter);
        }

        const sanitized = trimmed.replace(/[%_]/g, '').trim();
        if (sanitized) {
          const pattern = `%${sanitized}%`;
          builder = builder.ilike('cuisine_type', pattern);
        }

        const { data, error } = await builder;
        if (error) {
          throw error;
        }

        const restaurantIds = [
          ...new Set(data?.map((dish: any) => dish.restaurant_id).filter(Boolean) || []),
        ];

        const restaurantMap = new Map<string, string>();
        if (restaurantIds.length > 0) {
          const { data: restaurants } = await supabase
            .from('restaurants')
            .select('id, name')
            .in('id', restaurantIds);

          restaurants?.forEach((restaurant) => {
            restaurantMap.set(restaurant.id, restaurant.name);
          });
        }

        const normalizedQuery = trimmed.toLowerCase();
        const formatted =
          data?.map((dish: any) => ({
            dishId: dish.id,
            name: dish.name,
            description: dish.description || '',
            imageUrl: imagePublicUrl(dish.image_url),
            restaurant: restaurantMap.get(dish.restaurant_id) || 'Unknown',
            cuisineType: dish.cuisine_type,
            price: dish.price,
          })) || [];

        let filtered = formatted;
        if (trimmed) {
          filtered = filtered.filter((dish) =>
            `${dish.name} ${dish.description} ${dish.cuisineType || ''}`
              .toLowerCase()
              .includes(normalizedQuery)
          );
        }

        const limited = filtered.slice(0, MAX_RANK_DISHES);

        if (limited.length < 2) {
          setDishes(limited);
          setPairs([]);
          setErrorMessage('Need at least two dishes to rank. Try a broader search.');
          return;
        }

        const combos = buildPairs(limited.length);
        setDishes(limited);
        setPairs(combos);
        setScores(
          limited.reduce(
            (acc, dish) => ({
              ...acc,
              [dish.dishId]: 0,
            }),
            {}
          )
        );
      } catch (error) {
        console.error('Error loading rank dishes', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load dishes for ranking.'
        );
        setDishes([]);
        setPairs([]);
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, selectedCuisine]
  );

  const handleSearchSubmit = useCallback(() => {
    loadRankDishes({ query: searchQuery });
  }, [loadRankDishes, searchQuery]);

  const handleSelectCuisine = useCallback(
    (cuisine: string) => {
      setSelectedCuisine(cuisine);
    },
    []
  );

  const handleVote = useCallback(
    (winnerIndex: number) => {
      const pair = pairs[pairIndex];
      if (!pair) {
        return;
      }
      const winner = dishes[winnerIndex];
      if (!winner) {
        return;
      }
      setScores((prev) => ({
        ...prev,
        [winner.dishId]: (prev[winner.dishId] ?? 0) + 1,
      }));
      setPairIndex((prev) => prev + 1);
    },
    [dishes, pairIndex, pairs]
  );

  const handleReset = useCallback(() => {
    setSearchQuery('');
    setActiveQuery('');
    setActiveCuisine(ALL_CUISINE);
    setDishes([]);
    setPairs([]);
    setScores({});
    setPairIndex(0);
    setHasStarted(false);
    setErrorMessage(null);
    setSelectedCuisine(ALL_CUISINE);
  }, []);

  const totalComparisons = pairs.length;
  const comparisonsDone = pairIndex;
  const rankingComplete = totalComparisons > 0 && pairIndex >= totalComparisons;
  const currentPair = !rankingComplete ? pairs[pairIndex] : undefined;
  const leftDish = currentPair ? dishes[currentPair[0]] : undefined;
  const rightDish = currentPair ? dishes[currentPair[1]] : undefined;

  const sortedResults = useMemo(() => {
    if (dishes.length === 0) {
      return [];
    }
    return [...dishes].sort(
      (a, b) => (scores[b.dishId] ?? 0) - (scores[a.dishId] ?? 0)
    );
  }, [dishes, scores]);

  const renderSearchBar = () => (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search a cuisine or dish (optional)"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={handleSearchSubmit}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearchSubmit}>
          <Text style={styles.searchButtonText}>Start</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cuisineScroll}
        style={styles.cuisineScrollWrapper}
      >
        <TouchableOpacity
          style={[styles.cuisineChip, selectedCuisine === ALL_CUISINE && styles.cuisineChipActive]}
          onPress={() => handleSelectCuisine(ALL_CUISINE)}
        >
          <Text
            style={[
              styles.cuisineChipText,
              selectedCuisine === ALL_CUISINE && styles.cuisineChipTextActive,
            ]}
          >
            All dishes
          </Text>
        </TouchableOpacity>
        {cuisineTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.cuisineChip, selectedCuisine === type && styles.cuisineChipActive]}
            onPress={() => handleSelectCuisine(type)}
          >
            <Text
              style={[
                styles.cuisineChipText,
                selectedCuisine === type && styles.cuisineChipTextActive,
              ]}
            >
              {type}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderDishOption = (dish: Dish, position: 'left' | 'right') => (
    <TouchableOpacity
      style={styles.rankCard}
      onPress={() => handleVote(position === 'left' ? currentPair![0] : currentPair![1])}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: dish.imageUrl ?? DEFAULT_IMAGE_URL }}
        style={styles.rankImage}
        resizeMode="cover"
      />
      <View style={styles.rankMeta}>
        <Text style={styles.rankRestaurant}>{dish.restaurant}</Text>
        <Text style={styles.rankDish}>{dish.name}</Text>
        {!!dish.description && (
          <Text numberOfLines={2} style={styles.rankDescription}>
            {dish.description}
          </Text>
        )}
        {!!dish.price && <Text style={styles.rankPrice}>${dish.price.toFixed(2)}</Text>}
      </View>
      <Text style={styles.rankChoiceLabel}>
        Choose this {position === 'left' ? 'one' : 'dish'}
      </Text>
    </TouchableOpacity>
  );

  const renderResults = () => (
    <ScrollView contentContainerStyle={styles.resultsList}>
      {sortedResults.map((dish, index) => (
        <View key={dish.dishId} style={styles.resultCard}>
          <Text style={styles.resultRank}>{index + 1}</Text>
          <Image
            source={{ uri: dish.imageUrl ?? DEFAULT_IMAGE_URL }}
            style={styles.resultImage}
            resizeMode="cover"
          />
          <View style={styles.resultMeta}>
            <Text style={styles.resultDish}>{dish.name}</Text>
            <Text style={styles.resultRestaurant}>{dish.restaurant}</Text>
            <Text style={styles.resultScore}>
              Wins: {scores[dish.dishId] ?? 0} / {totalComparisons}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeContainer}>
      <View style={styles.container}>
        {renderSearchBar()}
        {!hasStarted && (
          <Text style={styles.helperText}>
            Search for a cuisine or pick one of the cuisines below, or leave it blank to rank all
            dishes.
          </Text>
        )}
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        {isLoading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.progressLabel}>Loading dishes...</Text>
          </View>
        )}

        {!isLoading && rankingComplete && sortedResults.length > 0 && (
          <>
            <Text style={styles.progressLabel}>
              Ranking complete for{' '}
              {activeQuery
                ? `"${activeQuery}"`
                : activeCuisine !== ALL_CUISINE
                ? `${activeCuisine}`
                : 'all dishes'}
              . Tap below to rerun or start a new search.
            </Text>
            {renderResults()}
            <View style={styles.resultsActions}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => loadRankDishes({ query: activeQuery, cuisine: activeCuisine })}
              >
                <Text style={styles.primaryButtonText}>Rank Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleReset}>
                <Text style={styles.secondaryButtonText}>New Search</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!isLoading && hasStarted && !rankingComplete && leftDish && rightDish && (
          <>
            <Text style={styles.progressLabel}>
              Comparing {comparisonsDone + 1} of {totalComparisons}
            </Text>
            <View style={styles.rankRow}>
              {renderDishOption(leftDish, 'left')}
              {renderDishOption(rightDish, 'right')}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 12,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  cuisineScrollWrapper: {
    marginTop: 4,
  },
  cuisineScroll: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  cuisineChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#e5e5e5',
    borderRadius: 999,
    marginRight: 10,
  },
  cuisineChipActive: {
    backgroundColor: '#007AFF',
  },
  cuisineChipText: {
    color: '#444',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  cuisineChipTextActive: {
    color: '#fff',
  },
  helperText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 40,
    fontSize: 16,
  },
  errorText: {
    color: '#D0342C',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  centered: {
    alignItems: 'center',
    marginTop: 30,
  },
  progressLabel: {
    textAlign: 'center',
    color: '#555',
    marginVertical: 12,
  },
  rankRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rankCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rankImage: {
    width: '100%',
    height: 220,
  },
  rankMeta: {
    padding: 16,
    gap: 4,
  },
  rankRestaurant: {
    color: '#777',
    fontSize: 13,
  },
  rankDish: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  rankDescription: {
    color: '#666',
    fontSize: 13,
  },
  rankPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  rankChoiceLabel: {
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '600',
    color: '#007AFF',
  },
  resultsList: {
    paddingVertical: 12,
    gap: 12,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  resultRank: {
    fontSize: 20,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
    color: '#007AFF',
  },
  resultImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  resultMeta: {
    flex: 1,
  },
  resultDish: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  resultRestaurant: {
    fontSize: 13,
    color: '#777',
  },
  resultScore: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
  },
  resultsActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});

