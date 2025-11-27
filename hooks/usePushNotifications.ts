import { useState, useEffect, useRef } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform, Alert } from "react-native";
import { getLocalUser } from "@/services/localUser.service";
import apiClient from "@/services/api";

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);

  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // ✅ Настройка обработки входящих уведомлений
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowAlert: true,
      }),
    });

    console.log("🔔 Обработчик уведомлений настроен");
  }, []);

  // Регистрация уведомлений
  const registerForPushNotificationsAsync = async () => {
    console.log("🔔 Начинаем регистрацию push-уведомлений...");

    if (!Device.isDevice) {
      console.warn("⚠️ Push-уведомления работают только на физическом устройстве");
      setIsRegistered(true);
      return null;
    }

    let token: string | null = null;

    try {
      // Запрашиваем разрешение
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log(`🔔 Текущий статус разрешений: ${existingStatus}`);
      
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        console.log("🔔 Запрашиваем разрешение...");
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
        console.log(`🔔 Новый статус разрешений: ${finalStatus}`);
      }

      if (finalStatus !== "granted") {
        console.warn("❌ Разрешение на уведомления не предоставлено");
        Alert.alert(
          "Разрешение не получено",
          "Без разрешения уведомления работать не будут. Измените настройки вручную.",
          [
            { text: "OK", style: "default" },
            { text: "Настройки", onPress: () => Notifications.openSettingsAsync() }
          ]
        );
        setIsRegistered(true);
        return null;
      }

      console.log("✅ Разрешение на уведомления получено");

      // Получаем Expo Push Token для отправки с сервера
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        Constants?.easConfig?.projectId;

      if (!projectId) {
        console.warn("⚠️ Project ID не найден. Push-токен не будет получен.");
        setIsRegistered(true);
        return null;
      }

      console.log(`🔔 Project ID: ${projectId}`);

      try {
        console.log("🔔 Получаем Expo Push Token...");
        const { data } = await Notifications.getExpoPushTokenAsync({
          projectId,
        });
        token = data;
        setExpoPushToken(token);
        console.log("✅ Expo Push Token получен:", token.substring(0, 15) + "...");
      } catch (e) {
        console.error("❌ Ошибка получения Expo Push Token:", e);
        // Продолжаем работу — локальные уведомления всё равно работают
      }

      // Настройка канала Android
      if (Platform.OS === "android") {
        console.log("📱 Настраиваем Android канал...");
        await Notifications.setNotificationChannelAsync("reminders", {
          name: "Напоминания",
          importance: Notifications.AndroidImportance.HIGH,
          sound: true,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
          description: "Напоминания о приёме лекарств",
        });
        console.log("✅ Android канал 'reminders' создан");
      }

      setIsRegistered(true);
      console.log("✅ Регистрация уведомлений завершена");
      return token;
    } catch (error) {
      console.error("💥 Ошибка регистрации уведомлений:", error);
      setIsRegistered(true);
      return null;
    }
  };

  // Отправка токена на сервер (опционально)
  const sendTokenToServer = async (token: string) => {
    try {
      console.log("🌐 Отправка токена на сервер...");
      const user = await getLocalUser();
      if (!user?.id) {
        console.log("⚠️ Пользователь не найден, пропускаем отправку токена");
        return;
      }

      await apiClient.postWithAuth("/users/update_push_token", {
        expo_push_token: token,
      });
      console.log("✅ Push-токен отправлен на сервер");
    } catch (error) {
      console.warn("⚠️ Не удалось отправить токен на сервер:", error);
    }
  };

  // Инициализация
  useEffect(() => {
    console.log("🔔 Инициализация системы уведомлений...");
    
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        sendTokenToServer(token);
      }
    });

    // Слушатели уведомлений
    notificationListener.current = Notifications.addNotificationReceivedListener((n) => {
      console.log("🔔 ПОЛУЧЕНО УВЕДОМЛЕНИЕ:", {
        title: n.request.content.title,
        body: n.request.content.body,
        data: n.request.content.data,
        date: new Date(n.date).toLocaleString('ru-RU')
      });
      setNotification(n);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((r) => {
      console.log("📬 ПОЛЬЗОВАТЕЛЬ ОТКРЫЛ УВЕДОМЛЕНИЕ:", {
        action: r.actionIdentifier,
        notification: r.notification.request.content.title,
        data: r.notification.request.content.data
      });
      // Можно добавить навигацию: router.push(`/medication/${r.notification.request.content.data?.medId}`)
    });

    console.log("✅ Слушатели уведомлений установлены");

    return () => {
      console.log("🔔 Очистка слушателей уведомлений...");
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { 
    expoPushToken, 
    notification, 
    isRegistered,
    registerForPushNotificationsAsync 
  };
}