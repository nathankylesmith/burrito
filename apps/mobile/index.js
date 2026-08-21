// Entry point for Expo Router
process.env.EXPO_ROUTER_APP_ROOT = process.env.EXPO_ROUTER_APP_ROOT ?? './app';
import './polyfills/url';
import 'expo-router/entry';

