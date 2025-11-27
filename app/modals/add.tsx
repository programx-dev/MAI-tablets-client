import React, { useState, useCallback, useRef } from "react";
import { View, TouchableOpacity, Alert } from "react-native";
import {
  Button,
  Text,
  TextInput,
  Menu,
  HelperText,
} from "react-native-paper";
import { Screen } from "@/components/screen";
import { useNavigation } from "@react-navigation/native";
import { useDatabase, Medication } from "@/hooks/use-database";
import apiClient from "@/services/api";
import { getLocalUser } from "@/services/localUser.service";

const daysOfWeek = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

// 🔁 Маппинг: "ПН" → 1, "ВТ" → 2, ..., "ВС" → 7
const mapDayToNumber = (day: string): number => {
  const map: Record<string, number> = {
    "ПН": 1, "ВТ": 2, "СР": 3, "ЧТ": 4, "ПТ": 5, "СБ": 6, "ВС": 7
  };
  return map[day] ?? 1;
};

// 🔁 Формат времени: "08:00" → "08:00:00"
const formatTimeForServer = (timeStr: string): string => {
  if (timeStr.length === 5 && timeStr[2] === ":") {
    return `${timeStr}:00`;
  }
  return timeStr;
};

// ✅ Автоформатирование даты: "20112025" → "20.11.2025"
const formatDateString = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
};

// ✅ Валидация даты
const validateDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;

  const [, dd, mm, yyyy] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);

  return (
    day >= 1 && day <= 31 &&
    month >= 1 && month <= 12 &&
    year >= 1900 && year <= 2100
  );
};

