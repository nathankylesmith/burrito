import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSessionWithRole } from '../../lib/useSessionWithRole';

export default function AdminLayout() {
  const router = useRouter();
  const { isAdmin, loading } = useSessionWithRole();

  useEffect(() => {
    if (loading) return;

    if (!isAdmin) {
      router.replace('/(tabs)/profile');
    }
  }, [isAdmin, loading, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
