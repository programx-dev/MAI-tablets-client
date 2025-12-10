// app/(tabs)/profile.tsx
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
  Pressable,
  Linking,
  AppState,
  Share,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Button, Text, TextInput, ActivityIndicator, Card, Snackbar } from 'react-native-paper';
import { Screen } from '@/components/screen';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from 'react-native-paper';
// 📦 Expo modules
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
// 🔹 QR Code
import QRCode from 'react-native-qrcode-svg';
// 🔹 ✅ Правильные импорты из expo-camera (SDK ≥ 50)
import { CameraView } from 'expo-camera'; // ← Компонент для рендера
import { Camera } from 'expo-camera';     // ← API-объект для разрешений (статические методы)
import apiClient from '@/services/api';

const { width } = Dimensions.get('window');

// 🔹 Типы API
type Friend = { uuid: string; username?: string };
type FriendStatus = 'online' | 'offline';

// ⚠️ MOCK — замените на реальный запрос к бэкенду, когда будет API статусов
const mockGetFriendStatus = (uuid: string): FriendStatus => {
  return Math.random() < 0.8 ? 'online' : 'offline';
};

const parseFriend = (data: any): Friend | null => {
  if (typeof data === 'object' && data && typeof data.uuid === 'string') {
    return { uuid: data.uuid, username: typeof data.username === 'string' ? data.username : undefined };
  }
  return null;
};

const useScaledFontSize = (baseSize: number): number => {
  const scale = Math.min(width / 375, 1.3);
  return Math.max(12, baseSize * scale);
};

