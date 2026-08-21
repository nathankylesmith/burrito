import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

type Mode = 'dishes' | 'restaurants';

type Restaurant = {
  id: string;
  name: string;
  cuisine_type?: string | null;
  city?: string | null;
  state?: string | null;
  review_status?: string | null;
};

type Dish = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  cuisine_type?: string | null;
  review_status?: string | null;
  restaurant?: Restaurant | null;
};

type RequestType = 'restaurant' | 'dish';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

export default function ManageScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('dishes');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<(Restaurant | Dish)[]>([]);
  const [selected, setSelected] = useState<Restaurant | Dish | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>('restaurant');
  const [requestName, setRequestName] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [importLocation, setImportLocation] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'dishes') {
        let builder = supabase
          .from('dishes')
          .select(
            `id, name, description, price, cuisine_type, review_status, restaurant:restaurants(id, name, city, state)`,
          )
          .order('updated_at', { ascending: false })
          .limit(50);

        if (query.trim()) {
          builder = builder.or(
            `name.ilike.%${query}%,description.ilike.%${query}%,cuisine_type.ilike.%${query}%`,
          );
        }

        const { data, error: fetchError } = await builder;
        if (fetchError) throw fetchError;
        setItems(data || []);
      } else {
        let builder = supabase
          .from('restaurants')
          .select('id, name, cuisine_type, city, state, review_status')
          .order('updated_at', { ascending: false })
          .limit(50);

        if (query.trim()) {
          builder = builder.or(
            `name.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%,cuisine_type.ilike.%${query}%`,
          );
        }

        const { data, error: fetchError } = await builder;
        if (fetchError) throw fetchError;
        setItems(data || []);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unable to load records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, query]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 350);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  useEffect(() => {
    setSelected(null);
  }, [mode]);

  useEffect(() => {
    if (!selected) {
      setEditFields({});
      return;
    }

    if (mode === 'dishes') {
      const dish = selected as Dish;
      setEditFields({
        name: dish.name || '',
        description: dish.description || '',
        price: dish.price ? String(dish.price) : '',
        cuisine_type: dish.cuisine_type || '',
      });
    } else {
      const restaurant = selected as Restaurant;
      setEditFields({
        name: restaurant.name || '',
        city: restaurant.city || '',
        state: restaurant.state || '',
        cuisine_type: restaurant.cuisine_type || '',
      });
    }
  }, [selected, mode]);

  const updateSelected = async (updates: Record<string, any>) => {
    if (!selected) return;

    const table = mode === 'dishes' ? 'dishes' : 'restaurants';
    const previous = selected;
    const optimistic = { ...selected, ...updates } as Restaurant | Dish;

    setSaving(true);
    setSelected(optimistic);
    setItems(prev => prev.map(item => (item.id === previous.id ? optimistic : item)));

    try {
      const { error: updateError } = await supabase.from(table).update(updates).eq('id', previous.id);
      if (updateError) throw updateError;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save changes');
      setSelected(previous);
      setItems(prev => prev.map(item => (item.id === previous.id ? previous : item)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;

    Alert.alert('Delete record?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const table = mode === 'dishes' ? 'dishes' : 'restaurants';
            const { error: deleteError } = await supabase.from(table).delete().eq('id', selected.id);
            if (deleteError) throw deleteError;
            setItems(prev => prev.filter(item => item.id !== selected.id));
            setSelected(null);
          } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to delete record');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleSave = () => {
    if (!selected) return;
    if (mode === 'dishes') {
      updateSelected({
        name: editFields.name,
        description: editFields.description,
        price: editFields.price ? parseFloat(editFields.price) : null,
        cuisine_type: editFields.cuisine_type || null,
      });
    } else {
      updateSelected({
        name: editFields.name,
        city: editFields.city || null,
        state: editFields.state || null,
        cuisine_type: editFields.cuisine_type || null,
      });
    }
  };

  const handleRequest = async () => {
    if (!requestName.trim()) {
      Alert.alert('Missing details', 'Please add a name for the request.');
      return;
    }

    setRequesting(true);
    try {
      const payload = {
        subject_type: requestType,
        subject_id: uuid(),
        notes: `${requestName.trim()}${requestNote ? ` — ${requestNote.trim()}` : ''}`,
        priority: 1,
      };
      const { error: requestError } = await supabase.from('data_review_queue').insert(payload);
      if (requestError) throw requestError;
      setRequestName('');
      setRequestNote('');
      Alert.alert('Request sent', 'We recorded your request for review/import.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create request');
    } finally {
      setRequesting(false);
    }
  };

  const handleQuickImport = async () => {
    if (!importLocation.trim()) {
      Alert.alert('Missing location', 'Provide a lat,lng to request an import.');
      return;
    }

    setImportLoading(true);
    try {
      const { error } = await supabase.functions.invoke('load-region', {
        body: {
          location: importLocation,
          radius: 1500,
          maxResults: 5,
          visionModel: 'gemini-2.0-flash-lite',
        },
      });

      if (error) throw error;
      Alert.alert('Import started', 'Triggered an import run for the provided location.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unable to start import');
    } finally {
      setImportLoading(false);
    }
  };

  const renderItem = ({ item }: { item: Restaurant | Dish }) => {
    const isDish = mode === 'dishes';
    const dish = item as Dish;
    const restaurant = (isDish ? dish.restaurant : item) as Restaurant | undefined;
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{(item as any).review_status || 'pending'}</Text>
          </View>
        </View>
        {isDish && dish.description ? <Text style={styles.cardDescription}>{dish.description}</Text> : null}
        <View style={styles.cardMetaRow}>
          {isDish && dish.price ? <Text style={styles.metaText}>${dish.price.toFixed(2)}</Text> : null}
          {(restaurant?.city || restaurant?.state) && (
            <Text style={styles.metaText}>
              {restaurant?.city}
              {restaurant?.city && restaurant?.state ? ', ' : ''}
              {restaurant?.state}
            </Text>
          )}
          {(item as any).cuisine_type ? <Text style={styles.metaText}>{(item as any).cuisine_type}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Manage Database</Text>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.modeToggle}>
          {(['dishes', 'restaurants'] as Mode[]).map(value => (
            <TouchableOpacity
              key={value}
              style={[styles.modeButton, mode === value && styles.modeButtonActive]}
              onPress={() => setMode(value)}
            >
              <Text style={[styles.modeText, mode === value && styles.modeTextActive]}>{value}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder={`Search ${mode}...`}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.helperText}>Loading latest {mode}...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          onRefresh={() => {
            setRefreshing(true);
            fetchItems();
          }}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.helperText}>No results found.</Text>
            </View>
          }
        />
      )}

      {selected && (
        <View style={styles.detailPanel}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Edit {mode === 'dishes' ? 'Dish' : 'Restaurant'}</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <MaterialIcons name="close" size={20} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={editFields.name || ''}
              onChangeText={text => setEditFields(prev => ({ ...prev, name: text }))}
            />
            {mode === 'dishes' ? (
              <>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={editFields.description || ''}
                  onChangeText={text => setEditFields(prev => ({ ...prev, description: text }))}
                  multiline
                  numberOfLines={3}
                />
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={editFields.price || ''}
                  onChangeText={text => setEditFields(prev => ({ ...prev, price: text }))}
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  value={editFields.city || ''}
                  onChangeText={text => setEditFields(prev => ({ ...prev, city: text }))}
                />
                <Text style={styles.label}>State</Text>
                <TextInput
                  style={styles.input}
                  value={editFields.state || ''}
                  onChangeText={text => setEditFields(prev => ({ ...prev, state: text }))}
                />
              </>
            )}
            <Text style={styles.label}>Cuisine</Text>
            <TextInput
              style={styles.input}
              value={editFields.cuisine_type || ''}
              onChangeText={text => setEditFields(prev => ({ ...prev, cuisine_type: text }))}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.saveButton, saving && styles.disabledButton]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.actionText}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton, deleting && styles.disabledButton]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator color="white" /> : <Text style={styles.actionText}>Delete</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      )}

      <View style={styles.adminPanel}>
        <Text style={styles.panelTitle}>Admin controls</Text>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request a new record</Text>
          <View style={styles.modeToggle}>
            {(['restaurant', 'dish'] as RequestType[]).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.modeButton, requestType === type && styles.modeButtonActive]}
                onPress={() => setRequestType(type)}
              >
                <Text style={[styles.modeText, requestType === type && styles.modeTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder={`Name of the ${requestType}`}
            value={requestName}
            onChangeText={setRequestName}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Notes or links"
            value={requestNote}
            onChangeText={setRequestNote}
            multiline
            numberOfLines={2}
          />
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton, requesting && styles.disabledButton]}
            onPress={handleRequest}
            disabled={requesting}
          >
            {requesting ? <ActivityIndicator color="white" /> : <Text style={styles.actionText}>Send request</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick import</Text>
          <TextInput
            style={styles.input}
            placeholder="Latitude,Longitude"
            value={importLocation}
            onChangeText={setImportLocation}
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton, importLoading && styles.disabledButton]}
            onPress={handleQuickImport}
            disabled={importLoading}
          >
            {importLoading ? <ActivityIndicator color="white" /> : <Text style={styles.actionText}>Start import</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} onPress={() => router.push('/admin/import')}>
            <Text style={[styles.actionText, styles.secondaryText]}>Open full import flow</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  backButton: {
    marginRight: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  toolbar: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#007AFF',
  },
  modeText: {
    fontWeight: '600',
    color: '#555',
    textTransform: 'capitalize',
  },
  modeTextActive: {
    color: 'white',
  },
  searchInput: {
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  list: {
    padding: 20,
    paddingBottom: 260,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  statusPill: {
    backgroundColor: '#eef2ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    color: '#333',
    textTransform: 'capitalize',
  },
  cardDescription: {
    marginTop: 6,
    color: '#666',
  },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  metaText: {
    color: '#444',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperText: {
    color: '#666',
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#b91c1c',
  },
  detailPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 10,
    maxHeight: '60%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 4,
    color: '#333',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  secondaryButton: {
    backgroundColor: '#e5e7eb',
  },
  disabledButton: {
    opacity: 0.7,
  },
  actionText: {
    color: 'white',
    fontWeight: '700',
  },
  secondaryText: {
    color: '#111827',
  },
  adminPanel: {
    padding: 20,
    backgroundColor: '#0f172a',
  },
  panelTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
});
