import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput, // ✅ ИМПОРТИРОВАН
  ScrollView,
} from 'react-native';
import { Text, Icon, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import apiClient from '@/services/api';
import { saveLocalUser } from '@/services/localUser.service';
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
import { ActivityIndicator } from 'react-native';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [login, setLogin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Анимации
  const inputScale = useSharedValue(1);
  const registerButtonScale = useSharedValue(1);
  const pulse = useSharedValue(0);
  const errorShake = useSharedValue(0);

  const pulseStartedRef = useRef(false);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Пульсация акцентного элемента
  if (!pulseStartedRef.current) {
    pulseStartedRef.current = true;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.out(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.in(Easing.ease) })
      ),
      -1,
      true
    );
  }

  // Автозаполнение для dev
  useEffect(() => {
    if (__DEV__ && Platform.OS === 'web') {
      setLogin('testuser123');
    }
  }, []);

  // Очистка таймаутов
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  const animatedInputStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: inputScale.value },
        { translateX: errorShake.value },
      ],
      borderColor: error
        ? '#FF3B30'
        : isFocused
        ? '#6D5BFF'
        : '#3A345F',
      shadowColor: error ? '#FF3B30' : '#6D5BFF',
      shadowOffset: { width: 0, height: error ? 0 : 2 },
      shadowOpacity: error ? 0 : isFocused ? 0.4 : 0.15,
      shadowRadius: error ? 0 : isFocused ? 8 : 4,
      elevation: error ? 0 : isFocused ? 6 : 2,
    };
  });

  const animatedButtonStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: registerButtonScale.value }],
      opacity: loading ? 0.8 : 1,
    };
  });

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.4 + 0.3 * pulse.value,
      transform: [{ scale: 1 + 0.03 * pulse.value }],
    };
  });

  const onPressIn = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(0.97, { duration: 100 });
  };

  const onPressOut = (value: Animated.SharedValue<number>) => () => {
    value.value = withTiming(1, { duration: 150 });
  };

  const validateUsername = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Обязательное поле';
    if (trimmed.length < 3) return 'Не короче 3 символов';
    if (trimmed.length > 32) return 'Не длиннее 32 символов';
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return 'Только буквы, цифры, _ и -';
    }
    return null;
  };

  const triggerErrorShake = () => {
    errorShake.value = withSequence(
      withTiming(3, { duration: 50 }),
      withTiming(-3, { duration: 100 }),
      withTiming(0, { duration: 50 })
    );
  };

  const handleRegister = useCallback(async () => {
    const validationError = validateUsername(login);
    if (validationError) {
      setError(validationError);
      triggerErrorShake();
      return;
    }
    setError(null);

    try {
      setLoading(true);

      const response = await apiClient.post('/auth/register', {
        username: login.trim(),
      });

      const { uuid, password, username } = response;

      if (!uuid || !password) {
        throw new Error('Сервер не вернул UUID или пароль');
      }

      await saveLocalUser({ uuid, password, username });

      Alert.alert(
        '✅ Регистрация успешна',
        `Твой идентификатор:\n${uuid}\n\nПароль:\n${password}\n\n🔒 Сохранён в защищённой локальной базе.`,
        [
          {
            text: 'Перейти в приложение',
            onPress: () => {
              router.replace('/tabs/schedule');
            },
          },
        ],
      );
    } catch (e: any) {
      console.error('🚨 Ошибка регистрации:', {
        message: e.message,
        stack: e.stack,
        cause: e.cause,
      });

      let message = e.message || 'Не удалось зарегистрироваться';
      if (message.includes('Network request failed')) {
        message = 'Нет связи с сервером. Проверь Wi-Fi и что сервер запущен.';
      }
      setError(message);
      triggerErrorShake();

      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
      }, 5000);
    } finally {
      setLoading(false);
    }
  }, [login, router]);

  return (
    <Screen style={styles.screen}>
      {/* 🔹 Фон — как в schedule */}
      <LinearGradient
        colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 🔹 KeyboardAvoidingView обёртка */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* 🔹 Прокручиваемый контент */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.content}>
            {/* 🔹 Заголовок */}
            <Animated.View
              entering={FadeInDown.delay(100).duration(400)}
              style={styles.header}
            >
              <Text style={styles.title}>Создай профиль</Text>
              <Animated.Text
                entering={FadeInDown.delay(200).duration(500)}
                style={[styles.subtitle, animatedPulseStyle]}
              >
                Введи имя пользователя — мы создадим для тебя уникальный UUID и пароль. Данные хранятся локально и синхронизируются только при твоём согласии.
              </Animated.Text>
            </Animated.View>

            {/* 🔹 Иконка */}
            <Animated.View
              entering={FadeInDown.delay(300).duration(600)}
              style={styles.iconBox}
            >
              <LinearGradient
                colors={['#6D5BFF20', '#5ECC7B20']}
                style={styles.iconGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Icon source="account-plus" size={56} color="#A090FF" />
              </LinearGradient>
            </Animated.View>

            {/* 🔹 Поле ввода */}
            <Animated.View
              entering={FadeInDown.delay(400).duration(500)}
              style={[styles.inputWrapper, animatedInputStyle]}
            >
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Имя пользователя</Text>
                {login.length > 0 && (
                  <Text style={styles.inputCounter}>
                    {login.length}/32
                  </Text>
                )}
              </View>
              <TextInput
                value={login}
                onChangeText={(text) => {
                  setLogin(text);
                  if (error) setError(null);
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="ivan_2025"
                placeholderTextColor="#5A547D"
                autoCapitalize="none"
                autoComplete="username"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                style={styles.input}
                maxLength={32}
                selectionColor="#6D5BFF"
              />
              {error && (
                <Animated.View
                  style={[
                    styles.errorRow,
                    { transform: [{ translateX: errorShake }] },
                  ]}
                >
                  <Icon source="alert-circle" size={16} color="#FF3B30" />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              )}
            </Animated.View>

            {/* 🔹 Отступ, чтобы кнопка не прилипала */}
            <View style={styles.bottomSpacer} />
          </Animated.View>
        </ScrollView>

        {/* 🔹 Кнопка — снаружи ScrollView, но внутри KeyboardAvoidingView */}
        <Animated.View
          entering={FadeIn.delay(500).duration(400)}
          style={styles.buttonContainer}
        >
          <Animated.View style={animatedButtonStyle}>
            <TouchableOpacity
              onPress={handleRegister}
              onPressIn={onPressIn(registerButtonScale)}
              onPressOut={onPressOut(registerButtonScale)}
              activeOpacity={0.85}
              disabled={loading || !login.trim()}
              style={[
                styles.registerButton,
                (loading || !login.trim()) && styles.buttonDisabled,
              ]}
            >
              <LinearGradient
                colors={
                  loading
                    ? ['#6D5BFF80', '#8A7FFF80']
                    : ['#6D5BFF', '#8A7FFF']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.buttonGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.registerButtonText}>
                    Зарегистрироваться
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

// 💅 Стили — стабильные, без runtime-CSS
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 24,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  content: {
    width: '100%',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 8,
  },
  subtitle: {
    color: '#A8A2D2',
    fontSize: 16,
    lineHeight: 24,
  },
  iconBox: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#A090FF30',
  },
  iconGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputWrapper: {
    backgroundColor: '#1E1C33',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3A345F',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    marginBottom: 16,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputLabel: {
    color: '#A8A2D2',
    fontSize: 14,
    fontWeight: '500',
  },
  inputCounter: {
    color: '#5ECC7B',
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '500',
    padding: 0,
    height: 40,
    includeFontPadding: false,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  bottomSpacer: {
    height: 20,
  },
  buttonContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  registerButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
    height: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0.2,
    elevation: 4,
  },
  buttonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
});