// 🔹 Компонент аватара
const GradientAvatar = memo(({ size = 100, name = '' }: { size?: number; name?: string }) => {
  const animatedValue = useSharedValue(0);
  const containerSize = size + 8;
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [0, 1];
    const outputRange = ['rgb(109, 91, 255)', 'rgb(94, 204, 123)'];
    const color = interpolateColor(animatedValue.value, inputRange, outputRange);
    return {
      borderColor: color,
      transform: [{ rotate: `${animatedValue.value * 360}deg` }],
    };
  });

  useEffect(() => {
    const id = setInterval(() => {
      animatedValue.value = withTiming(1, { duration: 3000, easing: Easing.linear });
    }, 3000);
    return () => clearInterval(id);
  }, [animatedValue]);

  const initial = name ? name.trim().charAt(0).toUpperCase() : '?';
  return (
    <Animated.View
      style={[
        styles.avatarContainer,
        { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
        animatedStyle,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`Аватар: ${name || 'пользователь'}`}
    >
      <View
        style={[
          styles.avatarInner,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={[styles.avatarText, { fontSize: useScaledFontSize(42) }]}>{initial}</Text>
      </View>
    </Animated.View>
  );
});

// 🔹 ✅ Исправленный BarcodeScannerView с CameraView + Camera API
const BarcodeScannerView = memo(
  ({
    onScanSuccess,
    onCancel,
  }: {
    onScanSuccess: (code: string) => void;
    onCancel: () => void;
  }) => {
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [scanned, setScanned] = useState(false);
    const cameraRef = useRef<CameraView>(null);

    useEffect(() => {
      const getCameraPermissions = async () => {
        try {
          let status: string;
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CAMERA,
              {
                title: 'Доступ к камере',
                message: 'MedFriend нужен доступ к камере для сканирования QR-кодов.',
                buttonNeutral: 'Спросить позже',
                buttonNegative: 'Отмена',
                buttonPositive: 'OK',
              }
            );
            status = granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
          } else {
            // ✅ Правильно: вызываем у Camera (не CameraView!)
            const { status: permStatus } = await Camera.requestCameraPermissionsAsync();
            status = permStatus;
          }
          setHasPermission(status === 'granted');
        } catch (err) {
          console.error('Failed to request camera permissions:', err);
          setHasPermission(false);
        }
      };
      getCameraPermissions();
    }, []);

    const handleBarcodeScanned = useCallback(
      ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);
        const trimmed = data.trim();
        console.log('Scanned raw ', trimmed);
        let code = '';
        const deepLinkMatch = trimmed.match(/medfriend:\/\/invite\/(\d{6})/);
        if (deepLinkMatch) {
          code = deepLinkMatch[1];
        } else if (/^\d{6}$/.test(trimmed)) {
          code = trimmed;
        }
        if (code) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onScanSuccess(code);
        } else {
          Alert.alert(
            'Неверный QR-код',
            'Код должен содержать 6 цифр или ссылку medfriend://invite/XXXXXX'
          );
          setTimeout(() => setScanned(false), 1000);
        }
      },
      [scanned, onScanSuccess]
    );

    if (hasPermission === null) {
      return (
        <View style={styles.scannerContainer}>
          <ActivityIndicator size="large" color="#6D5BFF" />
          <Text style={styles.scannerText}>Запрашиваем доступ к камере…</Text>
        </View>
      );
    }
    if (hasPermission === false) {
      return (
        <View style={styles.scannerContainer}>
          <Icon source="camera-off" size={48} color="#FF4444" />
          <Text style={[styles.scannerText, { color: '#FF4444', marginTop: 16 }]}>
            Доступ к камере запрещён
          </Text>
          <Button
            mode="contained"
            onPress={() => Linking.openSettings()}
            style={{ marginTop: 20, backgroundColor: '#6D5BFF' }}
          >
            Открыть настройки
          </Button>
          <Button mode="text" onPress={onCancel} style={{ marginTop: 12 }}>
            Отмена
          </Button>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        {/* ✅ Используем CameraView */}
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>Наведите на QR-код приглашения</Text>
        </View>
        <Pressable
          style={styles.cancelButton}
          onPress={onCancel}
          accessibilityLabel="Отменить сканирование"
        >
          <Icon source="close" size={32} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }
);

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invite?: string }>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [screen, setScreen] = useState<'main' | 'generate' | 'enter' | 'scan'>('main');
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [expiresInSeconds, setExpiresInSeconds] = useState<number>(180);
  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [medFriend, setMedFriend] = useState<Friend | null>(null);
  const [patient, setPatient] = useState<Friend | null>(null);
  const [medFriendStatus, setMedFriendStatus] = useState<FriendStatus | null>(null);
  const [patientStatus, setPatientStatus] = useState<FriendStatus | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  const animatedSeconds = useSharedValue(expiresInSeconds);
  const displayTime = useDerivedValue(() => {
    const mins = Math.floor(animatedSeconds.value / 60);
    const secs = animatedSeconds.value % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  });

  const pulse = useSharedValue(0);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  const showSnackbar = (msg: string) => {
    setSnackbar({ visible: true, message: msg });
  };

  const refreshRelations = useCallback(async (abortSignal?: AbortSignal) => {
    try {
      const [medFriendRes, patientRes] = await Promise.allSettled([
        apiClient.getWithAuth('/friends/get-med-friend').catch(() => null),
        apiClient.getWithAuth('/friends/get-patient').catch(() => null),
      ]);
      if (abortSignal?.aborted) return;

      const med = medFriendRes.status === 'fulfilled' && medFriendRes.value ? parseFriend(medFriendRes.value) : null;
      const pat = patientRes.status === 'fulfilled' && patientRes.value ? parseFriend(patientRes.value) : null;

      setMedFriend(med);
      setPatient(pat);

      // ⚠️ Замените mockGetFriendStatus на реальный вызов API статуса, когда будет готово:
      // if (med) setMedFriendStatus(await fetchFriendStatus(med.uuid));
      // if (pat) setPatientStatus(await fetchFriendStatus(pat.uuid));
      if (med) setMedFriendStatus(mockGetFriendStatus(med.uuid));
      if (pat) setPatientStatus(mockGetFriendStatus(pat.uuid));
    } catch (error) {
      if (!abortSignal?.aborted) {
        console.warn('Ошибка обновления связей:', error);
      }
    }
  }, []);

  // 🔁 Загрузка связей при фокусе — без medFriend в зависимостях!
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const abortController = new AbortController();
      const loadRelations = async () => {
        setLoading(true);
        await refreshRelations(abortController.signal);
        if (isActive && !abortController.signal.aborted) {
          setLoading(false);
          setIsInitialized(true);
        }
      };
      loadRelations();
      return () => {
        isActive = false;
        abortController.abort();
        if (timerInterval.current) clearInterval(timerInterval.current);
      };
    }, [refreshRelations])
  );

  // 🎯 Обработка invite — ОДИН РАЗ, с очисткой
  useEffect(() => {
    if (params.invite && !medFriend && screenRef.current === 'main' && isInitialized) {
      const code = params.invite.trim();
      if (/^\d{6}$/.test(code)) {
        Alert.alert(
          'Приглашение',
          `Обнаружен код: ${code}
Хотите подключиться?`,
          [
            { text: 'Нет', style: 'cancel' },
            {
              text: 'Да',
              onPress: () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInviteCodeInput(code);
                setScreen('enter');
                // ✅ Очистка invite из URL — критично!
                router.replace('/tabs/profile');
              },
            },
          ]
        );
      } else {
        // Некорректный код — тоже убираем, чтобы не циклил
        router.replace('/tabs/profile');
      }
    }
  }, [params.invite, medFriend, isInitialized, router]);

  // Таймер генерации кода
  useEffect(() => {
    if (screen === 'generate') {
      animatedSeconds.value = expiresInSeconds;
      if (timerInterval.current) clearInterval(timerInterval.current);
      timerInterval.current = setInterval(() => {
        if (animatedSeconds.value > 0) {
          animatedSeconds.value -= 1;
        } else {
          if (timerInterval.current) clearInterval(timerInterval.current);
        }
      }, 1000);
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current);
    }
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [screen, expiresInSeconds]);

  // Слушатель активности приложения
  useEffect(() => {
    const handleAppStateChange = (nextState: string) => {
      if (nextState === 'active' && screen === 'generate') {
        refreshRelations();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [screen, refreshRelations]);

  // Автоподтверждение при вводе 6 цифр
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (screen === 'enter' && inviteCodeInput.length === 6) {
      timeout = setTimeout(() => {
        handleEnterCode();
      }, 400);
    }
    return () => clearTimeout(timeout);
  }, [inviteCodeInput, screen]);

  const handleGenerateCode = useCallback(async () => {
    if (patient) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Недоступно', 'У вас уже есть пациент. Сначала отпишитесь.');
      return;
    }
    let isActive = true;
    setLoading(true);
    try {
      const res = await apiClient.postWithAuth('/friends/invitation', {});
      if (!isActive) return;
      setGeneratedCode(res.code);
      setExpiresInSeconds(res.expires_in_seconds);
      setScreen('generate');
      pulse.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }, () => {
        pulse.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) });
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error: any) {
      if (isActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Ошибка', error.message || 'Не удалось сгенерировать код');
      }
    } finally {
      if (isActive) setLoading(false);
    }
    return () => { isActive = false; };
  }, [patient, pulse]);

  const handleEnterCode = useCallback(async () => {
    if (medFriend) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Недоступно', 'У вас уже есть мед-друг. Сначала удалите текущего.');
      return;
    }
    const trimmed = inviteCodeInput.trim();
    if (trimmed.length !== 6 || isNaN(Number(trimmed))) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Неверный формат', 'Код должен состоять из 6 цифр');
      return;
    }
    let isActive = true;
    setLoading(true);
    try {
      await apiClient.postWithAuth('/friends/add', { code: trimmed });
      if (!isActive) return;
      await refreshRelations();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Успех', 'Мед-друг добавлен!');
      // ✅ Главное: очищаем стек и invite!
      router.replace('/tabs/profile'); // ← Это предотвращает зацикливание
      setScreen('main');
      setInviteCodeInput('');
    } catch (error: any) {
      if (isActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Ошибка', error.message || 'Неверный или просроченный код');
      }
    } finally {
      if (isActive) setLoading(false);
    }
    return () => { isActive = false; };
  }, [medFriend, inviteCodeInput, refreshRelations, router]);

  const handleRemoveMedFriend = useCallback(async () => {
    if (!medFriend) return;
    Alert.alert(
      'Подтверждение',
      `Вы уверены, что хотите удалить мед-друга "${medFriend.username || 'Пользователь'}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            let isActive = true;
            setLoading(true);
            try {
              await apiClient.deleteWithAuth('/friends/remove-for-patient');
              if (!isActive) return;
              await refreshRelations();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showSnackbar('Мед-друг удалён');
            } catch (error: any) {
              if (isActive) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Ошибка', error.message);
              }
            } finally {
              if (isActive) setLoading(false);
            }
            return () => { isActive = false; };
          },
        },
      ]
    );
  }, [medFriend, refreshRelations]);

  const handleUnsubscribeFromPatient = useCallback(async () => {
    if (!patient) return;
    Alert.alert(
      'Подтверждение',
      `Вы уверены, что хотите отписаться от пациента "${patient.username || 'Пользователь'}"?`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отписаться',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            let isActive = true;
            setLoading(true);
            try {
              await apiClient.deleteWithAuth('/friends/unsubscribe-from-patient');
              if (!isActive) return;
              await refreshRelations();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showSnackbar('Вы отписались от пациента');
            } catch (error: any) {
              if (isActive) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                Alert.alert('Ошибка', error.message);
              }
            } finally {
              if (isActive) setLoading(false);
            }
            return () => { isActive = false; };
          },
        },
      ]
    );
  }, [patient, refreshRelations]);

  const goBack = () => {
    Haptics.selectionAsync();
    setScreen('main');
    setGeneratedCode('');
    setInviteCodeInput('');
    if (timerInterval.current) clearInterval(timerInterval.current);
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(generatedCode);
    Haptics.selectionAsync();
    showSnackbar('Код скопирован');
  };

  const shareCode = async () => {
    const deepLink = `medfriend://invite/${generatedCode}`;
    const message = `Привет! Пожалуйста, добавь меня как пациента по коду: *${generatedCode}* или перейди по ссылке:
${deepLink}
Код действует 3 минуты.`;
    try {
      const result = await Share.share(
        {
          message,
          url: deepLink,
          title: 'Код приглашения в MedFriend',
        },
        {
          dialogTitle: 'Отправить код приглашения',
          subject: 'Код приглашения в MedFriend',
        }
      );
      if (result.action === Share.sharedAction) {
        console.log('Shared via:', result.activityType);
      }
    } catch (error) {
      console.warn('Share failed:', error);
      showSnackbar('Не удалось открыть отправку');
    }
  };

  const handleScannedCode = (code: string) => {
    setInviteCodeInput(code);
    setScreen('enter');
  };

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.05 * pulse.value }],
    opacity: 0.8 + 0.2 * pulse.value,
  }));

  const timerProgress = useDerivedValue(() => {
    return animatedSeconds.value / 180;
  });

  const timerFillStyle = useAnimatedStyle(() => ({
    width: `${timerProgress.value * 100}%`,
  }));

  // ✅ Обновлён: поддержка комбинированной роли
  const userRole = React.useMemo(() => {
    const roles = [];
    if (patient) roles.push({ text: 'мед-друг', color: '#5ECC7B' });
    if (medFriend) roles.push({ text: 'пациент', color: '#FF9500' });

    if (roles.length === 0) {
      return { text: 'Независимый пользователь', colors: ['#6D5BFF', '#6D5BFF'], singleColor: '#6D5BFF' };
    }
    if (roles.length === 1) {
      const r = roles[0];
      return { text: `Вы — ${r.text}`, colors: [r.color, r.color], singleColor: r.color };
    }
    // Оба роли
    return {
      text: 'Вы — мед-друг и пациент',
      colors: ['#FF9500', '#5ECC7B'],
      singleColor: null,
    };
  }, [patient, medFriend]);

  if (!isInitialized) {
    return (
      <Screen header={false} style={{ backgroundColor: 'transparent' }}>
        <LinearGradient
          colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#6D5BFF" />
          <Text style={[styles.loadingText, { fontSize: useScaledFontSize(16) }]}>Загрузка профиля…</Text>
        </View>
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
          duration={2000}
          style={{ marginBottom: 60 }}
        >
          {snackbar.message}
        </Snackbar>
      </Screen>
    );
  }

  if (screen === 'scan') {
    return (
      <Screen header={false} style={{ backgroundColor: 'black' }}>
        <BarcodeScannerView
          onScanSuccess={handleScannedCode}
          onCancel={() => {
            setScreen('enter');
          }}
        />
        <Snackbar
          visible={snackbar.visible}
          onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
          duration={2000}
          style={{ position: 'absolute', bottom: 20, left: 0, right: 0, marginHorizontal: 16 }}
        >
          {snackbar.message}
        </Snackbar>
      </Screen>
    );
  }

  return (
    <Screen header={false} style={{ backgroundColor: 'transparent' }}>
      <LinearGradient
        colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Профиль пользователя и управление связями"
      >
        <Animated.View entering={FadeInDown.springify().delay(100)}>
          <Text style={[styles.headerTitle, { fontSize: useScaledFontSize(32) }]} accessibilityRole="header">
            Профиль
          </Text>
          <View style={styles.sectionTitleLine} />
        </Animated.View>
        <Animated.View entering={FadeIn.duration(500).delay(150)} style={styles.subtitleContainer}>
          <Text style={[styles.subtitle, { fontSize: useScaledFontSize(14) }]} accessibilityRole="summary">
            Совместный контроль здоровья с близкими
          </Text>
        </Animated.View>
        <Animated.View
          entering={FadeInDown.springify().delay(200)}
          style={styles.avatarSection}
        >
          <GradientAvatar size={width < 400 ? 80 : 100} name={medFriend?.username || patient?.username || 'Вы'} />
          <View
            style={[
              styles.userRoleBadge,
              {
                backgroundColor: 'rgba(42, 39, 66, 0.3)',
                borderColor: 'rgba(109, 91, 255, 0.3)',
              },
            ]}
          >
            {userRole.singleColor ? (
              <>
                <View style={[styles.statusDot, { backgroundColor: userRole.singleColor }]} />
                <Text style={[styles.userRoleText, { color: userRole.singleColor }]}>
                  {userRole.text}
                </Text>
              </>
            ) : (
              // Комбинированная роль: две точки + градиент
              <>
                <LinearGradient
                  colors={userRole.colors}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.combinedRoleText}
                >
                  <Text style={styles.combinedRoleTextInner}>{userRole.text}</Text>
                </LinearGradient>
              </>
            )}
          </View>
        </Animated.View>

        {screen === 'main' && (
          <>
            <Animated.View entering={FadeInDown.springify().delay(250)}>
              <Card mode="contained" style={styles.statsCard} accessibilityRole="summary">
                <LinearGradient
                  colors={['#1E1C33', '#151328']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0.8 }}
                  style={[
                    styles.statsGradient,
                    { borderRadius: 20 }, // ✅ iOS fix
                  ]}
                >
                  <View style={styles.statusRow}>
                    <View
                      style={styles.statusItem}
                      accessibilityLabel={`Мед-друг: ${medFriend ? medFriend.username : 'отсутствует'}`}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: medFriend ? '#5ECC7B' : '#FF4444' },
                        ]}
                        accessibilityRole="image"
                        accessibilityLabel={medFriend ? 'Подключено' : 'Не подключено'}
                      />
                      <Text style={[styles.statusLabel, { fontSize: useScaledFontSize(14) }]}>Мед-друг</Text>
                      <Text style={[styles.statusValue, { fontSize: useScaledFontSize(16) }]}>
                        {medFriend ? medFriend.username : '—'}
                      </Text>
                    </View>
                    <View
                      style={styles.statusItem}
                      accessibilityLabel={`Пациент: ${patient ? patient.username : 'отсутствует'}`}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: patient ? '#5ECC7B' : '#FF4444' },
                        ]}
                        accessibilityRole="image"
                        accessibilityLabel={patient ? 'Подключено' : 'Не подключено'}
                      />
                      <Text style={[styles.statusLabel, { fontSize: useScaledFontSize(14) }]}>Пациент</Text>
                      <Text style={[styles.statusValue, { fontSize: useScaledFontSize(16) }]}>
                        {patient ? patient.username : '—'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </Card>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.springify().delay(300)}
              style={styles.actionButtons}
            >
              {loading ? (
                <Animated.View style={[styles.actionButton, pulseStyle]}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.gradientButton,
                      { transform: [{ scale: pressed ? 0.97 : 1 }] },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Загрузка…"
                  >
                    <LinearGradient
                      colors={['#3A345F', '#2A2742']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.gradientButtonInner,
                        { borderRadius: 18 }, // ✅ iOS fix
                      ]}
                    >
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={[styles.buttonText, { fontSize: useScaledFontSize(15) }]}>Загрузка…</Text>
                    </LinearGradient>
                  </Pressable>
                </Animated.View>
              ) : (
                <>
                  {!medFriend && (
                    <Animated.View style={[styles.actionButton, pulseStyle]}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setScreen('enter');
                        }}
                        style={({ pressed }) => [
                          styles.gradientButton,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Добавить мед-друга"
                      >
                        <LinearGradient
                          colors={['#6D5BFF', '#8A7FFF']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[
                            styles.gradientButtonInner,
                            { borderRadius: 18 }, // ✅ iOS fix
                          ]}
                        >
                          <Icon source="account-plus" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={[styles.buttonText, { fontSize: useScaledFontSize(15) }]}>
                            Добавить мед-друга
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </Animated.View>
                  )}
                  {!patient && (
                    <Animated.View style={[styles.actionButton, pulseStyle]}>
                      <Pressable
                        onPress={handleGenerateCode}
                        style={({ pressed }) => [
                          styles.gradientButton,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Сгенерировать код приглашения"
                      >
                        <LinearGradient
                          colors={['#5ECC7B', '#7CE4A5']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[
                            styles.gradientButtonInner,
                            { borderRadius: 18 }, // ✅ iOS fix
                          ]}
                        >
                          <Icon source="qrcode" size={18} color="#0E1D15" style={{ marginRight: 6 }} />
                          <Text style={[styles.buttonText, { color: '#0E1D15', fontSize: useScaledFontSize(15) }]}>
                            Сгенерировать код
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </Animated.View>
                  )}
                </>
              )}
            </Animated.View>

            {(medFriend || patient) && (
              <Animated.View entering={FadeInDown.springify().delay(350)}>
                <Text style={[styles.sectionTitle, { fontSize: useScaledFontSize(20) }]} accessibilityRole="header">
                  Ваши связи
                </Text>

                {medFriend && (
                  <Animated.View
                    entering={FadeInDown.springify().delay(0)}
                    exiting={FadeOut}
                  >
                    <Card
                      mode="contained"
                      style={[
                        styles.relationCard,
                        { borderLeftWidth: 4, borderLeftColor: '#5ECC7B' },
                      ]}
                      accessibilityRole="radio"
                    >
                      <LinearGradient
                        colors={['#1E1C33', '#151328']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.relationGradient,
                          { borderRadius: 20 }, // ✅ iOS fix (совпадает с Card)
                        ]}
                      >
                        <View style={styles.relationHeader}>
                          <View style={styles.relationIcon}>
                            <Icon source="doctor" size={24} color="#5ECC7B" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 14 }}>
                            <Text style={[styles.relationTitle, { fontSize: useScaledFontSize(14) }]}>
                              Мед-друг
                            </Text>
                            <Text style={[styles.relationName, { fontSize: useScaledFontSize(18) }]} numberOfLines={1}>
                              {medFriend.username || 'Пользователь'}
                            </Text>
                            <View style={styles.statusIndicator}>
                              <View
                                style={[
                                  styles.statusDot,
                                  { backgroundColor: medFriendStatus === 'online' ? '#5ECC7B' : '#FF6B6B' },
                                ]}
                              />
                              <Text style={[styles.statusText, { color: medFriendStatus === 'online' ? '#5ECC7B' : '#FF6B6B' }]}>
                                {medFriendStatus === 'online' ? 'в сети' : 'не в сети'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Button
                          mode="contained-tonal"
                          textColor="#FF3B30"
                          onPress={handleRemoveMedFriend}
                          style={styles.relationButton}
                          icon="delete-outline"
                          labelStyle={{ fontSize: useScaledFontSize(14), fontWeight: '600' }}
                          accessibilityLabel={`Удалить мед-друга ${medFriend.username}`}
                        >
                          Удалить
                        </Button>
                      </LinearGradient>
                    </Card>
                  </Animated.View>
                )}

                {patient && (
                  <Animated.View
                    entering={FadeInDown.springify().delay(100)}
                    exiting={FadeOut}
                  >
                    <Card
                      mode="contained"
                      style={[
                        styles.relationCard,
                        { borderLeftWidth: 4, borderLeftColor: '#FF9500' },
                      ]}
                      accessibilityRole="radio"
                    >
                      <LinearGradient
                        colors={['#1E1C33', '#151328']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                          styles.relationGradient,
                          { borderRadius: 20 }, // ✅ iOS fix
                        ]}
                      >
                        <View style={styles.relationHeader}>
                          <View style={styles.relationIcon}>
                            <Icon source="account-heart" size={24} color="#FF9500" />
                          </View>
                          <View style={{ flex: 1, marginLeft: 14 }}>
                            <Text style={[styles.relationTitle, { fontSize: useScaledFontSize(14) }]}>
                              Пациент
                            </Text>
                            <Text style={[styles.relationName, { fontSize: useScaledFontSize(18) }]} numberOfLines={1}>
                              {patient.username || 'Пользователь'}
                            </Text>
                            <View style={styles.statusIndicator}>
                              <View
                                style={[
                                  styles.statusDot,
                                  { backgroundColor: patientStatus === 'online' ? '#5ECC7B' : '#FF6B6B' },
                                ]}
                              />
                              <Text style={[styles.statusText, { color: patientStatus === 'online' ? '#5ECC7B' : '#FF6B6B' }]}>
                                {patientStatus === 'online' ? 'в сети' : 'не в сети'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Button
                          mode="contained-tonal"
                          textColor="#FF3B30"
                          onPress={handleUnsubscribeFromPatient}
                          style={styles.relationButton}
                          icon="account-remove-outline"
                          labelStyle={{ fontSize: useScaledFontSize(14), fontWeight: '600' }}
                          accessibilityLabel={`Отписаться от пациента ${patient.username}`}
                        >
                          Отписаться
                        </Button>
                      </LinearGradient>
                    </Card>
                  </Animated.View>
                )}
              </Animated.View>
            )}
          </>
        )}

        {screen === 'generate' && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card mode="contained" style={styles.codeCard} accessibilityRole="alert">
              <LinearGradient
                colors={['#1E1C33', '#151328']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.codeGradient,
                  { borderRadius: 20 }, // ✅ iOS fix
                ]}
              >
                <Text
                  style={[styles.codeSectionTitle, { fontSize: useScaledFontSize(22) }]}
                  accessibilityRole="header"
                >
                  Код приглашения
                </Text>
                <View style={styles.qrContainer}>
                  <QRCode
                    value={`medfriend://invite/${generatedCode}`}
                    size={width < 400 ? 140 : 160}
                    color="#FFFFFF"
                    backgroundColor="#0E0D18"
                  />
                  <Text style={[styles.qrHint, { fontSize: useScaledFontSize(13) }]}>Отсканируйте камерой</Text>
                </View>
                <Pressable onPress={copyCode} accessibilityRole="button" accessibilityLabel="Нажмите, чтобы скопировать код">
                  <View style={styles.codeBox}>
                    <Text style={[styles.codeText, { fontSize: useScaledFontSize(32) }]}>{generatedCode}</Text>
                  </View>
                </Pressable>
                <Animated.Text style={[styles.codeHint, { fontSize: useScaledFontSize(16) }]}>
                  Действует: {displayTime.value}
                </Animated.Text>
                <View style={styles.codeTimerBar}>
                  <Animated.View style={[styles.codeTimerFill, timerFillStyle]} />
                </View>
                <View style={styles.codeActions}>
                  <Button
                    mode="contained"
                    onPress={handleGenerateCode}
                    icon="refresh"
                    disabled={loading}
                    style={[styles.actionButtonSmall, { backgroundColor: '#6D5BFF' }]}
                    labelStyle={{ fontSize: useScaledFontSize(15), fontWeight: '600', color: '#FFF' }}
                    accessibilityLabel="Сгенерировать новый код"
                  >
                    Новый код
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={goBack}
                    style={styles.actionButtonSmall}
                    labelStyle={{ fontSize: useScaledFontSize(15), color: '#A8A2D2' }}
                    accessibilityLabel="Вернуться в профиль"
                  >
                    Готово
                  </Button>
                </View>
                <View style={styles.shareSection}>
                  <Button
                    mode="text"
                    onPress={shareCode}
                    icon="share-variant"
                    textColor="#A8A2D2"
                    accessibilityLabel="Отправить код через системное меню"
                  >
                    Отправить другу
                  </Button>
                  <Button
                    mode="text"
                    onPress={copyCode}
                    icon="content-copy"
                    textColor="#A8A2D2"
                    accessibilityLabel="Скопировать код"
                  >
                    Скопировать
                  </Button>
                </View>
              </LinearGradient>
            </Card>
          </Animated.View>
        )}

        {screen === 'enter' && (
          <Animated.View entering={FadeInDown.springify()}>
            <Card mode="contained" style={styles.codeCard}>
              <LinearGradient
                colors={['#1E1C33', '#151328']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.codeGradient,
                  { borderRadius: 20 }, // ✅ iOS fix
                ]}
              >
                <Text
                  style={[styles.codeSectionTitle, { fontSize: useScaledFontSize(22) }]}
                  accessibilityRole="header"
                >
                  Введите код или отсканируйте QR
                </Text>
                <Text style={[styles.codeHint, { fontSize: useScaledFontSize(16) }]}>6 цифр от вашего друга</Text>
                <TextInput
                  mode="outlined"
                  value={inviteCodeInput}
                  onChangeText={setInviteCodeInput}
                  placeholder="123456"
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.codeInput}
                  theme={{ colors: { primary: '#6D5BFF', background: '#2A2742' } }}
                  accessibilityLabel="Поле ввода 6-значного кода"
                  accessibilityHint="Введите 6 цифр и нажмите Подключиться"
                />
                <Button
                  mode="outlined"
                  onPress={() => {
                    Haptics.selectionAsync();
                    setScreen('scan');
                  }}
                  icon="camera"
                  textColor="#A8A2D2"
                  style={{ marginBottom: 16, borderColor: '#3A345F' }}
                  labelStyle={{ fontSize: useScaledFontSize(15) }}
                  accessibilityLabel="Сканировать QR-код"
                >
                  Сканировать QR-код
                </Button>
                <View style={styles.codeActions}>
                  <Button
                    mode="contained"
                    onPress={handleEnterCode}
                    icon="check"
                    disabled={loading || inviteCodeInput.length !== 6}
                    style={[styles.actionButtonSmall, { backgroundColor: '#5ECC7B' }]}
                    labelStyle={{ fontSize: useScaledFontSize(15), fontWeight: '600', color: '#0E1D15' }}
                    accessibilityLabel="Подключиться по коду"
                  >
                    Подключиться
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={goBack}
                    textColor="#A8A2D2"
                    style={styles.actionButtonSmall}
                    accessibilityLabel="Отменить ввод кода"
                  >
                    Отмена
                  </Button>
                </View>
              </LinearGradient>
            </Card>
          </Animated.View>
        )}
      </ScrollView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={2000}
        style={{ position: 'absolute', bottom: 20, left: 0, right: 0, marginHorizontal: 16 }}
      >
        {snackbar.message}
      </Snackbar>
    </Screen>
  );
}

