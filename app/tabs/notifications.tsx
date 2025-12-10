// app/(tabs)/notifications.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Platform,
  Alert,
  StyleSheet,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
  SafeAreaView,
} from "react-native";
import { Button, Text, Modal, Portal, TextInput, ActivityIndicator, Card } from "react-native-paper";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen } from "@/components/screen";
import { useDatabase } from "@/hooks/use-database";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "react-native-paper";

// ✅ Обработчик уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  }),
});

// 🔹 Вспомогательная функция — как в schedule.tsx
const getFormDisplay = (form: string | null): { icon: string; label: string } => {
  switch (form) {
    case 'tablet':
      return { icon: 'pill', label: 'Таблетка' };
    case 'capsule':
      return { icon: 'capsule', label: 'Капсула' };
    case 'drop':
      return { icon: 'eyedropper-variant', label: 'Капли' };
    case 'syrup':
      return { icon: 'bottle-soda-classic', label: 'Сироп' };
    case 'injection':
      return { icon: 'needle', label: 'Инъекция' };
    case 'spray':
      return { icon: 'spray-bottle', label: 'Спрей' };
    case 'ointment':
      return { icon: 'tube', label: 'Мазь' };
    case 'patch':
      return { icon: 'bandage', label: 'Пластырь' };
    case 'suppository':
      return { icon: 'pill', label: 'Суппозиторий' };
    case 'inhaler':
      return { icon: 'inhaler', label: 'Ингалятор' };
    case 'powder':
      return { icon: 'flask', label: 'Порошок' };
    default:
      return { icon: 'help-circle-outline', label: '—' };
  }
};

