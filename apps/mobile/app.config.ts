import type { ExpoConfig } from '@expo/config-types';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const loadLocalEnv = () => {
  const envPath = resolve(__dirname, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, 'utf8');
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split('=');
    if (!rawKey) {
      continue;
    }

    const key = rawKey.trim();

    if (process.env[key] !== undefined) {
      continue;
    }

    const value = rawValue.join('=').trim();
    const unquoted = value.replace(/^['"]|['"]$/g, '');
    process.env[key] = unquoted;
  }
};

loadLocalEnv();

const config: ExpoConfig = {
  name: 'DishSwipe',
  slug: 'dishswipe',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  splash: {
    backgroundColor: '#ffffff',
  },
  assetBundlePatterns: ['**/*'],
  scheme: 'dishswipe',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.dishswipe.app',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#ffffff',
    },
    package: 'com.dishswipe.app',
  },
  web: {},
  plugins: ['expo-router', 'expo-head'],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? null,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? null,
  },
};

export default config;
