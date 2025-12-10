// app/modals/take-medication.tsx
import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from 'react-native';
import { Screen } from '@/components/screen';
import { Portal, Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDatabase } from '@/hooks/use-database';
import apiClient from '@/services/api';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
  interpolate,
  Extrapolation,
  runOnJS,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';

// 🔹 Confetti animation (base64 encoded tiny .lottie)
const CONFETTI_LOTTIE = {
  v: '5.10.2',
  fr: 60,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  nm: 'Confetti',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'Confetti',
      sr: 1,
      ks: {
        o: { a: 0, k: 100, ix: 11 },
        r: { a: 0, k: 0, ix: 10 },
        p: { a: 0, k: [100, 100, 0], ix: 2, l: 2 },
        a: { a: 0, k: [0, 0, 0], ix: 1, l: 2 },
        s: { a: 0, k: [100, 100, 100], ix: 6, l: 2 },
      },
      ao: 0,
      shapes: [],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const useScaledFontSize = (baseSize: number): number => {
  const scale = Math.min(screenWidth / 375, 1.3);
  return Math.max(12, baseSize * scale);
};

// 🔹 Gradient Pill Icon с динамической иконкой и пульсом
const GradientPillIcon = memo(
  ({
    size = 64,
    actionStatus,
    pulseProgress,
  }: {
    size?: number;
    actionStatus: { type: 'taken' | 'skipped'; time: string } | null;
    pulseProgress: Animated.SharedValue<number>;
  }) => {
    const animatedValue = useSharedValue(0);
    const containerSize = size + 8;

    const animatedStyle = useAnimatedStyle(() => {
      const inputRange = [0, 1];
      const outputRange = ['rgb(109, 91, 255)', 'rgb(94, 204, 123)'];
      const color = interpolateColor(
        animatedValue.value,
        inputRange,
        outputRange
      );
      return {
        borderColor: color,
        transform: [{ rotate: `${animatedValue.value * 360}deg` }],
      };
    });

    const iconColor = actionStatus?.type === 'taken' ? '#4CAF50' : '#A090FF';
    const iconSource =
      actionStatus?.type === 'taken' ? 'check-bold' : 'pill';

    useEffect(() => {
      const id = setInterval(() => {
        animatedValue.value = withTiming(1, {
          duration: 5000,
          easing: Easing.linear,
        });
      }, 5000);
      return () => clearInterval(id);
    }, [animatedValue]);

    // Пульсирующая волна
    const pulseStyle = useAnimatedStyle(() => {
      return {
        opacity: interpolate(pulseProgress.value, [0, 0.5, 1], [0.4, 0.8, 0], Extrapolation.CLAMP),
        transform: [
          { scale: interpolate(pulseProgress.value, [0, 1], [1, 1.8], Extrapolation.CLAMP) },
        ],
      };
    });

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {/* Пульсирующая волна */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: containerSize * 2,
              height: containerSize * 2,
              borderRadius: (containerSize * 2) / 2,
              borderWidth: 2,
              borderColor:
                actionStatus?.type === 'taken'
                  ? '#4CAF5040'
                  : '#FF3B3040',
              zIndex: -1,
            },
            pulseStyle,
          ]}
        />

        <Animated.View
          style={[
            {
              width: containerSize,
              height: containerSize,
              borderRadius: containerSize / 2,
              borderWidth: 2,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 24,
              shadowColor: '#6D5BFF',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
              elevation: 8,
            },
            animatedStyle,
          ]}
        >
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: '#2A2742',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon source={iconSource} size={size * 0.6} color={iconColor} />
          </View>
        </Animated.View>
      </View>
    );
  }
);