// ✅ Функция планирования уведомлений на несколько дней вперед
async function scheduleMedicationNotification(
  name: string,
  form: string,
  time: string,
  scheduleType: "daily" | "weekly_days" | "every_x_days",
  weeklyDays?: string[],
  intervalDays?: number,
  startDate?: string,
  endDate?: string
) {
  try {
    const [hours, minutes] = time.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      console.warn(`⚠️ Неверное время: ${time}`);
      return null;
    }

    const now = new Date();
    const scheduledNotifications = [];

    // ✅ Планируем на 7 дней вперед
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const medicationTime = new Date();
      medicationTime.setDate(now.getDate() + dayOffset);
      medicationTime.setHours(hours, minutes, 0, 0);
      
      // Проверяем расписание
      let shouldSchedule = false;
      
      if (scheduleType === "daily") {
        shouldSchedule = true;
      } 
      else if (scheduleType === "weekly_days" && weeklyDays) {
        const dayIndexMap: Record<string, number> = {
          "ПН": 1, "ВТ": 2, "СР": 3, "ЧТ": 4, "ПТ": 5, "СБ": 6, "ВС": 0,
        };
        const currentWeekday = medicationTime.getDay();
        const dayName = Object.keys(dayIndexMap).find(key => dayIndexMap[key] === currentWeekday);
        shouldSchedule = dayName ? weeklyDays.includes(dayName) : false;
      }
      else if (scheduleType === "every_x_days" && intervalDays && startDate) {
        const start = new Date(startDate);
        const diffTime = medicationTime.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        shouldSchedule = diffDays >= 0 && diffDays % intervalDays === 0;
      }

      if (!shouldSchedule) continue;

      // ✅ Время уведомления (за 10 минут)
      const notificationTime = new Date(medicationTime.getTime() - 10 * 60 * 1000);
      
      // Пропускаем если уведомление в прошлом
      if (notificationTime <= now) continue;

      // ✅ Проверка даты окончания
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (notificationTime > end) continue;
      }

      const secondsUntilNotification = Math.floor((notificationTime.getTime() - now.getTime()) / 1000);
      const finalSeconds = Math.max(secondsUntilNotification, 1);

      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Скоро приём: ${name}`,
            body: `Через 10 минут нужно принять ${getFormDisplay(form).label.toLowerCase()} в ${time}`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: { 
              medicationName: name, 
              form: form,
              scheduledTime: time,
              medicationTime: medicationTime.getTime(),
              originalTime: notificationTime.getTime(),
              type: 'medication_reminder',
              isCustom: false
            },
            ...(Platform.OS === "android" && { channelId: "reminders" }),
          },
          trigger: {
            type: 'timeInterval',
            seconds: finalSeconds,
            repeats: false,
          } as any,
        });

        scheduledNotifications.push({
          id: notificationId,
          time: notificationTime,
          medicationTime: medicationTime
        });

        console.log(`✅ УВЕДОМЛЕНИЕ: ${name} на ${notificationTime.toLocaleString('ru-RU')}`);
      } catch (error) {
        console.error(`❌ Ошибка планирования для ${name}:`, error);
      }
    }

    return scheduledNotifications;

  } catch (error: any) {
    console.error("❌ Ошибка планирования уведомления:", error);
    return null;
  }
}

// ✅ Функция для кастомного уведомления с выбором времени
async function scheduleCustomNotification(
  name: string,
  form: string,
  scheduledTime: string,
  customTime: string,
  medicationTime: Date
) {
  try {
    const [customHours, customMinutes] = customTime.split(":").map(Number);
    const now = new Date();
    
    // Создаем время кастомного уведомления
    const customNotificationTime = new Date(medicationTime);
    customNotificationTime.setHours(customHours, customMinutes, 0, 0);
    
    if (customNotificationTime <= now) {
      Alert.alert("Ошибка", "Время уведомления уже прошло");
      return null;
    }

    // Проверяем что уведомление не позже времени приема
    const [scheduledHours, scheduledMinutes] = scheduledTime.split(":").map(Number);
    const actualMedicationTime = new Date(medicationTime);
    actualMedicationTime.setHours(scheduledHours, scheduledMinutes, 0, 0);
    
    if (customNotificationTime > actualMedicationTime) {
      Alert.alert("Ошибка", "Время уведомления не может быть позже времени приема");
      return null;
    }

    const secondsUntilNotification = Math.floor((customNotificationTime.getTime() - now.getTime()) / 1000);
    const finalSeconds = Math.max(secondsUntilNotification, 1);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Напоминание: ${name}`,
        body: `В ${customTime} нужно принять ${getFormDisplay(form).label.toLowerCase()} в ${scheduledTime}`,
        sound: true,
        data: { 
          medicationName: name,
          form: form,
          scheduledTime: scheduledTime,
          customTime: customTime,
          medicationTime: medicationTime.getTime(),
          originalTime: customNotificationTime.getTime(),
          isCustom: true
        },
      },
      trigger: {
        type: 'timeInterval',
        seconds: finalSeconds,
        repeats: false,
      } as any,
    });

    console.log(`✅ КАСТОМНОЕ УВЕДОМЛЕНИЕ: ${name} в ${customTime}`);
    return notificationId;

  } catch (error) {
    console.error("❌ Ошибка кастомного уведомления:", error);
    Alert.alert("Ошибка", "Не удалось запланировать уведомление");
    return null;
  }
}

// ✅ ✅ ✅ ИСПРАВЛЕННАЯ ГРУППИРОВКА — БЕЗ Invalid Date
function groupNotificationsByDay(notifications: Notifications.NotificationRequest[]) {
  const grouped: { [key: string]: Notifications.NotificationRequest[] } = {};

  notifications.forEach(notification => {
    let notificationTime: Date | null = null;

    // 🔹 1. Попробуем извлечь из content.data (наиболее надёжно)
    const data = notification.content.data;
    if (data?.medicationTime && typeof data.medicationTime === 'number') {
      notificationTime = new Date(data.medicationTime); // время приёма
    } else if (data?.originalTime && typeof data.originalTime === 'number') {
      notificationTime = new Date(data.originalTime); // время уведомления
    } else {
      // 🔹 2. Если нет data — вычисляем из триггера
      const trigger = notification.trigger as any;
      if (trigger?.type === 'timeInterval' && typeof trigger.seconds === 'number') {
        notificationTime = new Date(Date.now() + trigger.seconds * 1000);
      } else if (trigger?.date) {
        notificationTime = new Date(trigger.date);
      }
    }

    // 🔹 Защита от некорректных дат
    if (!notificationTime || isNaN(notificationTime.getTime())) {
      console.warn('⚠️ Пропущено уведомление с некорректным временем:', notification.identifier);
      return;
    }

    // ✅ Используем ISO-дату как ключ: "2025-12-04"
    const isoDate = notificationTime.toISOString().split('T')[0];

    if (!grouped[isoDate]) {
      grouped[isoDate] = [];
    }
    grouped[isoDate].push(notification);
  });

  // ✅ Сортируем по ISO (лексикографическая = хронологическая)
  const sortedIsoDays = Object.keys(grouped).sort();

  // ✅ Формируем удобочитаемые названия для UI
  const displayDays = sortedIsoDays.map(iso => {
    const date = new Date(iso);
    const display = date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return { iso, display };
  });

  return { grouped, displayDays };
}

