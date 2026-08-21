import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

export default function ImportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState('');
  const [radius, setRadius] = useState('1500');
  const [maxResults, setMaxResults] = useState('5');
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState({
    location: '',
    radius: '',
    maxResults: '',
  });

  const validateInputs = () => {
    const newErrors = {
      location: '',
      radius: '',
      maxResults: '',
    };

    const [latStr = '', lngStr = ''] = location.split(',').map(part => part.trim());
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    const isValidLatLng =
      latStr.length > 0 &&
      lngStr.length > 0 &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180;

    if (!isValidLatLng) {
      newErrors.location = 'Enter a valid "lat,lng" coordinate (e.g. 34.0522,-118.2437).';
    }

    const parsedRadius = Number(radius);
    const safeRadius = Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 1500;
    if (!Number.isFinite(parsedRadius) || parsedRadius <= 0) {
      newErrors.radius = 'Radius must be a positive number of meters.';
    }
    setRadius(String(safeRadius));

    const parsedMaxResults = Number(maxResults);
    const safeMaxResults = Number.isFinite(parsedMaxResults) && parsedMaxResults > 0 ? Math.floor(parsedMaxResults) : 5;
    if (!Number.isFinite(parsedMaxResults) || parsedMaxResults <= 0) {
      newErrors.maxResults = 'Max results must be a positive number.';
    }
    setMaxResults(String(safeMaxResults));

    setErrors(newErrors);

    const hasErrors = Object.values(newErrors).some(Boolean);
    if (hasErrors) {
      return null;
    }

    return { parsedRadius: safeRadius, parsedMaxResults: safeMaxResults };
  };

  const handleImport = async () => {
    const validatedInputs = validateInputs();
    if (!validatedInputs) return;

    setLoading(true);
    setLogs(prev => ['Starting import...', ...prev]);

    try {
      const { data, error } = await supabase.functions.invoke('load-region', {
        body: {
          location,
          radius: validatedInputs.parsedRadius,
          maxResults: validatedInputs.parsedMaxResults,
          visionModel: 'gemini-2.0-flash-lite', // User specified model
        },
      });

      if (error) throw error;

      setLogs(prev => [`Success: ${JSON.stringify(data)}`, ...prev]);
      Alert.alert('Success', 'Import process completed!');
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.error?.message || 'Failed to start import. Please try again.';
      setLogs(prev => [`Error: ${errorMessage}`, ...prev]);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Import Data</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Location (lat,lng)</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. 34.0522,-118.2437"
            autoCapitalize="none"
          />
          {!!errors.location && <Text style={styles.errorText}>{errors.location}</Text>}
        </View>

        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={styles.label}>Radius (meters)</Text>
            <TextInput
              style={styles.input}
              value={radius}
              onChangeText={setRadius}
              keyboardType="numeric"
            />
            {!!errors.radius && <Text style={styles.errorText}>{errors.radius}</Text>}
          </View>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Max Results</Text>
            <TextInput
              style={styles.input}
              value={maxResults}
              onChangeText={setMaxResults}
              keyboardType="numeric"
            />
            {!!errors.maxResults && <Text style={styles.errorText}>{errors.maxResults}</Text>}
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleImport}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Start Import</Text>
          )}
        </TouchableOpacity>

        {logs.length > 0 && (
          <View style={styles.logsContainer}>
            <Text style={styles.logsTitle}>Logs:</Text>
            {logs.map((log, index) => (
              <Text key={index} style={styles.logText}>{log}</Text>
            ))}
          </View>
        )}
      </ScrollView>
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
    marginBottom: 20,
  },
  backButton: {
    marginRight: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logsContainer: {
    marginTop: 30,
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
  },
  logsTitle: {
    color: 'white',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    color: '#eee',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 5,
  },
  errorText: {
    color: '#d00',
    marginTop: 6,
    fontSize: 12,
  },
});

