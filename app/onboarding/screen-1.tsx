import React, { useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
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
  interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const DAY_WIDTH = (width - 48) / 7;

export default function OnboardingScreen1() {
  const router = useRouter();
  const { colors } = useTheme();

  // 🔹 Анимации — как в schedule
  const todayPulse = useSharedValue(0);
  const skipButtonScale = useSharedValue(1);
  const nextButtonScale = useSharedValue(1);

  const pulseStartedRef = useRef(false);

  // Пульсация "акцентного" элемента
  if (!pulseStartedRef.current) {
    pulseStartedRef.current = true;
    todayPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 650, easing: Easing.in(Easing.ease) })
      ),
      -1,
      true
    );
  }

  const animatedTitleStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.8 + 0.2 * todayPulse.value,
      transform: [{ scale: 1 + 0.02 * todayPulse.value }],
    };
  });

  const skipButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: skipButtonScale.value }],
    };
  });

  const nextButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: nextButtonScale.value }],
    };
  });

  const handleSkip = useCallback(async () => {
    await AsyncStorage.setItem('onboarding_viewed', 'true');
    router.replace('/');
  }, [router]);

  const handleNext = useCallback(() => {
    router.push('/onboarding/screen-2');
  }, [router]);

  const onPressIn = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(0.96, { duration: 100 });
  };

  const onPressOut = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(1, { duration: 150 });
  };

  return (
    <Screen style={styles.screen}>
      {/* 🔹 Фон — ИДЕНТИЧЕН schedule.tsx и notifications.tsx */}
      <LinearGradient
        colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.container}>
        {/* 🔹 Верхняя "календарная" карточка — стилизована под week header */}
        <Card mode="contained" style={styles.headerCard}>
          <LinearGradient
            colors={['#1E1C33', '#151328']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerIcon}>
                <Icon source="pill" size={28} color="#A090FF" />
              </View>
              <Animated.Text style={[styles.headerTitle, animatedTitleStyle]}>
                Не забывайте принимать лекарства вовремя!
              </Animated.Text>
            </View>
          </LinearGradient>
        </Card>

        {/* 🔹 Основной контент */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
          <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={styles.subtitle}>
            Наше приложение напомнит вам о каждом приёме лекарств — даже если вы заняты, устали или в дороге.
          </Animated.Text>

          {/* 🔹 Индикатор шагов — как календарь, но упрощён */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.pagination}>
            <View style={[styles.dot, styles.activeDot]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </Animated.View>

          {/* 🔹 Иконка-иллюстрация (анимированная пульсация) */}
          <Animated.View
            entering={FadeInDown.delay(300).duration(500)}
            style={[
              styles.illustrationBox,
              {
                transform: [
                  { scale: 1 + 0.04 * todayPulse.value },
                  { rotate: `${3 * todayPulse.value}deg` },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={['#6D5BFF30', '#5ECC7B20']}
              style={styles.illustrationGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Icon source="pill" size={60} color="#A090FF" />
            </LinearGradient>
          </Animated.View>
        </Animated.View>

        {/* 🔹 Кнопки — как в schedule, но вертикально */}
        <View style={styles.buttonContainer}>
          <Animated.View entering={FadeIn.delay(400).duration(400)} style={styles.buttonRow}>
            <Animated.View style={nextButtonAnimatedStyle}>
              <TouchableOpacity
                onPress={handleNext}
                onPressIn={onPressIn(nextButtonScale)}
                onPressOut={onPressOut(nextButtonScale)}
                activeOpacity={0.85}
                style={styles.nextButton}
              >
                <LinearGradient
                  colors={['#6D5BFF', '#8A7FFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.buttonGradient}
                >
                  <Text style={styles.nextButtonText}>Далее</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={skipButtonAnimatedStyle}>
              <TouchableOpacity
                onPress={handleSkip}
                onPressIn={onPressIn(skipButtonScale)}
                onPressOut={onPressOut(skipButtonScale)}
                activeOpacity={0.85}
                style={styles.skipButton}
              >
                <Text style={styles.skipButtonText}>Пропустить</Text>
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
    backgroundColor: '#6D5BFF15',
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
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3A345F', // ✅ как surfaceDisabled, но в тёмной теме
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#5ECC7B', // ✅ зелёный — принятый приём (акцент)
  },
  illustrationBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  illustrationGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#A090FF30',
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  buttonRow: {
    width: '100%',
    gap: 12,
  },
  nextButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  skipButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#1E1C33',
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#A8A2D2',
    fontSize: 16,
    fontWeight: '500',
  },
});