import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function AdminScreen() {
  const router = useRouter();

  const actions = [
    {
      title: 'Review Pending Data',
      icon: 'rate-review',
      route: '/admin/review',
      description: 'Approve or reject imported dishes and restaurants',
    },
    {
      title: 'Import Data',
      icon: 'cloud-download',
      route: '/admin/import',
      description: 'Trigger new data imports for specific regions',
    },
    {
      title: 'Manage Database',
      icon: 'storage',
      route: '/admin/manage', // Page will need to be created or routed correctly if it doesn't exist
      description: 'Search and edit existing restaurants and dishes',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {actions.map((action, index) => (
          <TouchableOpacity
            key={index}
            style={styles.card}
            onPress={() => router.push(action.route as any)}
          >
            <View style={styles.iconContainer}>
              <MaterialIcons name={action.icon as any} size={32} color="#007AFF" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.cardTitle}>{action.title}</Text>
              <Text style={styles.cardDescription}>{action.description}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
        ))}
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
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
  },
});

