import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase, supabaseRestUrl } from '../../lib/supabase';

type ReviewItem = {
  id: string;
  subject_type: 'restaurant' | 'dish';
  subject_id: string;
  created_at: string;
  restaurant?: any;
  dish?: any;
};

export default function ReviewScreen() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const router = useRouter();

  const PAGE_SIZE = 20;

  useEffect(() => {
    fetchReviewItems();
  }, []);

  const fetchReviewItems = async (
    pageToLoad = 0,
    { append = false, isRefresh = false }: { append?: boolean; isRefresh?: boolean } = {},
  ) => {
    if (append) {
      setLoadingMore(true);
    } else if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Join with restaurant/dish data would be better done via a view or complex query,
      // but simpler to fetch queue then fetch subjects for now or use a view if created.
      // For MVP, let's just fetch queue and then we'll fetch details for the visible one or all.

      // Note: This requires the data_review_queue to be populated.
      // Since we don't have a complex join setup in client yet, let's just fetch dishes with review_status='pending'
      // This is a shortcut since we added review_status column to the main tables too.

      const { data: dishes, error: dishError } = await supabase
        .from('dishes')
        .select(`
          *,
          restaurant:restaurants(name)
        `)
        .eq('review_status', 'pending')
        .range(pageToLoad * PAGE_SIZE, pageToLoad * PAGE_SIZE + PAGE_SIZE - 1);

      if (dishError) throw dishError;

      const safeDishes = dishes ?? [];

      const formattedItems = safeDishes.map(d => ({
        id: d.id,
        subject_type: 'dish' as const,
        subject_id: d.id,
        created_at: d.created_at,
        dish: d,
      }));

      setHasMore(safeDishes.length === PAGE_SIZE);
      setItems(prev => (append ? [...prev, ...formattedItems] : formattedItems));
      setPage(pageToLoad);
      setErrorMessage(null);
    } catch (error: any) {
      const message = error?.message || 'Failed to load review queue.';
      setErrorMessage(message);
      Alert.alert('Error', message);
    } finally {
      if (append) {
        setLoadingMore(false);
      } else if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.subject_id)));
    }
  };

  const handleBulkAction = async (status: 'approved' | 'rejected') => {
    if (selectedItems.size === 0) {
      Alert.alert('No Selection', 'Please select items to perform bulk action.');
      return;
    }

    const actionText = status === 'rejected' ? 'DELETE' : 'APPROVE';
    const confirmMessage = `Are you sure you want to ${actionText} ${selectedItems.size} item${selectedItems.size > 1 ? 's' : ''}?`;
    Alert.alert(
      'Confirm Bulk Action',
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            try {
              // Process all selected items
              const actionPromises = Array.from(selectedItems).map(async (itemId) => {
                if (status === 'rejected') {
                  // DELETE the dish from database
                  const deleteUrl = `${supabaseRestUrl}/dishes?id=eq.${itemId}`;

                  const response = await fetch(deleteUrl, {
                    method: 'DELETE',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabase.supabaseKey}`,
                      'apikey': supabase.supabaseKey,
                    },
                  });

                  if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to delete ${itemId}: ${response.status} ${errorText}`);
                  }

                } else {
                  // APPROVE: Update the review_status
                  const updateUrl = `${supabaseRestUrl}/dishes?id=eq.${itemId}`;

                  const response = await fetch(updateUrl, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabase.supabaseKey}`,
                      'apikey': supabase.supabaseKey,
                    },
                    body: JSON.stringify({ review_status: status }),
                  });

                  if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to update ${itemId}: ${response.status} ${errorText}`);
                  }
                }

                return itemId;
              });

              await Promise.all(actionPromises);

              // Remove from local state
              setItems(prev => prev.filter(i => !selectedItems.has(i.subject_id)));
              setSelectedItems(new Set());

            } catch (error: any) {
              console.error('Bulk action failed:', error);
              Alert.alert('Error', `Bulk action failed: ${error.message}`);
            }
          },
        },
      ]
    );
  };



  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    try {
      if (status === 'rejected') {
        // DELETE the dish from database for rejection
        const deleteUrl = `${supabaseRestUrl}/dishes?id=eq.${id}`;

        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.supabaseKey}`,
            'apikey': supabase.supabaseKey,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Delete failed: ${response.status} ${errorText}`);
        }

      } else {
        // APPROVE: Update the review_status to 'approved'
        const updateUrl = `${supabaseRestUrl}/dishes?id=eq.${id}`;

        const response = await fetch(updateUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabase.supabaseKey}`,
            'apikey': supabase.supabaseKey,
          },
          body: JSON.stringify({ review_status: status }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Update failed: ${response.status} ${errorText}`);
        }
      }

      // Remove from local state (both approve and reject remove from pending queue)
      setItems(prev => prev.filter(i => i.subject_id !== id));

    } catch (error: any) {
      console.error('Review failed:', error);
      Alert.alert('Error', `Review failed: ${error.message}`);
    }
  };

  const renderItem = ({ item }: { item: ReviewItem }) => {
    const isSelected = selectedItems.has(item.subject_id);

    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <TouchableOpacity
          style={styles.selectionOverlay}
          onPress={() => toggleItemSelection(item.subject_id)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <MaterialIcons name="check" size={16} color="white" />}
          </View>
        </TouchableOpacity>

      <View style={styles.cardContent}>
        <Text style={styles.typeLabel}>{item.subject_type.toUpperCase()}</Text>
        {item.dish && (
          <>
            <Text style={styles.restaurantName}>{item.dish.restaurant?.name}</Text>
            <Text style={styles.itemName}>{item.dish.name}</Text>
            {item.dish.image_url && (
              <Image source={{ uri: item.dish.image_url }} style={styles.image} />
            )}
            <Text style={styles.description}>{item.dish.description}</Text>
            <Text style={styles.meta}>
              Confidence: {item.dish.confidence_score || 'N/A'} | Price: {item.dish.price || 'N/A'}
            </Text>
          </>
        )}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.rejectButton]} 
          onPress={() => handleReview(item.subject_id, 'rejected')}
        >
          <MaterialIcons name="close" size={24} color="white" />
          <Text style={styles.actionText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.approveButton]} 
          onPress={() => handleReview(item.subject_id, 'approved')}
        >
          <MaterialIcons name="check" size={24} color="white" />
          <Text style={styles.actionText}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>
          Review Queue ({items.length})
          {selectedItems.size > 0 && ` • ${selectedItems.size} selected`}
        </Text>
        <TouchableOpacity onPress={fetchReviewItems} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Bulk action buttons when items are selected */}
      {selectedItems.size > 0 && (
        <View style={styles.bulkActionsContainer}>
          <TouchableOpacity
            onPress={toggleSelectAll}
            style={[styles.bulkActionButton, styles.selectAllButton]}
          >
            <MaterialIcons
              name={selectedItems.size === items.length ? "check-box" : "check-box-outline-blank"}
              size={20}
              color="#666"
            />
            <Text style={styles.bulkActionText}>
              {selectedItems.size === items.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bulkActionButtons}>
            <TouchableOpacity
              onPress={() => handleBulkAction('rejected')}
              style={[styles.bulkActionButton, styles.bulkRejectButton]}
            >
              <MaterialIcons name="close" size={20} color="white" />
              <Text style={styles.bulkActionButtonText}>Reject ({selectedItems.size})</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleBulkAction('approved')}
              style={[styles.bulkActionButton, styles.bulkApproveButton]}
            >
              <MaterialIcons name="check" size={20} color="white" />
              <Text style={styles.bulkActionButtonText}>Approve ({selectedItems.size})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => fetchReviewItems(page)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}


      {loading ? (
        <View style={styles.center}>
          <Text>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshing={refreshing}
          onRefresh={() => fetchReviewItems(0, { isRefresh: true })}
          onEndReached={() => {
            if (!loadingMore && hasMore) {
              fetchReviewItems(page + 1, { append: true });
            }
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No pending items to review!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  backButton: {
    padding: 5,
  },
  refreshButton: {
    padding: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  bulkActionsContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bulkActionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  bulkActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  selectAllButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  bulkRejectButton: {
    backgroundColor: '#dc3545',
    flex: 1,
  },
  bulkApproveButton: {
    backgroundColor: '#28a745',
    flex: 1,
  },
  bulkActionText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  bulkActionButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
  selectionOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  errorBanner: {
    backgroundColor: '#fdecea',
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f5c6cb',
  },
  errorText: {
    color: '#8a1c1c',
    fontWeight: '600',
  },
  errorActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  retryText: {
    color: '#8a1c1c',
    textDecorationLine: 'underline',
  },
  list: {
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  cardContent: {
    padding: 15,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 5,
    backgroundColor: '#eee',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  restaurantName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  itemName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#eee',
  },
  description: {
    fontSize: 14,
    color: '#444',
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    color: '#888',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  rejectButton: {
    backgroundColor: '#ff3b30',
  },
  approveButton: {
    backgroundColor: '#34c759',
  },
  actionText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});

