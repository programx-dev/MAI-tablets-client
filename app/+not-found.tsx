// app/+not-found.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/screen';
import { useTheme } from 'react-native-paper';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <Screen style={styles.container}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.onSurface }]}>404</Text>
        <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
          Страница не найдена
        </Text>
        <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
          Возможно, вы перешли по неверной ссылке.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.8,
  },
});