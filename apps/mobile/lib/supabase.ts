import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

type ExtraConfig = {
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
};

const getExtraConfig = (): ExtraConfig => {
  // Expo Go (development) exposes values on `expoConfig`, while standalone builds
  // expose them on `manifest`. We check both to support every environment.
  const { expoConfig, manifest } = Constants;
  return {
    ...(expoConfig?.extra as ExtraConfig | undefined),
    ...(manifest?.extra as ExtraConfig | undefined),
  };
};

const extra = getExtraConfig();

export const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  extra.supabaseUrl ||
  '';

export const supabaseRestUrl = supabaseUrl.replace(/\/$/, '') + '/rest/v1';

export const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  extra.supabaseAnonKey ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  const missing: string[] = [];
  if (!supabaseUrl) {
    missing.push('EXPO_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseAnonKey) {
    missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  }

  throw new Error(
    `Supabase configuration is missing. Set the following environment variables: ${missing.join(', ')}`,
  );
}

const normalizeHeaders = (headersInit: RequestInit['headers']) => {
  if (!headersInit) {
    return {};
  }

  if (Array.isArray(headersInit)) {
    return Object.fromEntries(headersInit);
  }

  if (typeof headersInit === 'object' && typeof (headersInit as Headers).forEach === 'function') {
    const normalized: Record<string, string> = {};
    (headersInit as Headers).forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  return headersInit;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: async (url, options: RequestInit = {}) => {
      const fullUrl =
        typeof url === 'string' && !url.startsWith('http')
          ? `${supabaseUrl}${url.startsWith('/') ? '' : '/'}${url}`
          : url;

      const normalizedHeaders = normalizeHeaders(options.headers) as Record<string, string>;
      if (!normalizedHeaders.apikey) {
        normalizedHeaders.apikey = supabaseAnonKey;
      }

      try {
        const response = await fetch(fullUrl, {
          ...options,
          headers: normalizedHeaders,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Supabase request failed:', {
            status: response.status,
            statusText: response.statusText,
            url: fullUrl,
            errorText
          });
        }
        return response;
      } catch (error) {
        console.error('Network request failed:', error, fullUrl);
        throw error;
      }
    },
  },
});

