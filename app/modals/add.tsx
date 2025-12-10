import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";
import {
  Text,
  TextInput,
  HelperText,
  Card,
  ActivityIndicator,
} from "react-native-paper";
import { Screen } from "@/components/screen";
import { useNavigation } from "@react-navigation/native";
import { useDatabase, Medication } from "@/hooks/use-database";
import apiClient from "@/services/api";
import { getLocalUser } from "@/services/localUser.service";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  FadeIn,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Icon } from "react-native-paper";

const { width } = Dimensions.get("window");

const daysOfWeek = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];

const mapDayToNumber = (day: string): number => {
  const map: Record<string, number> = {
    "ПН": 1, "ВТ": 2, "СР": 3, "ЧТ": 4, "ПТ": 5, "СБ": 6, "ВС": 7
  };
  return map[day] ?? 1;
};

const formatTimeForServer = (timeStr: string): string => {
  if (timeStr.length === 5 && timeStr[2] === ":") {
    return `${timeStr}:00`;
  }
  return timeStr;
};

const formatDateString = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
};

const validateDate = (dateStr: string): boolean => {
  if (!dateStr) return true;
  const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
  const match = dateStr.match(regex);
  if (!match) return false;

  const [, dd, mm, yyyy] = match;
  const day = parseInt(dd, 10);
  const month = parseInt(mm, 10);
  const year = parseInt(yyyy, 10);

  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100;
};

const useScaledFontSize = (baseSize: number): number => {
  const scale = Math.min(width / 375, 1.3);
  return Math.max(12, baseSize * scale);
};

// =============== Исправленный AnimatedDropdown (в потоке разметки) ===============
type DropdownOption = {
  label: string;
  value: string;
};

