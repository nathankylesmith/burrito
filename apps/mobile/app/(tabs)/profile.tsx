import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { useSessionWithRole } from '../../lib/useSessionWithRole';

export default function Profile() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const { user, userRole, loading: sessionLoading } = useSessionWithRole();


  async function handleEmailPasswordAuth() {
    if (!email || !password) {
      Alert.alert('Missing info', 'Enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          Alert.alert('Sign in failed', error.message);
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: Linking.createURL('/'),
          },
        });
        if (error) {
          Alert.alert('Sign up failed', error.message);
        } else {
          Alert.alert('Account created', 'Check your inbox to confirm your email if required.');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink() {
    if (!email) {
      Alert.alert('Missing email', 'Enter your email to receive a link.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: Linking.createURL('/'),
      },
    });
    setLoading(false);
    if (error) {
      Alert.alert('Magic link failed', error.message);
    } else {
      Alert.alert('Check your email', 'Open the link on this device to finish signing in.');
    }
  }

  async function handleSocialLogin(provider: 'google' | 'facebook') {
    try {
      setOauthLoading(provider);
      const redirectTo = Linking.createURL('/');
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });
      if (error) {
        Alert.alert('OAuth error', error.message);
      }
    } finally {
      setOauthLoading(null);
    }
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setEmail('');
    }
  }

  if (sessionLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator />
        </View>
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Profile</Text>
          <View style={styles.userInfo}>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>{user.email}</Text>
            {userRole && (
              <Text style={[styles.label, { marginTop: 10 }]}>Role: {userRole}</Text>
            )}
          </View>

          {userRole === 'admin' && (
            <TouchableOpacity 
              style={styles.adminButton} 
              onPress={() => router.push('/admin')}
            >
              <Text style={styles.adminButtonText}>Admin Dashboard</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{mode === 'signIn' ? 'Sign In' : 'Create Account'}</Text>
        <Text style={styles.subtitle}>
          {mode === 'signIn'
            ? 'Sign in with email & password, a magic link, or social login.'
            : 'Create an account with email & password to sync your finds everywhere.'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleEmailPasswordAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'signIn' ? 'Sign In' : 'Create Account'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          <Text style={styles.secondaryButtonText}>
            {mode === 'signIn'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.line} />
        </View>
        <TouchableOpacity
          style={styles.magicLinkButton}
          onPress={handleMagicLink}
          disabled={loading}
        >
          <Text style={styles.magicLinkText}>Email me a magic link</Text>
        </TouchableOpacity>
        <View style={styles.socialRow}>
          <SocialButton
            label="Google"
            provider="google"
            loading={oauthLoading === 'google'}
            onPress={handleSocialLogin}
          />
          <SocialButton
            label="Facebook"
            provider="facebook"
            loading={oauthLoading === 'facebook'}
            onPress={handleSocialLogin}
          />
        </View>
      </View>
    </View>
  );
}

interface SocialButtonProps {
  label: string;
  provider: 'google' | 'facebook';
  loading: boolean;
  onPress: (provider: 'google' | 'facebook') => void;
}

const SocialButton = ({ label, provider, loading, onPress }: SocialButtonProps) => (
  <TouchableOpacity
    style={[styles.socialButton, loading && styles.buttonDisabled]}
    onPress={() => onPress(provider)}
    disabled={loading}
  >
    {loading ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <Text style={styles.socialButtonText}>{label}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '500',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 8,
    color: '#666',
    fontSize: 13,
  },
  magicLinkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  magicLinkText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  socialButton: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  socialButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  userInfo: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  adminButton: {
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
    marginBottom: 15,
  },
  adminButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

