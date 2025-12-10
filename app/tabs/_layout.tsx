import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View, Animated, Easing, Platform } from 'react-native';
import { useRef, useEffect } from 'react';

// 🔹 Цвета из вашего design system (как в schedule.tsx)
const COLORS = {
  background: '#0A0A0F',
  surface: '#0F0F1A',
  // ✅ Акцентные цвета:
  activeIcon: '#6D5BFF',     // фиолетовый — иконка активной вкладки
  inactiveIcon: '#5A547D',   // приглушённый фиолетовый — иконка неактивной
  activeLabel: '#5ECC7B',    // ✅ зелёный — ТЕКСТ активной вкладки (как индикатор)
  inactiveLabel: '#7A7599',  // серо-фиолетовый — текст неактивной
  onSurface: '#E0E0E0',
};

export const tabs = [
  { name: 'Расписание', path: 'schedule', icon: 'calendar-month' },
  { name: 'Уведомления', path: 'notifications', icon: 'bell-outline' },
  { name: 'Профиль', path: 'profile', icon: 'account-circle-outline' },
  { name: 'Пациент', path: 'patient', icon: 'account-multiple-outline' },
];

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <Tabs
        initialRouteName="schedule"
        screenOptions={{
          headerShown: false,

          tabBarStyle: {
            backgroundColor: COLORS.background,
            borderTopWidth: 0,
            height: 52,
            paddingTop: Platform.OS === 'ios' ? 0 : 0,
            paddingBottom: 2,
          },

          // ❌ Убираем глобальные tint-цвета — управляем вручную
          // tabBarActiveTintColor: ...,
          // tabBarInactiveTintColor: ...,

          tabBarLabelStyle: {
            fontSize: 9.5,
            fontWeight: '600',
            marginBottom: -7,
            marginTop: -15,
          },

          tabBarShowLabel: true,
        }}
      >
        {tabs.map((tab) => (
          <Tabs.Screen
            key={tab.path}
            name={tab.path}
            options={{
              title: tab.name,

              // 🔹 Иконка — с ручным управлением цвета
              tabBarIcon: ({ focused }) => {
                const scale = useRef(new Animated.Value(focused ? 1.2 : 1)).current;

                useEffect(() => {
                  Animated.timing(scale, {
                    toValue: focused ? 1.2 : 1,
                    duration: 180,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                  }).start();
                }, [focused]);

                const iconColor = focused ? COLORS.activeIcon : COLORS.inactiveIcon;

                return (
                  <Animated.View
                    style={{
                      transform: [
                        { scale: scale },
                        { translateY: -15 },
                      ],
                    }}
                  >
                    <MaterialCommunityIcons
                      name={
                        (focused
                          ? tab.icon.replace('-outline', '')
                          : tab.icon) as any
                      }
                      color={iconColor}
                      size={focused ? 24 : 20}
                    />
                  </Animated.View>
                );
              },

              // 🔹 Текст — с зелёным для активного состояния
              tabBarLabel: ({ focused }) => (
                <Animated.Text
                  style={{
                    fontSize: 9.5,
                    fontWeight: '600',
                    color: focused ? COLORS.activeLabel : COLORS.inactiveLabel,
                    marginBottom: -7,
                    marginTop: -15,
                  }}
                >
                  {tab.name}
                </Animated.Text>
              ),
            }}
          />
        ))}
      </Tabs>
    </View>
  );
}