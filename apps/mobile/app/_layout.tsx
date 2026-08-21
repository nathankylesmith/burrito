import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { FavoritesProvider } from '../context/FavoritesContext';

function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <FavoritesProvider>
      {children}
    </FavoritesProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthGate>
    </GestureHandlerRootView>
  );
}

