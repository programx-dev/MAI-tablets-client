import React, { useState, useEffect } from "react";
import { View, ScrollView, Platform, Alert } from "react-native";
import { Button, Text, Modal, Portal, TextInput } from "react-native-paper";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Screen } from "@/components/screen";
import { useDatabase } from "@/hooks/use-database";
import { usePushNotifications } from "@/hooks/usePushNotifications";

// ✅ Обработчик уведомлений
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  }),
});

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
            title: `💊 Скоро приём: ${name}`,
            body: `Через 10 минут нужно принять ${form || "лекарство"} в ${time}`,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
            data: { 
              medicationName: name, 
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
  scheduledTime: string, // Время приема лекарства
  customTime: string,    // Время уведомления
  medicationTime: Date   // Дата приема лекарства
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
        title: `💊 Напоминание: ${name}`,
        body: `В ${customTime} нужно принять ${form || "лекарство"} в ${scheduledTime}`,
        sound: true,
        data: { 
          medicationName: name,
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

// ✅ Группировка уведомлений по дням
function groupNotificationsByDay(notifications: Notifications.NotificationRequest[]) {
  const grouped: { [key: string]: Notifications.NotificationRequest[] } = {};
  
  notifications.forEach(notification => {
    const trigger = notification.trigger as any;
    if (trigger?.type === 'timeInterval') {
      const notificationTime = new Date(Date.now() + trigger.seconds * 1000);
      const dateKey = notificationTime.toLocaleDateString('ru-RU');
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(notification);
    }
  });

  // Сортируем дни
  const sortedDays = Object.keys(grouped).sort((a, b) => {
    return new Date(a).getTime() - new Date(b).getTime();
  });

  return { grouped, sortedDays };
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

  // Инициализация канала Android
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

      // Загружаем существующие уведомления
      const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(existingNotifications);
    };

    initNotifications();
  }, []);

  // 📅 Автоматическое планирование всех уведомлений
  const scheduleAllMedNotifications = async () => {
    try {
      setIsLoading(true);
      console.log("🔄 Запуск планирования уведомлений...");
      
      // Очистка старых уведомлений
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Даем время для очистки
      await new Promise(resolve => setTimeout(resolve, 500));

      const meds = await getMedications();
      console.log(`📋 Найдено лекарств: ${meds.length}`);

      let totalScheduled = 0;

      // Планирование для каждого лекарства
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

      // Даем время для асинхронного планирования
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Получаем список запланированных уведомлений
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(allScheduled);
      
      // Сохраняем время последней планировки
      const updateTime = new Date().toLocaleString('ru-RU');
      setLastUpdate(updateTime);
      await AsyncStorage.setItem("lastScheduled", Date.now().toString());
      
      Alert.alert(
        "✅ Готово", 
        `Запланировано уведомлений: ${allScheduled.length}\nУведомления настроены на 7 дней вперед.`
      );

    } catch (error) {
      console.error("💥 Ошибка при планировании:", error);
      Alert.alert("Ошибка", "Не удалось запланировать уведомления");
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Функция для кастомного уведомления
  const handleCustomNotification = async () => {
    if (!selectedNotification) return;
    
    // Валидация времени
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(customTime)) {
      Alert.alert("Ошибка", "Введите время в формате ЧЧ:MM (например, 08:30)");
      return;
    }

    // Удаляем оригинальное уведомление
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
      
      // Обновляем список уведомлений
      const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
      setScheduled(allScheduled);
      
      Alert.alert("✅ Успех", `Уведомление перенесено на ${customTime}`);
    }
  };

  // ✅ Открыть модальное окно для кастомного уведомления
  const openCustomModal = (notification: Notifications.NotificationRequest) => {
    const medicationName = notification.content.data?.medicationName || 
                          notification.content.title.replace('💊 Скоро приём: ', '').replace('💊 Напоминание: ', '');
    const scheduledTime = notification.content.data?.scheduledTime || "неизвестно";
    const medicationTime = notification.content.data?.medicationTime ? 
                          new Date(notification.content.data.medicationTime) : new Date();
    const form = "лекарство";
    
    // Устанавливаем время по умолчанию (текущее время + 1 час)
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
    
    // Обновляем список
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    setScheduled(allScheduled);
    
    Alert.alert("✅ Удалено", "Уведомление отменено");
  };

  // Автопланировка при монтировании
  useEffect(() => {
    scheduleAllMedNotifications();
  }, []);

  const { grouped, sortedDays } = groupNotificationsByDay(scheduled);

  return (
    <Screen
      style={{
        flex: 1,
        backgroundColor: "#121212",
        paddingHorizontal: 16,
        paddingTop: 20,
      }}
    >
      <ScrollView contentContainerStyle={{ paddingVertical: 20 }}>
        <Text style={{ color: "white", fontSize: 18, marginBottom: 20, textAlign: "center" }}>
          Управление уведомлениями
        </Text>

        <Text style={{ color: "#aaa", textAlign: "center", marginBottom: 16 }}>
          Уведомления планируются на 7 дней вперед за 10 минут до приема
        </Text>

        <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 20 }}>
          <Button
            mode="contained"
            onPress={scheduleAllMedNotifications}
            loading={isLoading}
            disabled={isLoading}
            style={{ marginRight: 8 }}
          >
            {isLoading ? "Планирование..." : "Обновить"}
          </Button>

          <Button
            mode="outlined"
            textColor="#FF4444"
            onPress={async () => {
              await Notifications.cancelAllScheduledNotificationsAsync();
              setScheduled([]);
              await AsyncStorage.setItem("lastScheduled", "0");
              setLastUpdate(new Date().toLocaleString('ru-RU'));
              Alert.alert("✅ Очищено", "Все уведомления удалены");
            }}
          >
            Очистить все
          </Button>
        </View>

        <View style={{ 
          backgroundColor: '#1E1E1E', 
          borderRadius: 12, 
          padding: 16, 
          marginBottom: 20,
          borderWidth: 1,
          borderColor: '#333'
        }}>
          <Text style={{ color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>
            Статистика
          </Text>
          <Text style={{ color: "#aaa", fontSize: 14 }}>
            Активных уведомлений: <Text style={{ color: "white", fontWeight: "bold" }}>{scheduled.length}</Text>
          </Text>
          <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
            На ближайшие: <Text style={{ color: "white" }}>{sortedDays.length} дней</Text>
          </Text>
          {lastUpdate ? (
            <Text style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>
              Обновлено: {lastUpdate}
            </Text>
          ) : null}
        </View>

        {scheduled.length === 0 ? (
          <View style={{ 
            backgroundColor: '#1E1E1E', 
            borderRadius: 12, 
            padding: 20, 
            marginVertical: 10,
            borderWidth: 1,
            borderColor: '#333'
          }}>
            <Text style={{ color: "#777", textAlign: "center" }}>
              Нет активных уведомлений
            </Text>
            <Text style={{ color: "#666", fontSize: 12, textAlign: "center", marginTop: 8 }}>
              Нажмите "Обновить" для планирования уведомлений
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: "#aaa", fontSize: 16, marginBottom: 12 }}>
              Уведомления по дням:
            </Text>
            
            {sortedDays.map(day => (
              <View key={day} style={{ marginBottom: 16 }}>
                <Text style={{ 
                  color: "#4CAF50", 
                  fontSize: 14, 
                  fontWeight: "bold", 
                  marginBottom: 8,
                  paddingLeft: 8 
                }}>
                  {day}
                </Text>
                
                {grouped[day].map((n) => {
                  const trigger = n.trigger as any;
                  const displayTime = new Date(Date.now() + trigger.seconds * 1000).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  
                  const isCustom = n.content.data?.isCustom;
                  const customTime = n.content.data?.customTime;

                  return (
                    <View key={n.identifier} style={{ 
                      backgroundColor: '#2A2A2A', 
                      borderRadius: 8, 
                      padding: 12, 
                      marginVertical: 4,
                      borderWidth: 1,
                      borderColor: '#444'
                    }}>
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
                        {n.content.title}
                      </Text>
                      <Text style={{ color: "#ccc", fontSize: 12, marginTop: 4 }}>
                        {n.content.body}
                      </Text>
                      <Text style={{ color: "#888", fontSize: 10, marginTop: 4 }}>
                        🕒 {displayTime}
                        {isCustom && customTime && (
                          <Text style={{ color: "#FF9800" }}> • Кастомное</Text>
                        )}
                      </Text>
                      
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                        <Button
                          mode="outlined"
                          compact
                          onPress={() => openCustomModal(n)}
                          style={{ flex: 1, marginRight: 4 }}
                        >
                          Изменить время
                        </Button>
                        <Button
                          mode="outlined"
                          compact
                          textColor="#FF4444"
                          onPress={() => cancelNotification(n.identifier)}
                          style={{ flex: 1, marginLeft: 4 }}
                        >
                          Отменить
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        )}

        {/* ✅ Модальное окно для кастомного уведомления */}
        <Portal>
          <Modal
            visible={customModalVisible}
            onDismiss={() => setCustomModalVisible(false)}
            contentContainerStyle={{
              backgroundColor: '#1E1E1E',
              padding: 20,
              margin: 20,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, marginBottom: 16, textAlign: "center" }}>
              Изменение времени уведомления
            </Text>
            
            {selectedNotification && (
              <>
                <Text style={{ color: "#aaa", marginBottom: 8 }}>
                  Лекарство: <Text style={{ color: "white" }}>{selectedNotification.name}</Text>
                </Text>
                <Text style={{ color: "#aaa", marginBottom: 8 }}>
                  Прием в: <Text style={{ color: "white" }}>{selectedNotification.scheduledTime}</Text>
                </Text>
                <Text style={{ color: "#aaa", marginBottom: 16 }}>
                  Дата: <Text style={{ color: "white" }}>
                    {selectedNotification.medicationTime.toLocaleDateString('ru-RU')}
                  </Text>
                </Text>
              </>
            )}

            <Text style={{ color: "#aaa", marginBottom: 8 }}>
              Новое время уведомления:
            </Text>
            <TextInput
              label="Время (ЧЧ:MM)"
              value={customTime}
              onChangeText={setCustomTime}
              placeholder="08:30"
              mode="outlined"
              style={{ marginBottom: 16 }}
              theme={{ colors: { primary: '#4A3AFF' } }}
            />

            <Text style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>
              ⓘ Оригинальное уведомление будет удалено и заменено новым
            </Text>

            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Button
                mode="outlined"
                onPress={() => setCustomModalVisible(false)}
                style={{ flex: 1, marginRight: 8 }}
              >
                Отмена
              </Button>
              <Button
                mode="contained"
                onPress={handleCustomNotification}
                style={{ flex: 1, marginLeft: 8 }}
              >
                Сохранить
              </Button>
            </View>
          </Modal>
        </Portal>
      </ScrollView>
    </Screen>
  );
}