const AnimatedDropdown = ({
  label,
  value,
  onChange,
  options,
  disabled = false,
  error = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: DropdownOption[];
  disabled?: boolean;
  error?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const heightAnim = useSharedValue(0);
  const opacityAnim = useSharedValue(0);

  const toggle = () => {
    if (disabled) return;
    const isOpening = !open;
    setOpen(isOpening);
    Haptics.selectionAsync();

    if (isOpening) {
      heightAnim.value = withTiming(48 * options.length, {
        duration: 200,
        easing: Easing.out(Easing.ease),
      });
      opacityAnim.value = withTiming(1, { duration: 150 });
    } else {
      heightAnim.value = withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.ease),
      });
      opacityAnim.value = withTiming(0, { duration: 100 });
    }
  };

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    heightAnim.value = withTiming(0, { duration: 100 });
    opacityAnim.value = withTiming(0, { duration: 80 });
    Haptics.selectionAsync();
  };

  const selectedLabel = options.find(opt => opt.value === value)?.label || "Выберите";

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Внешний лейбл, как у TextInput outlined */}
      <Text
        style={[
          styles.dropdownLabel,
          error && { color: "#FF4444" },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* Trigger */}
      <Pressable
        onPress={toggle}
        disabled={disabled}
        style={({ pressed }) => [
          styles.dropdownTrigger,
          error && { borderColor: "#FF4444" },
          pressed && { backgroundColor: "#353251" },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Выбрать ${label}`}
      >
        <View style={styles.dropdownContent}>
          <Text
            style={[
              styles.dropdownValue,
              { flex: 1, textAlign: "left" },
              !value && { color: "#A8A2D2" },
            ]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
          <Icon
            source={open ? "chevron-up" : "chevron-down"}
            size={20}
            color="#A8A2D2"
            style={{ marginLeft: 6 }}
          />
        </View>
      </Pressable>

      {/* Встраиваемая панель (в потоке!) */}
      <Animated.View
        style={[
          styles.dropdownPanelInFlow,
          {
            height: heightAnim,
            opacity: opacityAnim,
            overflow: "hidden",
          },
        ]}
      >
        {options.map((item, idx) => (
          <Pressable
            key={item.value}
            onPress={() => select(item.value)}
            style={({ pressed }) => [
              styles.dropdownItem,
              idx === 0 && {
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
              },
              idx === options.length - 1 && {
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
              },
              pressed && { backgroundColor: "#353251" },
            ]}
          >
            <Text style={styles.dropdownItemText}>{item.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
};

// =============== Основной компонент ===============
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

  const pulse = useSharedValue(0);

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
    Haptics.selectionAsync();

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
      const localId = await addMedication(med);
      console.log("✅ Лекарство сохранено локально, id:", localId);

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
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ Успех", "Лекарство добавлено!");
      } catch (syncError: any) {
        console.warn("⚠️ Синхронизация отложена:", syncError.message);
        Alert.alert(
          "✅ Сохранено",
          "Лекарство добавлено локально. Синхронизация при подключении.",
          [{ text: "Ок" }]
        );
      }

      navigation.goBack();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Ошибка", e.message || "Не удалось добавить лекарство");
    } finally {
      setIsLoading(false);
    }
  }, [
    name,
    form,
    startDate,
    endDate,
    scheduleType,
    timesList,
    instructions,
    selectedDays,
    intervalDays,
    addMedication,
    updateMedicationServerId,
    navigation,
  ]);

  useEffect(() => {
    if (isLoading) {
      pulse.value = withTiming(
        1,
        { duration: 300, easing: Easing.out(Easing.ease) },
        () => {
          pulse.value = withTiming(0, {
            duration: 300,
            easing: Easing.in(Easing.ease),
          });
        }
      );
    }
  }, [isLoading, pulse]);

  const pulseStyle = {
    transform: [{ scale: isLoading ? 1.03 : 1 }],
  };

  return (
    <Screen header={false} style={{ backgroundColor: "transparent" }}>
      <LinearGradient
        colors={["#0A0A0F", "#0E0D18", "#151328", "#0E0D18", "#0A0A0F"]}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        accessibilityLabel="Форма добавления лекарства"
      >
        <Animated.View entering={FadeInDown.springify().delay(100)}>
          <Text
            style={[styles.headerTitle, { fontSize: useScaledFontSize(32) }]}
            accessibilityRole="header"
          >
            Новое лекарство
          </Text>
          <View style={styles.sectionTitleLine} />
        </Animated.View>

        <Animated.View
          entering={FadeIn.duration(500).delay(150)}
          style={styles.subtitleContainer}
        >
          <Text
            style={[styles.subtitle, { fontSize: useScaledFontSize(14) }]}
            accessibilityRole="summary"
          >
            Добавьте препарат в свой цифровой медицинский план
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.springify().delay(200)}>
          <Card mode="contained" style={styles.formCard}>
            <LinearGradient
              colors={["#1E1C33", "#151328"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.8 }}
              style={[styles.cardGradient, { borderRadius: 20 }]}
            >
              <TextInput
                label="Название"
                value={name}
                onChangeText={setName}
                mode="outlined"
                error={!!errors.name}
                style={styles.input}
                theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
              />
              {errors.name && (
                <HelperText type="error" style={styles.errorText}>
                  {errors.name}
                </HelperText>
              )}

              {/* === Форма (в потоке) === */}
              <AnimatedDropdown
                label="Форма"
                value={form}
                onChange={setForm}
                error={!!errors.name}
                options={[
                  { label: "Таблетка", value: "tablet" },
                  { label: "Капли", value: "drop" },
                  { label: "Спрей", value: "spray" },
                ]}
              />

              {/* Дата начала */}
              <TextInput
                label="Дата начала (ДД.ММ.ГГГГ)"
                value={startDate}
                onChangeText={(text) => setStartDate(formatDateString(text))}
                keyboardType="numeric"
                maxLength={10}
                mode="outlined"
                error={!!errors.startDate}
                style={styles.input}
                theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
              />
              {errors.startDate && (
                <HelperText type="error" style={styles.errorText}>
                  {errors.startDate}
                </HelperText>
              )}

              {/* Дата окончания */}
              <TextInput
                label="Дата окончания (необязательно)"
                value={endDate}
                onChangeText={(text) => setEndDate(formatDateString(text))}
                keyboardType="numeric"
                maxLength={10}
                mode="outlined"
                error={!!errors.endDate}
                style={styles.input}
                theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
              />
              {errors.endDate && (
                <HelperText type="error" style={styles.errorText}>
                  {errors.endDate}
                </HelperText>
              )}

              {/* === Расписание (в потоке) === */}
              <AnimatedDropdown
                label="Расписание"
                value={scheduleType}
                onChange={setScheduleType}
                error={!!errors.weekly || !!errors.interval}
                options={[
                  { label: "Ежедневно", value: "daily" },
                  { label: "По дням недели", value: "weekly_days" },
                  { label: "Каждые X дней", value: "every_x_days" },
                ]}
              />

              {scheduleType === "every_x_days" && (
                <>
                  <TextInput
                    label="Интервал (дней)"
                    value={intervalDays}
                    onChangeText={setIntervalDays}
                    keyboardType="numeric"
                    mode="outlined"
                    error={!!errors.interval}
                    style={styles.input}
                    theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
                  />
                  {errors.interval && (
                    <HelperText type="error" style={styles.errorText}>
                      {errors.interval}
                    </HelperText>
                  )}
                </>
              )}

              {scheduleType === "weekly_days" && (
                <View style={styles.daysContainer}>
                  {daysOfWeek.map((day) => (
                    <TouchableOpacity
                      key={day}
                      onPress={() => {
                        setSelectedDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day]
                        );
                        Haptics.selectionAsync();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Выбрать ${day}`}
                      accessibilityState={{ selected: selectedDays.includes(day) }}
                    >
                      <View
                        style={[
                          styles.dayBox,
                          {
                            backgroundColor: selectedDays.includes(day)
                              ? "#5ECC7B"
                              : "#2A2742",
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: selectedDays.includes(day)
                              ? "#0E1D15"
                              : "#A8A2D2",
                            fontWeight: "600",
                          }}
                        >
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
                style={styles.input}
                placeholder="Например: 08:00, 20:00"
                theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
              />
              {errors.times && (
                <HelperText type="error" style={styles.errorText}>
                  {errors.times}
                </HelperText>
              )}

              <TextInput
                label="Инструкции"
                value={instructions}
                onChangeText={setInstructions}
                mode="outlined"
                multiline
                numberOfLines={3}
                style={[styles.input, { minHeight: 100 }]}
                theme={{ colors: { primary: "#6D5BFF", background: "#2A2742" } }}
              />
            </LinearGradient>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.springify().delay(300)}>
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.submitButton,
              {
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              },
              pulseStyle,
            ]}
            disabled={isLoading || Object.keys(errors).length > 0}
            accessibilityRole="button"
            accessibilityLabel="Добавить лекарство"
          >
            <LinearGradient
              colors={["#6D5BFF", "#8A7FFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.submitButtonGradient, { borderRadius: 18 }]}
            >
              {isLoading ? (
                <>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text
                    style={[
                      styles.submitButtonText,
                      { fontSize: useScaledFontSize(15) },
                    ]}
                  >
                    Добавление…
                  </Text>
                </>
              ) : (
                <>
                  <Icon
                    source="pill"
                    size={18}
                    color="#FFF"
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.submitButtonText,
                      { fontSize: useScaledFontSize(15) },
                    ]}
                  >
                    Добавить лекарство
                  </Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: width < 400 ? 12 : 16,
    maxWidth: width < 600 ? width * 0.95 : 760,
    alignSelf: "center",
    width: "100%",
    paddingBottom: 40,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    textShadowColor: "#6D5BFF40",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sectionTitleLine: {
    height: 2,
    width: 60,
    backgroundColor: "#6D5BFF",
    alignSelf: "center",
    borderRadius: 1,
    marginTop: 4,
  },
  subtitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  subtitle: {
    color: "#B5B0D1",
    textAlign: "center",
    lineHeight: 20,
    opacity: 0.9,
  },
  formCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#3A345F",
    backgroundColor: "#15132830",
  },
  cardGradient: {
    padding: 20,
  },
  input: {
    marginBottom: 16,
    backgroundColor: "#2A2742",
    borderRadius: 18,
  },
  errorText: {
    marginBottom: 12,
    color: "#FF4444",
    fontWeight: "500",
  },
  daysContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dayBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  submitButton: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 16,
  },
  submitButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    letterSpacing: 0.3,
  },

  // === Dropdown Styles — В ПОТОКЕ (НЕ ABSOLUTE) ===
  dropdownLabel: {
    color: "#A8A2D2",
    fontSize: 12,
    marginBottom: 4,
    marginLeft: 12,
  },
  dropdownTrigger: {
    backgroundColor: "#2A2742",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#3A345F",
    minHeight: 56,
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  dropdownValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "400",
  },
  dropdownPanelInFlow: {
    backgroundColor: "#1E1C33",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3A345F",
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
    backgroundColor: "#2A2742",
  },
  dropdownItemText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
}); 