export default function NotificationsScreen() {
  const { getMedications } = useDatabase();
  const { expoPushToken } = usePushNotifications();
  const [scheduled, setScheduled] = useState<Notifications.NotificationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // ✅ Модальное окно для кастомного уведомления
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<{
    id: string;
    name: string;
    form: string;
    scheduledTime: string;
    medicationTime: Date;
  } | null>(null);
  const [customTime, setCustomTime] = useState("");

  // Анимированная кнопка обновления
  const pulse = useSharedValue(0);

  useEffect(() => {
    const initNotifications = async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("reminders", {
          name: "Напоминания о приёме",
          importance: Notifications.AndroidImportance.HIGH,
          sound: true,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(existingNotifications);
    };

    initNotifications();
  }, []);

  // 📅 Автоматическое планирование всех уведомлений
  const scheduleAllMedNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      console.log("🔄 Запуск планирования уведомлений...");
      
      await Notifications.cancelAllScheduledNotificationsAsync();
      await new Promise(resolve => setTimeout(resolve, 500));

      const meds = await getMedications();
      console.log(`📋 Найдено лекарств: ${meds.length}`);

      let totalScheduled = 0;

      for (const med of meds) {
        const times = Array.isArray(med.times_list)
          ? med.times_list
          : typeof med.times_list === "string"
          ? JSON.parse(med.times_list)
          : [];

        for (const time of times) {
          const results = await scheduleMedicationNotification(
            med.name,
            med.form,
            time,
            med.schedule_type,
            med.schedule_type === "weekly_days" ? med.weekly_days : undefined,
            med.schedule_type === "every_x_days" ? med.interval_days : undefined,
            med.start_date,
            med.end_date
          );
          
          if (results) {
            totalScheduled += results.length;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(allScheduled);
      
      const updateTime = new Date().toLocaleString('ru-RU');
      setLastUpdate(updateTime);
      await AsyncStorage.setItem("lastScheduled", Date.now().toString());
      
      Alert.alert(
        "✅ Готово", 
        `Запланировано уведомлений: ${allScheduled.length}\nУведомления настроены на 7 дней вперед.`
      );

      // Пульсация кнопки успеха
      pulse.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) }, () => {
        pulse.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) });
      });

    } catch (error) {
      console.error("💥 Ошибка при планировании:", error);
      Alert.alert("Ошибка", "Не удалось запланировать уведомления");
    } finally {
      setIsLoading(false);
    }
  }, [getMedications, pulse]);

  // ✅ Функция для кастомного уведомления
  const handleCustomNotification = async () => {
    if (!selectedNotification) return;
    
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(customTime)) {
      Alert.alert("Ошибка", "Введите время в формате ЧЧ:ММ (например, 08:30)");
      return;
    }

    await Notifications.cancelScheduledNotificationAsync(selectedNotification.id);

    const result = await scheduleCustomNotification(
      selectedNotification.name,
      selectedNotification.form,
      selectedNotification.scheduledTime,
      customTime,
      selectedNotification.medicationTime
    );

    if (result) {
      setCustomModalVisible(false);
      setCustomTime("");
      setSelectedNotification(null);
      
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(allScheduled);
      
      Alert.alert("✅ Успех", `Уведомление перенесено на ${customTime}`);
    }
  };

  // ✅ Открыть модальное окно для кастомного уведомления
  const openCustomModal = (notification: Notifications.NotificationRequest) => {
    const data = notification.content.data || {};
    const medicationName = 
      data.medicationName || 
      (typeof notification.content.title === 'string' 
        ? notification.content.title.replace('Скоро приём: ', '').replace('Напоминание: ', '')
        : 'Лекарство');
    const scheduledTime = data.scheduledTime || "неизвестно";
    const medicationTime = data.medicationTime ? new Date(data.medicationTime) : new Date();
    const form = data.form || "tablet"; // fallback to tablet

    const defaultTime = new Date();
    defaultTime.setHours(defaultTime.getHours() + 1);
    const defaultTimeString = defaultTime.toTimeString().slice(0, 5);
    
    setSelectedNotification({
      id: notification.identifier,
      name: medicationName,
      form: form,
      scheduledTime: scheduledTime,
      medicationTime: medicationTime
    });
    setCustomTime(defaultTimeString);
    setCustomModalVisible(true);
  };

  // ✅ Удалить конкретное уведомление
  const cancelNotification = async (notificationId: string) => {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    setScheduled(allScheduled);
    
    Alert.alert("✅ Удалено", "Уведомление отменено");
  };

  // Автопланировка при монтировании
  useEffect(() => {
    scheduleAllMedNotifications();
  }, []);

  // ✅ Используем исправленную группировку
  const { grouped, displayDays } = groupNotificationsByDay(scheduled);

  const pulseStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 1 + 0.05 * pulse.value }],
      opacity: 0.8 + 0.2 * pulse.value,
    };
  });

  return (
    <Screen header={false} style={{ backgroundColor: 'transparent' }}>
      {/* 🔹 Фон — идентичный schedule.tsx */}
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
      >
        {/* 🔹 Заголовок */}
        <Animated.View entering={FadeIn.duration(400)}>
          <Text style={styles.headerTitle}>Уведомления</Text>
          <View style={styles.sectionTitleLine} />
        </Animated.View>

        <Animated.View entering={FadeIn.duration(500).delay(100)} style={styles.subtitleContainer}>
          <Text style={styles.subtitle}>
            Автоматические напоминания за 10 минут до приёма
          </Text>
        </Animated.View>

        {/* 🔹 Кнопки управления */}
        <Animated.View entering={FadeIn.duration(550).delay(150)} style={styles.actionButtons}>
          <Animated.View style={[styles.actionButton, pulseStyle]}>
            <Pressable
              onPress={scheduleAllMedNotifications}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.gradientButton,
                { transform: [{ scale: pressed ? 0.97 : 1 }] }
              ]}
            >
              <LinearGradient
                colors={isLoading ? ['#3A345F', '#2A2742'] : ['#6D5BFF', '#8A7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientButtonInner}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Icon source="refresh" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.buttonText}>
                  {isLoading ? 'Планирование…' : 'Обновить'}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={async () => {
              await Notifications.cancelAllScheduledNotificationsAsync();
              setScheduled([]);
              await AsyncStorage.setItem("lastScheduled", "0");
              setLastUpdate(new Date().toLocaleString('ru-RU'));
              Alert.alert("✅ Очищено", "Все уведомления удалены");
            }}
            style={({ pressed }) => [
              styles.outlineButton,
              { transform: [{ scale: pressed ? 0.97 : 1 }] }
            ]}
          >
            <LinearGradient
              colors={['#1E1C33', '#151328']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.outlineButtonInner}
            >
              <Icon source="trash-can-outline" size={18} color="#FF4444" style={{ marginRight: 6 }} />
              <Text style={[styles.buttonText, { color: '#FF4444' }]}>Очистить</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* 🔹 Статистика */}
        <Animated.View entering={FadeIn.duration(600).delay(200)}>
          <Card mode="contained" style={styles.statsCard}>
            <LinearGradient
              colors={['#1E1C33', '#151328']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statsGradient}
            >
              <View style={styles.statsRow}>
                <Text style={styles.statsLabel}>Активные</Text>
                <Text style={styles.statsValue}>{scheduled.length}</Text>
              </View>
              <View style={styles.statsRow}>
                <Text style={styles.statsLabel}>Дней покрыто</Text>
                <Text style={styles.statsValue}>{displayDays.length || 0}</Text>
              </View>
              
              {lastUpdate ? (
                <Text style={styles.statsLastUpdate}>Обновлено: {lastUpdate}</Text>
              ) : null}
            </LinearGradient>
          </Card>
        </Animated.View>

        {/* 🔹 Список уведомлений */}
        {scheduled.length === 0 ? (
          <Animated.View entering={FadeIn.duration(700).delay(250)} style={styles.emptyContainer}>
            <View style={styles.emptyIconBox}>
              <Icon source="bell-off-outline" size={64} color="#6D5BFF60" />
            </View>
            <Text style={styles.emptyTitle}>Нет запланированных уведомлений</Text>
            <Text style={styles.emptySubtitle}>
              Нажмите «Обновить» — приложение автоматически сгенерирует напоминания на 7 дней вперёд.
            </Text>
          </Animated.View>
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(650).delay(300)}>
              <Text style={styles.sectionTitle}>Уведомления по дням</Text>
            </Animated.View>

            {/* ✅ ИСПРАВЛЕННЫЙ ЦИКЛ — теперь без Invalid Date */}
            {displayDays.map(({ iso, display }, idx) => (
              <Animated.View
                entering={FadeInDown.delay(idx * 80).duration(400)}
                key={iso}
                style={styles.dayGroup}
              >
                <View style={styles.dayHeader}>
                  <Text style={styles.dayHeaderText}>
                    {display}
                  </Text>
                  <View style={styles.dayHeaderCount}>
                    <Text style={styles.dayHeaderCountText}>
                      {grouped[iso].length}
                    </Text>
                  </View>
                </View>

                {grouped[iso].map((n) => {
                  // 🔹 Надёжное извлечение времени уведомления
                  const data = n.content.data || {};
                  let displayTime = '—';
                  
                  if (typeof data.originalTime === 'number') {
                    displayTime = new Date(data.originalTime)
                      .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                  } else {
                    const trigger = n.trigger as any;
                    if (trigger?.seconds) {
                      displayTime = new Date(Date.now() + trigger.seconds * 1000)
                        .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    }
                  }

                  // 🔹 Получаем отображение формы
                  const form = data.form || 'tablet';
                  const { icon: formIcon, label: formLabel } = getFormDisplay(form);

                  return (
                    <View key={n.identifier} style={styles.notificationItem}>
                      <Card mode="contained" style={styles.notificationCard}>
                        <LinearGradient
                          colors={['#1E1C33', '#151328']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.notificationGradient}
                        >
                          <View style={styles.notificationHeader}>
                            <View style={styles.titleIconRow}>
                              <View style={styles.formIconWrapper}>
                                <Icon source={formIcon} size={20} color="#A090FF" />
                              </View>
                              <Text style={styles.notificationTitle} numberOfLines={1}>
                                {n.content.title}
                              </Text>
                            </View>
                            <View style={styles.notificationTimeBadge}>
                              <Text style={styles.notificationTimeText}>
                                {displayTime}
                              </Text>
                              {n.content.data?.isCustom && (
                                <Icon source="star" size={12} color="#FF9500" style={styles.starIcon} />
                              )}
                            </View>
                          </View>

                          <Text style={styles.notificationBody} numberOfLines={2}>
                            {n.content.body}
                          </Text>

                          <View style={styles.notificationFooter}>
                            <Button
                              mode="contained-tonal"
                              textColor="#A090FF"
                              onPress={() => openCustomModal(n)}
                              style={styles.footerButton}
                              contentStyle={{ height: 40 }}
                              labelStyle={{ fontSize: 14, fontWeight: '600' }}
                              icon="pencil-outline"
                            >
                              Изменить
                            </Button>
                            <Button
                              mode="contained-tonal"
                              textColor="#FF3B30"
                              onPress={() => cancelNotification(n.identifier)}
                              style={styles.footerButton}
                              contentStyle={{ height: 40 }}
                              labelStyle={{ fontSize: 14, fontWeight: '600' }}
                              icon="delete-outline"
                            >
                              Отменить
                            </Button>
                          </View>
                        </LinearGradient>
                      </Card>
                    </View>
                  );
                })}
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>

      {/* 🔹 Модальное окно — ПОЛНОСТЬЮ ПЕРЕДЕЛАНО */}
      <Portal>
        <Modal
          visible={customModalVisible}
          onDismiss={() => {
            setCustomModalVisible(false);
            setSelectedNotification(null);
            setCustomTime("");
          }}
          dismissable={true}
          // ✅ УБРАНО contentContainerStyle — управляем вручную
        >
          {/* 🔹 Внешняя обёртка с фиксированными размерами */}
          <SafeAreaView style={styles.modalOuterContainer}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1 }}
            >
              <View style={styles.modalInnerContainer}>
                {/* Заголовок */}
                <LinearGradient
                  colors={['#1E1C33', '#151328']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalHeader}
                >
                  <Text style={styles.modalTitle}>Кастомное уведомление</Text>
                </LinearGradient>

                {/* Скроллируемый контент */}
                <ScrollView
                  style={styles.modalScrollView}
                  contentContainerStyle={styles.modalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {selectedNotification && (
                    <>
                      <View style={styles.formRow}>
                        <View style={styles.formIconModal}>
                          <Icon 
                            source={getFormDisplay(selectedNotification.form).icon}
                            size={20}
                            color="#A090FF"
                          />
                        </View>
                        <View>
                          <Text style={styles.modalLabel}>Лекарство</Text>
                          <Text style={styles.modalValue}>{selectedNotification.name}</Text>
                        </View>
                      </View>

                      <View style={styles.divider} />

                      <Text style={styles.modalLabel}>Приём</Text>
                      <View style={{ flexDirection: 'row', gap: 16 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#A8A2D2', fontSize: 13, marginBottom: 4 }}>Время</Text>
                          <Text style={styles.modalValue}>{selectedNotification.scheduledTime}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#A8A2D2', fontSize: 13, marginBottom: 4 }}>Дата</Text>
                          <Text style={styles.modalValue}>
                            {selectedNotification.medicationTime.toLocaleDateString('ru-RU', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.modalLabel}>Форма</Text>
                      <Text style={styles.modalValue}>
                        {getFormDisplay(selectedNotification.form).label}
                      </Text>
                    </>
                  )}

                  <Text style={styles.modalLabel}>Время уведомления</Text>
                  <TextInput
                    label="ЧЧ:ММ (например, 08:30)"
                    value={customTime}
                    onChangeText={setCustomTime}
                    mode="outlined"
                    style={styles.modalTextInput}
                    theme={{ colors: { primary: '#6D5BFF', background: '#2A2742' } }}
                    keyboardType="default"
                    placeholder="08:30"
                  />

                  <Text style={styles.modalWarning}>
                    Оригинальное уведомление будет заменено. Кастомные уведомления отмечены ★.
                  </Text>
                </ScrollView>

                {/* Кнопки */}
                <View style={styles.modalButtonRow}>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setCustomModalVisible(false);
                      setSelectedNotification(null);
                      setCustomTime("");
                    }}
                    style={[styles.footerButton, { borderColor: '#3A345F', backgroundColor: '#1E1C33' }]}
                    labelStyle={{ fontSize: 15, color: '#A8A2D2' }}
                  >
                    Отмена
                  </Button>
                  <Button
                    mode="contained"
                    onPress={handleCustomNotification}
                    style={[styles.footerButton, { backgroundColor: '#6D5BFF' }]}
                    labelStyle={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}
                    disabled={!customTime || !/^[0-2]\d:[0-5]\d$/.test(customTime)}
                  >
                    Применить
                  </Button>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </Portal>
    </Screen>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  scrollContent: {
    padding: width < 400 ? 12 : 16,
    maxWidth: width < 600 ? width * 0.95 : 760,
    alignSelf: 'center',
    width: '100%',
    paddingBottom: 40,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: width < 400 ? 26 : 32,
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
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  subtitle: {
    color: '#B5B0D1',
    fontSize: width < 400 ? 13 : 14,
    textAlign: 'center',
    lineHeight: 20,
    opacity: 0.9,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 26,
    flexWrap: 'wrap',
  },
  actionButton: {
    minWidth: 140,
    maxWidth: width < 400 ? 140 : 160,
  },
  gradientButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  gradientButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  outlineButton: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#15132830',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  outlineButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: width < 400 ? 14 : 15,
    letterSpacing: 0.3,
  },
  statsCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#15132830',
    backdropFilter: 'blur(12px)',
  },
  statsGradient: {
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsLabel: {
    color: '#A8A2D2',
    fontSize: 15,
    fontWeight: '500',
  },
  statsValue: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  statsLastUpdate: {
    color: '#A090FF',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#E0E0E0',
    fontSize: width < 400 ? 17 : 20,
    fontWeight: '700',
    marginBottom: 20,
    paddingHorizontal: 4,
    position: 'relative',
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayHeader: {
    backgroundColor: '#1E1C33',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3A345F',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayHeaderText: {
    color: '#5ECC7B',
    fontSize: width < 400 ? 15 : 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  dayHeaderCount: {
    backgroundColor: '#5ECC7B20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderCountText: {
    color: '#5ECC7B',
    fontSize: 12,
    fontWeight: '600',
  },
  notificationItem: {
    marginBottom: 14,
  },
  notificationCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
    backgroundColor: '#1E1C3340',
    backdropFilter: 'blur(10px)',
  },
  notificationGradient: {
    padding: 18,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '70%',
  },
  formIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#6D5BFF15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  notificationTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  notificationTimeBadge: {
    backgroundColor: '#2E284F',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 64,
    alignItems: 'center',
    flexDirection: 'row',
  },
  notificationTimeText: {
    color: '#A090FF',
    fontSize: 13,
    fontWeight: '600',
  },
  starIcon: {
    marginLeft: 4,
    color: '#FF9500',
  },
  notificationBody: {
    color: '#B8B4D4',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    opacity: 0.95,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  footerButton: {
    flex: 1,
    borderRadius: 14,
    height: 40,
  },
  emptyContainer: {
    marginTop: 70,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    marginBottom: 28,
    padding: 20,
    borderRadius: 40,
    backgroundColor: '#6D5BFF15',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 12,
  },
  emptyTitle: {
    color: '#E0E0E0',
    fontSize: width < 400 ? 20 : 24,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#A8A2D2',
    fontSize: width < 400 ? 14 : 16,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.85,
    maxWidth: 400,
  },

  // 🔹 МОДАЛЬНОЕ ОКНО — КЛЮЧЕВЫЕ ИЗМЕНЕНИЯ
  modalOuterContainer: {
  backgroundColor: '#1E1C33',
  margin: 16,
  borderRadius: 24,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: '#3A345F',
  maxWidth: 480,
  width: '90%',
  maxHeight: '100%',
  minHeight: 500,
  alignSelf: 'center',
  flex: 0,
},
  modalInnerContainer: {
    backgroundColor: '#1E1C33',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
    width: '100%',
    maxWidth: 480,
    maxHeight: '100%', // ✅ ограничение по высоте
    minHeight: 500,   // ✅ мин. высота, чтобы не "схлопывалось"
    alignSelf: 'center',
    flex: 0,
  },
  modalHeader: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#3A345F',
    backgroundColor: '#15132850',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  modalScrollView: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
  },
  modalLabel: {
    color: '#A8A2D2',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 6,
    marginTop: 12,
  },
  modalValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 20,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  formIconModal: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#6D5BFF20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalTextInput: {
    marginBottom: 18,
    backgroundColor: '#2A2742',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalWarning: {
    color: '#FFB347',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 4,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#3A345F',
    backgroundColor: '#15132850',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2742',
    marginVertical: 16,
  },
});