export default function Add() {
  const { addMedication, updateMedicationServerId } = useDatabase();
  const navigation = useNavigation();

  const [name, setName] = useState("");
  const [form, setForm] = useState<Medication["form"]>("tablet");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scheduleType, setScheduleType] = useState<Medication["schedule_type"]>("daily");
  const [timesList, setTimesList] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [intervalDays, setIntervalDays] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const startDateRef = useRef<TextInput>(null);
  const endDateRef = useRef<TextInput>(null);

  const validate = () => {
    const err: Record<string, string> = {};

    if (!name.trim()) err.name = "Обязательно";
    if (!startDate) err.startDate = "Обязательно";
    if (startDate && !validateDate(startDate)) err.startDate = "Формат: ДД.ММ.ГГГГ";
    if (endDate && !validateDate(endDate)) err.endDate = "Формат: ДД.ММ.ГГГГ";

    const times = timesList.split(",").map(t => t.trim());
    for (const t of times) {
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(t)) {
        err.times = `Неверное время: ${t}`;
        break;
      }
    }

    if (scheduleType === "every_x_days") {
      const num = parseInt(intervalDays);
      if (!intervalDays || isNaN(num) || num < 1 || num > 30) {
        err.interval = "1–30 дней";
      }
    }

    if (scheduleType === "weekly_days" && selectedDays.length === 0) {
      err.weekly = "Выберите дни";
    }

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleAdd = useCallback(async () => {
    if (!validate()) return;
    
    setIsLoading(true);

    // Конвертация дат
    const convertDate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      const [dd, mm, yyyy] = dateStr.split(".").map(Number);
      return `${yyyy}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
    };

    const isoStartDate = convertDate(startDate)!;
    const isoEndDate = convertDate(endDate);

    const med: Medication = {
      name,
      form,
      instructions: instructions || null,
      start_date: isoStartDate,
      end_date: isoEndDate,
      schedule_type: scheduleType,
      weekly_days: scheduleType === "weekly_days" ? selectedDays : null,
      interval_days: scheduleType === "every_x_days" ? parseInt(intervalDays) : null,
      times_list: timesList.split(",").map(t => t.trim()),
    };

    try {
      console.log("💊 Добавление нового лекарства:", med.name);

      // 1️⃣ Сохраняем локально
      const localId = await addMedication(med);
      console.log("✅ Лекарство сохранено локально, id:", localId);

      // ✅ УВЕДОМЛЕНИЯ БУДУТ ПЛАНИРОВАТЬСЯ ТОЛЬКО В ЭКРАНЕ NOTIFICATIONS
      console.log("📝 Уведомления будут запланированы в разделе 'Уведомления'");

      // 2️⃣ Отправляем на сервер
      try {
        const user = await getLocalUser();
        if (!user) throw new Error("Пользователь не авторизован");

        const serverPayload = {
          name: med.name,
          form: med.form,
          instructions: med.instructions,
          start_date: med.start_date,
          end_date: med.end_date,
          schedule_type: med.schedule_type,
          week_days: med.schedule_type === "weekly_days"
            ? selectedDays.map(mapDayToNumber)
            : undefined,
          interval_days: med.schedule_type === "every_x_days"
            ? med.interval_days
            : undefined,
          times_per_day: med.times_list.map(formatTimeForServer),
        };

        const serverResponse = await apiClient.postWithAuth(
          "/medicines/add_medication",
          serverPayload
        );

        if (serverResponse.id) {
          await updateMedicationServerId(localId, serverResponse.id);
          console.log("✅ Лекарство синхронизировано с сервером, serverId:", serverResponse.id);
        }

        Alert.alert("✅ Успех", "Лекарство добавлено! Уведомления можно настроить в разделе 'Уведомления'.");
      } catch (syncError: any) {
        console.warn("⚠️ Синхронизация отложена:", syncError.message);
        Alert.alert(
          "✅ Сохранено",
          "Лекарство добавлено локально. Синхронизация выполнится при подключении к сети.",
          [{ text: "Ок" }]
        );
      }

      navigation.goBack();
    } catch (e: any) {
      console.error("❌ Ошибка добавления:", e);
      Alert.alert("Ошибка", e.message || "Не удалось добавить лекарство");
    } finally {
      setIsLoading(false);
    }
  }, [
    name, form, startDate, endDate, scheduleType, timesList,
    instructions, selectedDays, intervalDays,
    addMedication, updateMedicationServerId, navigation
  ]);

  // UI — меню
  const [formVisible, setFormVisible] = useState(false);
  const [scheduleVisible, setScheduleVisible] = useState(false);

  return (
    <Screen style={{ flex: 1, padding: 20 }}>
      <Text variant="titleLarge" style={{ marginBottom: 16 }}>
        Добавить медикамент
      </Text>

      <TextInput
        label="Название"
        value={name}
        onChangeText={setName}
        mode="outlined"
        error={!!errors.name}
        style={{ marginBottom: 12 }}
      />
      {errors.name && <HelperText type="error">{errors.name}</HelperText>}

      {/* Форма */}
      <Menu
        visible={formVisible}
        onDismiss={() => setFormVisible(false)}
        anchor={
          <TextInput
            label="Форма"
            value={form === "tablet" ? "Таблетка" : form === "drop" ? "Капли" : "Спрей"}
            mode="outlined"
            editable={false}
            onPress={() => setFormVisible(true)}
            error={!!errors.form}
            style={{ marginBottom: 12 }}
          />
        }
      >
        {[
          { label: "Таблетка", value: "tablet" },
          { label: "Капли", value: "drop" },
          { label: "Спрей", value: "spray" },
        ].map(item => (
          <Menu.Item
            key={item.value}
            title={item.label}
            onPress={() => {
              setForm(item.value);
              setFormVisible(false);
            }}
          />
        ))}
      </Menu>

      {/* Дата начала */}
      <TextInput
        ref={startDateRef}
        label="Дата начала (ДД.ММ.ГГГГ)"
        value={startDate}
        onChangeText={(text) => setStartDate(formatDateString(text))}
        keyboardType="numeric"
        maxLength={10}
        mode="outlined"
        error={!!errors.startDate}
        style={{ marginBottom: 12 }}
        onSubmitEditing={() => endDateRef.current?.focus()}
      />
      {errors.startDate && <HelperText type="error">{errors.startDate}</HelperText>}

      {/* Дата окончания */}
      <TextInput
        ref={endDateRef}
        label="Дата окончания (необязательно)"
        value={endDate}
        onChangeText={(text) => setEndDate(formatDateString(text))}
        keyboardType="numeric"
        maxLength={10}
        mode="outlined"
        error={!!errors.endDate}
        style={{ marginBottom: 12 }}
      />
      {errors.endDate && <HelperText type="error">{errors.endDate}</HelperText>}

      {/* Расписание */}
      <Menu
        visible={scheduleVisible}
        onDismiss={() => setScheduleVisible(false)}
        anchor={
          <TextInput
            label="Расписание"
            value={
              scheduleType === "daily" ? "Ежедневно" :
              scheduleType === "weekly_days" ? "По дням недели" : "Каждые X дней"
            }
            mode="outlined"
            editable={false}
            onPress={() => setScheduleVisible(true)}
            error={!!errors.schedule}
            style={{ marginBottom: 12 }}
          />
        }
      >
        {[
          { label: "Ежедневно", value: "daily" },
          { label: "По дням недели", value: "weekly_days" },
          { label: "Каждые X дней", value: "every_x_days" },
        ].map(item => (
          <Menu.Item
            key={item.value}
            title={item.label}
            onPress={() => {
              setScheduleType(item.value);
              setScheduleVisible(false);
            }}
          />
        ))}
      </Menu>

      {scheduleType === "every_x_days" && (
        <>
          <TextInput
            label="Интервал (дней)"
            value={intervalDays}
            onChangeText={setIntervalDays}
            keyboardType="numeric"
            mode="outlined"
            error={!!errors.interval}
            style={{ marginBottom: 12 }}
          />
          {errors.interval && <HelperText type="error">{errors.interval}</HelperText>}
        </>
      )}

      {scheduleType === "weekly_days" && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          {daysOfWeek.map(day => (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDays(prev =>
                prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
              )}
            >
              <View style={{
                width: 40, height: 40,
                borderRadius: 20,
                backgroundColor: selectedDays.includes(day) ? "#4A3AFF" : "#E0E0E0",
                justifyContent: "center",
                alignItems: "center",
              }}>
                <Text style={{ color: selectedDays.includes(day) ? "white" : "black" }}>
                  {day}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TextInput
        label="Время приёма (08:00, 20:00)"
        value={timesList}
        onChangeText={setTimesList}
        mode="outlined"
        error={!!errors.times}
        style={{ marginBottom: 16 }}
        placeholder="Например: 08:00, 20:00"
      />
      {errors.times && <HelperText type="error">{errors.times}</HelperText>}

      <TextInput
        label="Инструкции"
        value={instructions}
        onChangeText={setInstructions}
        mode="outlined"
        multiline
        style={{ marginBottom: 24 }}
      />

      <Button
        mode="contained"
        onPress={handleAdd}
        loading={isLoading}
        disabled={Object.keys(errors).length > 0 || isLoading}
        style={{ backgroundColor: "#4A3AFF" }}
      >
        {isLoading ? "Добавление..." : "Добавить"}
      </Button>
    </Screen>
  );
}