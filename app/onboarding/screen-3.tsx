import React, { useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Text, Card, Icon, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function OnboardingScreen3() {
  const router = useRouter();
  const { colors } = useTheme();

  // Анимации — как в schedule
  const glow = useSharedValue(0);
  const startButtonScale = useSharedValue(1);
  const backButtonScale = useSharedValue(1);

  const glowStartedRef = useRef(false);

  if (!glowStartedRef.current) {
    glowStartedRef.current = true;
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 800, easing: Easing.in(Easing.cubic) })
      ),
      -1,
      true
    );
  }

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: 1 + 0.08 * glow.value },
        { rotate: `${1 * glow.value}deg` },
      ],
      opacity: 0.8 + 0.2 * glow.value,
    };
  });

  const animatedCheckStyle = useAnimatedStyle(() => {
    return {
      shadowColor: '#5ECC7B',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6 * glow.value,
      shadowRadius: 16 + 8 * glow.value,
      elevation: 12 + 4 * glow.value,
    };
  });

  const startButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: startButtonScale.value }],
    };
  });

  const backButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: backButtonScale.value }],
    };
  });

  const onPressIn = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(0.96, { duration: 100 });
  };

  const onPressOut = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(1, { duration: 150 });
  };

  const handleStart = useCallback(async () => {
    await AsyncStorage.setItem('onboarding_viewed', 'true');
    router.replace('/');
  }, [router]);

  const handleBack = useCallback(() => {
    router.push('/onboarding/screen-2');
  }, [router]);

  return (
    <Screen style={styles.screen}>
      {/* 🔹 Фон — как во всех остальных экранах */}
      <LinearGradient
        colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.container}>
        {/* 🔹 Заголовочная карточка */}
        <Card mode="contained" style={styles.headerCard}>
          <LinearGradient
            colors={['#1E1C33', '#151328']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerIcon}>
                <Icon source="check-all" size={28} color="#5ECC7B" />
              </View>
              <Text style={styles.headerTitle}>Всё готово!</Text>
            </View>
          </LinearGradient>
        </Card>

        {/* 🔹 Основной контент */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.content}>
          <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={styles.subtitle}>
            Теперь вы всегда будете в курсе приёма лекарств. Здоровье — в ваших руках!
          </Animated.Text>

          {/* 🔹 Анимированная "галочка-успех" */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(700)}
            style={[styles.iconBox, animatedCheckStyle]}
          >
            <Animated.View style={[styles.iconInner, animatedIconStyle]}>
              <LinearGradient
                colors={['#5ECC7B20', '#5ECC7B40']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <Icon source="check-circle" size={64} color="#5ECC7B" />
              </LinearGradient>
            </Animated.View>
          </Animated.View>

          {/* 🔹 Пагинация */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.pagination}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.activeDot]} />
          </Animated.View>
        </Animated.View>

        {/* 🔹 Кнопки */}
        <View style={styles.buttonContainer}>
          <Animated.View entering={FadeIn.delay(400).duration(400)} style={styles.buttonRow}>
            <Animated.View style={startButtonAnimatedStyle}>
              <TouchableOpacity
                onPress={handleStart}
                onPressIn={onPressIn(startButtonScale)}
                onPressOut={onPressOut(startButtonScale)}
                activeOpacity={0.85}
                style={styles.startButton}
              >
                <LinearGradient
                  colors={['#5ECC7B', '#4CAF50']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.startButtonText}>Начать использовать</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={backButtonAnimatedStyle}>
              <TouchableOpacity
                onPress={handleBack}
                onPressIn={onPressIn(backButtonScale)}
                onPressOut={onPressOut(backButtonScale)}
                activeOpacity={0.85}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>← Назад</Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  headerCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#3A345F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  headerGradient: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#5ECC7B15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    flexShrink: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    color: '#A8A2D2',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginHorizontal: 20,
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  iconBox: {
    width: 130,
    height: 130,
    borderRadius: 65,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    backgroundColor: '#1E1C33',
    borderWidth: 2,
    borderColor: '#5ECC7B30',
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3A345F',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#5ECC7B',
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  buttonRow: {
    width: '100%',
    gap: 12,
  },
  startButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#5ECC7B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  backButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#1E1C33',
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#A8A2D2',
    fontSize: 16,
    fontWeight: '500',
  },
});