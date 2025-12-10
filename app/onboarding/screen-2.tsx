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

export default function OnboardingScreen2() {
  const router = useRouter();
  const { colors } = useTheme();

  // Анимации — как в schedule
  const pulse = useSharedValue(0);
  const nextButtonScale = useSharedValue(1);
  const backButtonScale = useSharedValue(1);

  const pulseStartedRef = useRef(false);

  if (!pulseStartedRef.current) {
    pulseStartedRef.current = true;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.in(Easing.ease) })
      ),
      -1,
      true
    );
  }

  const animatedIconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: 1 + 0.05 * pulse.value },
        { rotate: `${2 * pulse.value}deg` },
      ],
    };
  });

  const animatedTitleStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.85 + 0.15 * pulse.value,
    };
  });

  const nextButtonAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: nextButtonScale.value }],
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

  const handleNext = useCallback(() => {
    router.push('/onboarding/screen-3');
  }, [router]);

  const handleBack = useCallback(() => {
    router.push('/onboarding/screen-1');
  }, [router]);

  return (
    <Screen style={styles.screen}>
      {/* 🔹 Фон — как в schedule и screen-1 */}
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
                <Icon source="alarm" size={28} color="#A090FF" />
              </View>
              <Animated.Text style={[styles.headerTitle, animatedTitleStyle]}>
                Напоминания под ваш график
              </Animated.Text>
            </View>
          </LinearGradient>
        </Card>

        {/* 🔹 Основной контент */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.content}>
          <Animated.Text entering={FadeInDown.delay(100).duration(400)} style={styles.subtitle}>
            Вы сами выбираете время, частоту и название препарата. Мы будем напоминать — мягко, но надёжно.
          </Animated.Text>

          {/* 🔹 Анимированная иконка */}
          <Animated.View
            entering={FadeInDown.delay(200).duration(600)}
            style={[styles.iconBox, animatedIconStyle]}
          >
            <LinearGradient
              colors={['#6D5BFF20', '#FF950020']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconGradient}
            >
              <Icon source="clock-outline" size={64} color="#A090FF" />
            </LinearGradient>
          </Animated.View>

          {/* 🔹 Пагинация */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.pagination}>
            <View style={styles.dot} />
            <View style={[styles.dot, styles.activeDot]} />
            <View style={styles.dot} />
          </Animated.View>
        </Animated.View>

        {/* 🔹 Кнопки */}
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
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  iconBox: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#A090FF30',
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