// 🔹 Стили (обновлены borderRadius у градиентов)
const styles = StyleSheet.create({
  scrollContent: {
    padding: width < 400 ? 12 : 16,
    maxWidth: width < 600 ? width * 0.95 : 760,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 40,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    color: '#B5B0D1',
    marginTop: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
    textShadowColor: '#6D5BFF40',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sectionTitleLine: {
    height: 2,
    width: 60,
    backgroundColor: '#6D5BFF',
    alignSelf: 'center',
    borderRadius: 1,
    marginTop: 4,
  },
  subtitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  subtitle: {
    color: '#B5B0D1',
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
  avatarSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  avatarContainer: {
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarInner: {
    backgroundColor: '#2A2742',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    color: '#A090FF',
    fontWeight: '700',
  },
  userRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
  },
  userRoleText: {
    fontWeight: '600',
    marginLeft: 6,
  },
  combinedRoleText: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  combinedRoleTextInner: {
    fontWeight: '600',
    fontSize: 14,
    color: '#FFFFFF',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  actionButton: {
    minWidth: width < 400 ? 130 : 140,
    maxWidth: width < 400 ? 150 : 160,
  },
  gradientButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  gradientButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#15132830',
  },
  statsGradient: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: {
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusLabel: {
    color: '#A8A2D2',
    fontWeight: '500',
    marginBottom: 4,
  },
  statusValue: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#E0E0E0',
    fontWeight: '700',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  relationCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
    marginBottom: 16,
    backgroundColor: '#1E1C3340',
  },
  relationGradient: {
    padding: 18,
  },
  relationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  relationIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#5ECC7B15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  relationTitle: {
    color: '#A8A2D2',
    fontWeight: '600',
    marginBottom: 4,
  },
  relationName: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 4,
  },
  relationButton: {
    borderRadius: 14,
    height: 42,
  },
  codeCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#1E1C3340',
    marginBottom: 20,
  },
  codeGradient: {
    padding: 22,
    alignItems: 'center',
  },
  codeSectionTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 16,
  },
  qrContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  qrHint: {
    color: '#A8A2D2',
    marginTop: 8,
  },
  codeBox: {
    backgroundColor: '#00305A',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 28,
    marginBottom: 16,
    minWidth: width < 400 ? 140 : 160,
  },
  codeText: {
    fontWeight: '800',
    color: '#4DA1FF',
    textAlign: 'center',
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
  },
  codeHint: {
    color: '#A0B8D8',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  codeTimerBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#2A2742',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 20,
  },
  codeTimerFill: {
    height: '100%',
    backgroundColor: '#5ECC7B',
    borderRadius: 3,
  },
  codeInput: {
    backgroundColor: '#2A2742',
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    marginBottom: 12,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  actionButtonSmall: {
    flex: 1,
    borderRadius: 14,
    height: 48,
  },
  shareSection: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    width: '100%',
    justifyContent: 'center',
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: '#6D5BFF',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  scanHint: {
    color: '#B5B0D1',
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  cancelButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00000060',
    justifyContent: 'center',
    alignItems: 'center',
  },
});