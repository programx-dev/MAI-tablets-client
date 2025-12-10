// app/_layout.tsx
import { Stack } from 'expo-router';
import { useColorScheme, View } from 'react-native';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationLightTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import {
  adaptNavigationTheme,
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
} from 'react-native-paper';

// 🔹 Цвета под Schedule (ultra-dark space theme)
const CustomColors = {
  primary: '#5A4AFF', // как в animatedNeonStyle и кнопках
  onPrimary: '#FFFFFF',

  // 🎨 Основной фон — точно как в Schedule
  background: '#0A0A0F', // ← главный фон

  // Поверхности (карточки, формы)
  surface: '#0F0F1A', // как в medCardGradient и calendarGradient
  surfaceVariant: '#121218', // чуть светлее, для бордюров/теней
  onSurface: '#E0E0E0', // основной текст
  onSurfaceVariant: '#B0B0B0', // второстепенный текст

  outline: '#22222F', // как border в dayBorder — полупрозрачный, но читаемый

  // Состояния
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  info: '#4FC3F7',

  // Дополнительно (Paper-специфичные)
  inverseSurface: '#1E1E1E',
  inverseOnSurface: '#FFFFFF',
  shadow: '#000000',
  scrim: '#000000', // для модалок/оверлеев
};

// 🔹 Расширенная ТЁМНАЯ тема Paper
const PaperDarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...CustomColors,
    // Уточняем критичные значения
    background: CustomColors.background,
    surface: CustomColors.surface,
    onSurface: CustomColors.onSurface,
    primary: CustomColors.primary,
    onPrimary: CustomColors.onPrimary,
    outline: CustomColors.outline,
    scrim: CustomColors.scrim,
  },
};

// 🔹 Адаптируем навигацию под кастомные цвета
const { LightTheme: RNLightTheme, DarkTheme: RNDarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationLightTheme,
  reactNavigationDark: NavigationDarkTheme,
});

const NavigationDarkThemeCustom = {
  ...RNDarkTheme,
  colors: {
    ...RNDarkTheme.colors,
    background: CustomColors.background,
    card: CustomColors.surface,
    text: CustomColors.onSurface,
    border: CustomColors.outline,
    primary: CustomColors.primary,
    notification: CustomColors.error,
  },
};

// 🔹 Объединённая тема
const theme = {
  paper: PaperDarkTheme,
  router: NavigationDarkThemeCustom,
};

export default function RootLayout() {
  return (
    <NavigationThemeProvider value={theme.router}>
      <PaperProvider theme={theme.paper}>
        <View
          style={{
            flex: 1,
            backgroundColor: theme.paper.colors.background, // #0A0A0F
          }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            {/* 📱 Основной контент (вкладки) */}
            <Stack.Screen name="(tabs)" />

            {/* 🪟 Модальные экраны — выезжают снизу с прозрачным фоном */}
            <Stack.Screen
              name="(modals)/add"
              options={{
                presentation: 'transparentModal',
                animation: 'slide_from_bottom',
                headerShown: false,
                contentStyle: {
                  backgroundColor: 'transparent',
                },
              }}
            />

            {/* 💡 Добавьте другие модальные экраны по аналогии */}
            {/* <Stack.Screen name="(modals)/take-medication-modal" options={{ ... }} /> */}

            {/* 🔐 Если есть экраны аутентификации — можно вынести в отдельную группу */}
            {/* <Stack.Screen name="(auth)/login" /> */}
          </Stack>
        </View>
      </PaperProvider>
    </NavigationThemeProvider>
  );
}