// 🔹 Liquid Fill View (имитация наполнения)
const LiquidFillView = memo(
  ({
    progress,
    color,
    height = 8,
    borderRadius = 4,
  }: {
    progress: Animated.SharedValue<number>;
    color: string;
    height?: number;
    borderRadius?: number;
  }) => {
    const fillStyle = useAnimatedStyle(() => {
      return {
        width: `${progress.value * 100}%`,
        backgroundColor: color,
        height,
        borderRadius,
      };
    });

    return (
      <View
        style={{
          width: '100%',
          height,
          backgroundColor: `${color}20`,
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[{ height }, fillStyle]} />
      </View>
    );
  }
);

export default function TakeMedicationModal() {
  const { medicationId, plannedTime } = useLocalSearchParams<{
    medicationId: string;
    plannedTime: string;
  }>();
  const router = useRouter();
  const { getMedications, addIntake, deleteMedication, deleteFutureIntakes } =
    useDatabase();
  const insets = useSafeAreaInsets();

  const [medication, setMedication] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [actionStatus, setActionStatus] = useState<{
    type: 'taken' | 'skipped';
    time: string;
  } | null>(null);
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: '',
  });
  const [showConfetti, setShowConfetti] = useState(false);

  // Для parallax и liquid-fill
  const scrollY = useSharedValue(0);
  const liquidProgress = useSharedValue(0);
  const pulseProgress = useSharedValue(0);

  const showSnackbar = useCallback((msg: string) => {
    setSnackbar({ visible: true, message: msg });
  }, []);

  const cleanPlannedTime = useMemo(() => {
    if (!plannedTime) return '00:00';
    if (plannedTime.includes('T')) {
      const timePart = plannedTime.split('T')[1];
      if (timePart.includes(':')) {
        return timePart.substring(0, 5);
      }
    }
    if (plannedTime.includes(':') && plannedTime.length > 5) {
      return plannedTime.substring(0, 5);
    }
    return plannedTime;
  }, [plannedTime]);

  useEffect(() => {
    const loadMed = async () => {
      try {
        if (!medicationId) {
          Alert.alert('Ошибка', 'ID лекарства не указан');
          router.back();
          return;
        }

        const meds = await getMedications();
        const found = meds.find((m) => m.id === Number(medicationId));

        if (!found) {
          console.warn('Лекарство не найдено по id:', medicationId);
          Alert.alert('Ошибка', 'Лекарство не найдено');
          router.back();
          return;
        }

        setMedication(found);
      } catch (error) {
        console.error('Ошибка загрузки лекарства:', error);
        Alert.alert('Ошибка', 'Не удалось загрузить лекарство');
        router.back();
      }
    };

    loadMed();
  }, [medicationId, router]);

  const handleIntakeAction = useCallback(
    async (taken: boolean) => {
      if (!medication) {
        Alert.alert('Ошибка', 'Лекарство не загружено');
        return;
      }

      const feedback = taken
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(feedback);
      setIsSyncing(true);

      try {
        const now = new Date();
        const formattedTime = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        const intakeDateTime = new Date(now);

        const localIntakeData = {
          medication_id: medication.id,
          planned_time: cleanPlannedTime,
          datetime: intakeDateTime.toISOString(),
          taken,
          skipped: !taken,
        };

        const serverIntakeData = {
          medication_id: medication.server_id ?? medication.id,
          planned_time: cleanPlannedTime,
          datetime: intakeDateTime.toISOString(),
          taken,
          skipped: !taken,
        };

        const localId = await addIntake(localIntakeData);

        // Анимация liquid-fill
        liquidProgress.value = withTiming(1, { duration: 800 });

        setActionStatus({
          type: taken ? 'taken' : 'skipped',
          time: formattedTime,
        });

        // Проверка: первый приём за день?
        const today = now.toDateString();
        const todayIntakes = await getMedications().then((meds) =>
          meds.flatMap((m) =>
            m.intakes?.filter(
              (i: any) =>
                new Date(i.datetime).toDateString() === today && i.taken
            ) || []
          )
        );
        if (taken && todayIntakes.length === 1) {
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2000);
        }

        try {
          await apiClient.intakeSync(serverIntakeData);
        } catch (syncError: any) {
          console.warn('⚠️ Синхронизация отложена:', syncError.message);
          showSnackbar('Данные сохранены на устройстве, синхронизация отложена');
        }

        setTimeout(() => {
          router.back();
        }, 1200);
      } catch (error: any) {
        console.error('❌ Ошибка сохранения:', error);
        setActionStatus(null);
        liquidProgress.value = 0;
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Ошибка', error.message || 'Не удалось сохранить приём');
      } finally {
        setIsSyncing(false);
      }
    },
    [medication, cleanPlannedTime, router, liquidProgress]
  );

  const handleMarkAsTaken = () => handleIntakeAction(true);
  const handleMarkAsSkipped = () => handleIntakeAction(false);
  const handleCancel = () => {
    if (!isSyncing) {
      Haptics.selectionAsync();
      router.back();
    }
  };

  const handleDelete = async () => {
    if (!medication) {
      Alert.alert('Ошибка', 'Лекарство не загружено');
      return;
    }

    Alert.alert(
      'Удалить лекарство?',
      `Вы уверены, что хотите удалить "${medication.name}"?\nВсе будущие приёмы также будут удалены.`,
      [
        {
          text: 'Отмена',
          style: 'cancel',
          onPress: () => Haptics.selectionAsync(),
        },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setIsSyncing(true);

            try {
              await deleteFutureIntakes(medication.id);
              await deleteMedication(medication.id);

              if (medication.server_id) {
                try {
                  await apiClient.deleteMedication(medication.server_id);
                } catch (syncError: any) {
                  console.warn(
                    '⚠️ Ошибка синхронизации удаления:',
                    syncError.message
                  );
                  showSnackbar(
                    `Частичное удаление: не на сервере (${syncError.message})`
                  );
                }
              }

              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              showSnackbar(`"${medication.name}" удалено`);
              setTimeout(() => router.back(), 600);
            } catch (error: any) {
              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Error
              );
              console.error('❌ Критическая ошибка удаления:', error);
              Alert.alert(
                'Ошибка',
                error.message || 'Не удалось удалить лекарство'
              );
            } finally {
              setIsSyncing(false);
            }
          },
        },
      ]
    );
  };

  // Пульс при действии
  useAnimatedReaction(
    () => !!actionStatus,
    (hasStatus, prev) => {
      if (hasStatus && !prev) {
        pulseProgress.value = withTiming(1, { duration: 600 }, () => {
          pulseProgress.value = withTiming(0, { duration: 600 });
        });
      }
    },
    [actionStatus]
  );

  const buttonColors = {
    taken: ['#34C759', '#5ECC7B'],
    skipped: ['#FF3B30', '#FF6B6B'],
  };

  const isLargeScreen = screenWidth >= 600;

  // Parallax style for background
  const bgStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scrollY.value, [-100, 100], [-5, 5], Extrapolation.CLAMP),
      },
    ],
  }));

  if (!medication) {
    return (
      <Screen header={false} style={{ backgroundColor: 'transparent' }}>
        <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
          <LinearGradient
            colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingTop: insets.top + 20,
          }}
        >
          <ActivityIndicator animating size="large" color="#6D5BFF" />
          <Text
            style={{
              color: '#B5B0D1',
              marginTop: 16,
              fontSize: useScaledFontSize(16),
              textAlign: 'center',
            }}
          >
            {isSyncing ? 'Синхронизация…' : 'Загрузка лекарства…'}
          </Text>
        </View>
      </Screen>
    );
  }

  const displayTime = cleanPlannedTime;

  return (
    <Screen header={false} style={{ backgroundColor: 'transparent' }}>
      {/* Animated Background with Parallax */}
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
        <LinearGradient
          colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Particles — simple animated dots */}
        {[...Array(8)].map((_, i) => (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              backgroundColor: i % 2 === 0 ? '#6D5BFF40' : '#5ECC7B10',
              borderRadius: 2,
              top: `${10 + (i * 15) % 70}%`,
              left: `${(i * 25) % 90}%`,
              opacity: 0.7,
            }}
          />
        ))}
      </Animated.View>

      {/* Blur overlay during sync */}
      {isSyncing && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              backdropFilter: 'blur(8px)',
            },
          ]}
        />
      )}

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: isLargeScreen ? 48 : screenWidth < 400 ? 16 : 28,
          alignItems: 'center',
          maxWidth: isLargeScreen ? 560 : screenWidth,
          alignSelf: 'center',
          width: '100%',
        }}
      >
        {/* Gradient Pill */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <GradientPillIcon
            size={isLargeScreen ? 80 : screenWidth < 400 ? 56 : 72}
            actionStatus={actionStatus}
            pulseProgress={pulseProgress}
          />
        </Animated.View>

        {/* Заголовок */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(200)}
          style={{ width: '100%', alignItems: 'center' }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontWeight: '800',
              fontSize: useScaledFontSize(32),
              textAlign: 'center',
              marginBottom: 8,
              textShadowColor: '#6D5BFF40',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
              letterSpacing: -0.8,
              includeFontPadding: false,
            }}
          >
            {medication.name}
          </Text>
          <View
            style={{
              height: 2,
              width: 64,
              backgroundColor: '#6D5BFF',
              borderRadius: 1,
              marginBottom: 28,
            }}
          />
        </Animated.View>

        {/* Время */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(300)}
          style={{ width: '100%', marginBottom: 28 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <Icon source="clock-outline" size={24} color="#A8A2D2" />
            <Text
              style={{
                color: '#A8A2D2',
                fontSize: useScaledFontSize(19),
                fontWeight: '600',
              }}
            >
              Запланировано на {displayTime}
            </Text>
          </View>
        </Animated.View>

        {/* Инструкция */}
        {medication.instructions && (
          <Animated.View
            entering={FadeInDown.duration(400).delay(350)}
            style={{ width: '100%', marginBottom: 32 }}
          >
            <View
              style={[
                {
                  borderRadius: 18,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: '#3A345F',
                },
                Platform.OS === 'ios'
                  ? {
                      backgroundColor: 'rgba(42, 39, 66, 0.4)',
                      backdropFilter: 'blur(20px)',
                    }
                  : { backgroundColor: '#2A2742CC' },
              ]}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <Icon
                  source="notebook-outline"
                  size={20}
                  color="#A8A2D2"
                  style={{ marginTop: 2 }}
                />
                <Text
                  style={{
                    color: '#D0D0E0',
                    fontSize: useScaledFontSize(15.5),
                    flex: 1,
                    lineHeight: 24,
                    flexShrink: 1,
                    includeFontPadding: false,
                  }}
                >
                  {medication.instructions}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Статус с Liquid Fill */}
        {actionStatus && (
          <Animated.View
            entering={FadeIn.duration(400)}
            exiting={FadeOut}
            style={[
              {
                width: '100%',
                marginBottom: 40,
                borderRadius: 18,
                padding: 24,
                borderWidth: 1,
                alignItems: 'center',
              },
              Platform.OS === 'ios'
                ? {
                    backgroundColor: 'rgba(30, 43, 30, 0.5)',
                    backdropFilter: 'blur(20px)',
                    borderColor: actionStatus.type === 'taken' ? '#34C75940' : '#FF3B3040',
                  }
                : {
                    backgroundColor:
                      actionStatus.type === 'taken' ? '#1E2B1ECC' : '#2B1E1ECC',
                    borderColor:
                      actionStatus.type === 'taken' ? '#34C759' : '#FF3B30',
                  },
            ]}
          >
            <Icon
              source={actionStatus.type === 'taken' ? 'check-circle' : 'close-circle'}
              size={56}
              color={actionStatus.type === 'taken' ? '#4CAF50' : '#EF5350'}
            />
            <Text
              style={{
                color: 'white',
                fontSize: useScaledFontSize(22),
                marginTop: 14,
                fontWeight: '800',
                textAlign: 'center',
                lineHeight: 28,
                includeFontPadding: false,
              }}
            >
              {actionStatus.type === 'taken'
                ? `Вы приняли\nв ${actionStatus.time}`
                : `Вы пропустили\nв ${actionStatus.time}`}
            </Text>

            {/* Liquid fill bar */}
            <View style={{ width: '100%', marginTop: 20 }}>
              <LiquidFillView
                progress={liquidProgress}
                color={actionStatus.type === 'taken' ? '#4CAF50' : '#EF5350'}
                height={6}
                borderRadius={3}
              />
            </View>
          </Animated.View>
        )}

        {/* Confetti */}
        {showConfetti && (
          <View
            style={{
              position: 'absolute',
              top: insets.top + 100,
              width: 200,
              height: 200,
              zIndex: 999,
            }}
          >
            <LottieView
              source={CONFETTI_LOTTIE}
              autoPlay
              loop={false}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        )}

        {/* Кнопки */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(400)}
          style={{ width: '100%', gap: 16, marginTop: 'auto' }}
        >
          <Pressable
            disabled={isSyncing}
            onPressIn={() => Haptics.selectionAsync()}
            onPress={handleMarkAsSkipped}
            style={({ pressed }) => [
              styles.gradientButton,
              { opacity: isSyncing ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <LinearGradient
              colors={buttonColors.skipped}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientButtonInner}
            >
              <Icon
                source="close-circle-outline"
                size={26}
                color="#FFFFFF"
                style={{ marginRight: 12 }}
              />
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: '#FFF',
                    fontSize: useScaledFontSize(18),
                    fontWeight: '700',
                  },
                ]}
              >
                Пропустить
              </Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            disabled={isSyncing}
            onPressIn={() => Haptics.selectionAsync()}
            onPress={handleMarkAsTaken}
            style={({ pressed }) => [
              styles.gradientButton,
              { opacity: isSyncing ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
            ]}
          >
            <LinearGradient
              colors={buttonColors.taken}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientButtonInner}
            >
              <Icon
                source="pill"
                size={26}
                color="#FFFFFF"
                style={{ marginRight: 12 }}
              />
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: '#FFF',
                    fontSize: useScaledFontSize(18),
                    fontWeight: '700',
                  },
                ]}
              >
                Принять
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Удалить */}
        <TouchableOpacity
          onPress={handleDelete}
          activeOpacity={0.6}
          disabled={isSyncing}
          style={{
            position: 'absolute',
            top: insets.top + 24,
            right: isLargeScreen ? 48 : screenWidth < 400 ? 16 : 28,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: isSyncing ? '#2A2742' : '#FF3B3020',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#FF3B30',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 6,
            elevation: 4,
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Icon
            source="delete-outline"
            size={28}
            color={isSyncing ? '#666' : '#FF3B30'}
          />
        </TouchableOpacity>
      </View>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2500}
        style={{
          position: 'absolute',
          bottom: insets.bottom + 20,
          left: 0,
          right: 0,
          marginHorizontal: 16,
        }}
      >
        {snackbar.message}
      </Snackbar>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gradientButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    height: 72,
  },
  gradientButtonInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  buttonText: {
    letterSpacing: 0.3,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});