import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from 'react-native';
import { Text, Card, Icon, useTheme } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import apiClient from '@/services/api';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  FadeInDown,
  FadeIn,
  interpolateColor,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { logDebug, logWarning, logError } from '@/utils/debug-log';

// 🔑 Типы
interface Medication {
  id: number;
  server_id: number | null;
  name: string;
  form: string;
  instructions?: string;
  start_date: string; // "YYYY-MM-DD"
  end_date?: string;
  schedule_type: 'daily' | 'weekly_days' | 'every_x_days';
  week_days?: number[]; // 1=ПН, ..., 7=ВС
  interval_days?: number;
  times_per_day: string[]; // ["08:00", "20:00"]
}

interface Intake {
  id: number;
  medication_id: number;
  scheduled_time: string; // ISO, e.g. "2025-12-08T08:00:00+03:00"
  taken_time: string;
  status: 'taken' | 'skipped';
  notes?: string;
}

interface Patient {
  uuid: string;
  username: string;
}

const { width } = Dimensions.get('window');
const DAY_WIDTH = (width - 48) / 7;
const CALENDAR_OFFSET_X = -2;

// 🔹 WeekContent — отображение одной недели
type WeekContentProps = {
  weekStart: Date;
  selectedDayIndex: number;
  setSelectedDayIndex: (index: number) => void;
  medications: Medication[];
  intakes: Intake[];
  patient: Patient | null;
  router: ReturnType<typeof useRouter>;
  onGoToToday: () => void;
};

const WeekContent: React.FC<WeekContentProps> = React.memo(
  ({ 
    weekStart, 
    selectedDayIndex, 
    setSelectedDayIndex, 
    medications, 
    intakes, 
    patient, 
    router, 
    onGoToToday 
  }) => {
    const { colors } = useTheme();

    // Анимации
    const todayPulse = useSharedValue(0);
    const todayButtonScale = useSharedValue(1);
    const shakingMedId = useSharedValue<number | null>(null);
    const shakeOffset = useSharedValue(0);

    const pulseStartedRef = useRef(false);

    // Пульсация сегодняшней кнопки
    useEffect(() => {
      if (pulseStartedRef.current) return;
      pulseStartedRef.current = true;
      todayPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 650, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 650, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      return () => {
        todayPulse.value = 0;
      };
    }, []);

    // Тряска для пропущенных приёмов **на СЕГОДНЯ**
    useEffect(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(weekStart);
      selectedDate.setDate(weekStart.getDate() + selectedDayIndex);
      selectedDate.setHours(0, 0, 0, 0);

      if (selectedDate.toDateString() !== today.toDateString()) return;

      const skippedToday = intakes.filter(intake => {
        const schedDate = new Date(intake.scheduled_time);
        schedDate.setHours(0, 0, 0, 0);
        return intake.status === 'skipped' && schedDate.toDateString() === today.toDateString();
      });

      if (skippedToday.length > 0) {
        const medId = skippedToday[skippedToday.length - 1].medication_id;
        shakingMedId.value = medId;
      }
    }, [intakes, weekStart, selectedDayIndex]);

    useEffect(() => {
      if (shakingMedId.value !== null) {
        shakeOffset.value = withSequence(
          withTiming(3, { duration: 50 }),
          withTiming(-3, { duration: 100 }),
          withTiming(0, { duration: 50 })
        );
        const timeout = setTimeout(() => {
          shakingMedId.value = null;
        }, 250);
        return () => clearTimeout(timeout);
      }
    }, [shakingMedId.value]);

    const days = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

    const getDateForDay = useCallback((dayIndex: number): Date => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + dayIndex);
      date.setHours(0, 0, 0, 0);
      return date;
    }, [weekStart]);

    const selectedDate = getDateForDay(selectedDayIndex);

    const animatedNeonStyle = (index: number) => {
      return useAnimatedStyle(() => {
        const isActive = selectedDayIndex === index;
        const color = interpolateColor(isActive ? 1 : 0, [0, 1], ['#1E1C33', '#6D5BFF']);
        return {
          backgroundColor: color,
          shadowColor: isActive ? '#6D5BFF' : '#000',
          shadowOffset: { width: 0, height: isActive ? 6 : 2 },
          shadowOpacity: isActive ? 0.5 : 0.15,
          shadowRadius: isActive ? 12 : 4,
        };
      });
    };

    const animatedIndicatorStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateX: withTiming(
              CALENDAR_OFFSET_X + selectedDayIndex * DAY_WIDTH + (DAY_WIDTH - 12) / 2,
              { duration: 300 }
            ),
          },
        ],
        shadowColor: '#6D5BFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 8,
        elevation: 8,
      };
    });

    const shakeStyle = useAnimatedStyle(() => {
      return {
        transform: [{ translateX: shakeOffset.value }],
      };
    });

    const todayButtonAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [
          { scale: todayButtonScale.value },
          { scale: 1 + 0.08 * todayPulse.value },
        ],
        opacity: interpolate(todayButtonScale.value, [0.95, 1], [0.85, 1]) * (0.7 + 0.3 * todayPulse.value),
      };
    });

    // ✅ ИСПРАВЛЕНО: все сравнения — через UTC-нормализацию
    const normalizeToUTCNoon = useCallback((dateStrOrObj: string | Date): Date => {
      if (typeof dateStrOrObj === 'string') {
        const [y, m, d] = dateStrOrObj.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      } else {
        return new Date(Date.UTC(
          dateStrOrObj.getFullYear(),
          dateStrOrObj.getMonth(),
          dateStrOrObj.getDate(),
          12, 0, 0
        ));
      }
    }, []);

    const getIntakeStatusWithTime = useCallback(
      (medication: Medication, date: Date) => {
        const medIdToMatch = medication.server_id ?? medication.id;

        // 🔧 Сравниваем по UTC дате (YYYY-MM-DD)
        const targetUTCDate = new Date(Date.UTC(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        )).toISOString().slice(0, 10);

        const dayIntakes = intakes.filter((intake) => {
          if (intake.medication_id !== medIdToMatch) return false;
          const intakeUTCDate = intake.scheduled_time.slice(0, 10);
          return intakeUTCDate === targetUTCDate;
        });

        if (dayIntakes.length === 0) {
          return { status: 'Не принято', time: null, color: '#FF3B30', icon: 'clock-outline' };
        }

        const latestIntake = dayIntakes.reduce((a, b) =>
          a.scheduled_time > b.scheduled_time ? a : b
        );

        let time: string | null = null;
        if (latestIntake.taken_time) {
          try {
            const takenDate = new Date(latestIntake.taken_time);
            if (!isNaN(takenDate.getTime())) {
              time = takenDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
          } catch (e) {
            logWarning('Не удалось распарсить taken_time', latestIntake.taken_time);
          }
        }

        switch (latestIntake.status) {
          case 'taken':
            return { status: 'Принято', time, color: '#5ECC7B', icon: 'check-circle' };
          case 'skipped':
            return { 
              status: 'Пропущено', 
              time, 
              color: '#FF9500', 
              icon: 'close-circle',
              skipped: true,
              medication_id: medIdToMatch,
            };
          default:
            return { status: 'Неизвестно', time, color: '#999', icon: 'help-circle-outline' };
        }
      },
      [intakes]
    );

    const isMedForSelectedDay = useCallback(
      (med: Medication, dayIndex: number): boolean => {
        const targetDate = getDateForDay(dayIndex);

        const startDateUTC = normalizeToUTCNoon(med.start_date);
        const targetDateUTC = normalizeToUTCNoon(targetDate);
        const endDateUTC = med.end_date ? normalizeToUTCNoon(med.end_date) : null;

        if (targetDateUTC < startDateUTC) return false;
        if (endDateUTC && targetDateUTC > endDateUTC) return false;

        if (med.schedule_type === 'daily') return true;

        if (med.schedule_type === 'weekly_days' && Array.isArray(med.week_days)) {
          const dayNumber = dayIndex + 1; // ПН = 1
          return med.week_days.includes(dayNumber);
        }

        if (med.schedule_type === 'every_x_days' && typeof med.interval_days === 'number') {
          const diffMs = targetDateUTC.getTime() - startDateUTC.getTime();
          const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
          return diffDays >= 0 && diffDays % med.interval_days === 0;
        }

        return false;
      },
      [getDateForDay, normalizeToUTCNoon]
    );

    const filteredMeds = useMemo(() => {
      const timeToSeconds = (timeStr: string): number => {
        const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
        if (!match) return 0;
        let h = parseInt(match[1], 10);
        const m = parseInt(match[2], 10);
        if (h === 24 && m === 0) return 24 * 3600;
        if (h >= 24) h = 23;
        return h * 3600 + m * 60;
      };

      const getEarliestTimeSeconds = (med: Medication): number => {
        if (!Array.isArray(med.times_per_day) || med.times_per_day.length === 0) return 0;
        try {
          return Math.min(...med.times_per_day.map(timeToSeconds));
        } catch (e) {
          logWarning('Ошибка парсинга times_per_day', med.times_per_day);
          return 0;
        }
      };

      return medications
        .filter((m) => isMedForSelectedDay(m, selectedDayIndex))
        .sort((a, b) => getEarliestTimeSeconds(a) - getEarliestTimeSeconds(b));
    }, [medications, selectedDayIndex, isMedForSelectedDay]);

    const handleDayPress = (index: number) => {
      setSelectedDayIndex(index);
    };

    const goToTodayLocal = () => {
      onGoToToday();
      todayPulse.value = withSequence(
        withTiming(1, { duration: 100 }),
        withTiming(0, { duration: 200 }),
        withTiming(1, { duration: 300 }),
        withTiming(0, { duration: 500 })
      );
      todayButtonScale.value = withSequence(
        withTiming(0.95, { duration: 80 }),
        withTiming(1.05, { duration: 120 }),
        withTiming(1, { duration: 100 })
      );
    };

    const getFormDisplay = useCallback((form: string): { icon: string; label: string } => {
      switch (form) {
        case 'tablet': return { icon: 'pill', label: 'Таблетка' };
        case 'capsule': return { icon: 'capsule', label: 'Капсула' };
        case 'drop': return { icon: 'eyedropper-variant', label: 'Капли' };
        case 'syrup': return { icon: 'bottle-soda-classic', label: 'Сироп' };
        case 'injection': return { icon: 'needle', label: 'Инъекция' };
        case 'spray': return { icon: 'spray-bottle', label: 'Спрей' };
        case 'ointment': return { icon: 'tube', label: 'Мазь' };
        case 'patch': return { icon: 'bandage', label: 'Пластырь' };
        case 'suppository': return { icon: 'pill', label: 'Суппозиторий' };
        case 'inhaler': return { icon: 'inhaler', label: 'Ингалятор' };
        case 'powder': return { icon: 'flask', label: 'Порошок' };
        default: return { icon: 'help-circle-outline', label: '—' };
      }
    }, []);

    return (
      <View style={styles.container}>
        <Card mode="contained" style={styles.calendarBox}>
          <LinearGradient
            colors={['#1E1C33', '#151328']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.calendarGradient}
          >
            <View style={styles.calendarHeader}>
              <View style={{ width: 44 }} />
              <Text style={styles.calendarTitle}>
                {weekStart.toLocaleDateString('ru-RU', {
                  month: 'long',
                  year: 'numeric',
                })}
              </Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.daysRow}>
              {days.map((day, idx) => {
                const dayDate = getDateForDay(idx);
                const isToday = dayDate.toDateString() === new Date().toDateString();

                return (
                  <Animated.View
                    key={day}
                    style={[
                      styles.dayWrapper,
                      idx < 6 && styles.dayBorder,
                      animatedNeonStyle(idx),
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => handleDayPress(idx)}
                      activeOpacity={0.85}
                      style={[
                        styles.dayButton,
                        selectedDayIndex === idx && styles.activeDayButton,
                        isToday && styles.todayHighlight,
                      ]}
                    >
                      <View style={styles.dayTop}>
                        <Text
                          style={[
                            styles.dayAbbr,
                            selectedDayIndex === idx && styles.activeDayAbbr,
                            isToday && styles.todayAbbr,
                          ]}
                        >
                          {day}
                        </Text>
                        {isToday && (
                          <View style={styles.todayBadge}>
                            <Text style={styles.todayBadgeText}>•</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.dayNumberText,
                          selectedDayIndex === idx && styles.activeDayNumber,
                          isToday && styles.todayNumber,
                        ]}
                      >
                        {dayDate.getDate()}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </View>

            <Animated.View
              style={[
                styles.activeDayLine,
                animatedIndicatorStyle,
              ]}
            />
          </LinearGradient>
        </Card>

        <Card mode="contained" style={styles.dateHeaderCard}>
          <LinearGradient
            colors={['#1E1C33', '#151328']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dateHeaderGradient}
          >
            <View style={styles.dayHeader}>
              <Text style={styles.daySubtitle}>
                {selectedDate.toLocaleDateString('ru-RU', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              <Animated.View style={todayButtonAnimatedStyle}>
                <TouchableOpacity
                  onPress={goToTodayLocal}
                  onPressIn={() => {
                    todayButtonScale.value = withTiming(0.95, { duration: 80 });
                  }}
                  onPressOut={() => {
                    todayButtonScale.value = withTiming(1, { duration: 120 });
                  }}
                  style={styles.todayButton}
                >
                  <LinearGradient
                    colors={['#6D5BFF', '#8A7FFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.todayButtonInner}
                  >
                    <Text style={styles.todayButtonText}>Сегодня</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </LinearGradient>
        </Card>

        <View style={styles.scrollMaskContainer}>
          <FlatList
            data={filteredMeds}
            keyExtractor={(item) => `med-${item.server_id ?? item.id}`}
            contentContainerStyle={{
              paddingBottom: 8,
              paddingTop: 16,
            }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const result = getIntakeStatusWithTime(item, selectedDate);
              const { status, time, color, icon, skipped, medication_id } = result;

              const timesDisplay = item.times_per_day
                .map(t => t.match(/^(\d{1,2}:\d{2})/)?.[1] || t)
                .join(', ');

              const { icon: formIcon, label: formLabel } = getFormDisplay(item.form);

              return (
                <Animated.View entering={FadeInDown.delay(index * 50).duration(350)} style={styles.medItem}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/modals/take-medication-modal?medicationId=${medication_id || item.id}&plannedTime=${encodeURIComponent(timesDisplay)}&isPatient=true`
                      )
                    }
                    activeOpacity={0.92}
                  >
                    <View style={styles.timeStatusRow}>
                      <Text style={styles.timesText}>{timesDisplay}</Text>

                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: `${color}20`, borderColor: `${color}40` },
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.iconWrapper,
                            skipped && medication_id === shakingMedId.value
                              ? shakeStyle
                              : undefined,
                          ]}
                        >
                          <Icon source={icon} size={14} color={color} />
                        </Animated.View>
                        <Text style={[styles.statusText, { color }]}>{`${status}${time ? ` в ${time}` : ''}`}</Text>
                      </View>
                    </View>

                    <Card mode="contained" style={styles.medCard}>
                      <LinearGradient
                        colors={['#1E1C33', '#151328']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.medCardGradient}
                      >
                        <View style={styles.cardContent}>
                          <View style={styles.iconContainer}>
                            <Icon source={formIcon} size={24} color="#A090FF" />
                          </View>
                          <View style={styles.textContainer}>
                            <Text style={styles.medName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.medForm} numberOfLines={1}>
                              {formLabel}
                            </Text>
                          </View>
                        </View>
                      </LinearGradient>
                    </Card>
                  </TouchableOpacity>
                </Animated.View>
              );
            }}
            ListEmptyComponent={
              <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}>
                  <Icon source="pill" size={64} color="#6D5BFF60" />
                </View>
                <Text style={styles.emptyTitle}>Нет приёмов</Text>
                <Text style={styles.emptySubtitle}>
                  На {days[selectedDayIndex].toLowerCase()} нет запланированных лекарств.
                </Text>
              </Animated.View>
            }
            ListFooterComponent={
              patient
                ? () => (
                    <View style={styles.actionButtonContainer}>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            'Подтверждение',
                            `Отписаться от пациента "${patient?.username}"?`,
                            [
                              { text: 'Отмена', style: 'cancel' },
                              {
                                text: 'Отписаться',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await apiClient.deleteWithAuth('/friends/unsubscribe-from-patient');
                                    router.replace('/');
                                  } catch (error: any) {
                                    logError('❌ Ошибка отписки', error);
                                    Alert.alert('Ошибка', error.message);
                                  }
                                },
                              },
                            ]
                          );
                        }}
                        activeOpacity={0.85}
                        style={styles.unsubButton}
                      >
                        <LinearGradient
                          colors={['#FF3B30', '#FF5E5E']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.unsubGradient}
                        >
                          <View style={styles.unsubContent}>
                            <Icon source="account-remove-outline" size={22} color="#FFFFFF" />
                            <Text style={styles.unsubText}>Отписаться</Text>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  )
                : null
            }
            ListFooterComponentStyle={{ paddingBottom: 32 }}
            maxToRenderPerBatch={4}
            windowSize={7}
          />
        </View>
      </View>
    );
  }
);

// 🔹 Основной компонент PatientSchedule
export default function PatientSchedule() {
  const router = useRouter();
  const { colors } = useTheme();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [intakes, setIntakes] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentWeekIndex, setCurrentWeekIndex] = useState<number>(8);
  const [selectedDayPerWeek, setSelectedDayPerWeek] = useState<Record<number, number>>({});

  const flatListRef = useRef<FlatList<Date>>(null);

  useEffect(() => {
    const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    setSelectedDayPerWeek((prev) => ({ ...prev, [8]: todayIndex }));
  }, []);

  const weeks = useMemo(() => {
    const weeksArr: Date[] = [];
    const today = new Date();
    const currentDay = today.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + diffToMonday);
    thisMonday.setHours(0, 0, 0, 0);

    for (let i = -8; i <= 8; i++) {
      const weekStart = new Date(thisMonday);
      weekStart.setDate(thisMonday.getDate() + i * 7);
      weeksArr.push(weekStart);
    }
    return weeksArr;
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const patientRes = await apiClient.getWithAuth('/friends/get-patient');
      if (!patientRes.uuid || patientRes.uuid === 'null') {
        setPatient(null);
        setMedications([]);
        setIntakes([]);
        setLoading(false);
        return;
      }

      setPatient({
        uuid: patientRes.uuid,
        username: patientRes.username || 'Пациент',
      });

      const medsRes = await apiClient.getWithAuth('/medicines/get_medications_for_current_friend');
      const meds: Medication[] = Array.isArray(medsRes)
        ? medsRes.map((med) => ({
            ...med,
            id: med.id != null ? Number(med.id) : 0,
            server_id: med.server_id != null ? Number(med.server_id) : null,
          }))
        : [];
      setMedications(meds);

      const intakesRes = await apiClient.getWithAuth('/intake/get_intakes_for_current_friend');
      setIntakes(Array.isArray(intakesRes) ? intakesRes : []);
    } catch (error: any) {
      logError('❌ Ошибка загрузки данных', error);
      Alert.alert('Ошибка', error.message || 'Не удалось загрузить данные');
      setPatient(null);
      setMedications([]);
      setIntakes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const goToToday = useCallback(() => {
    const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    flatListRef.current?.scrollToIndex({
      index: 8,
      animated: true,
    });
    setCurrentWeekIndex(8);
    setSelectedDayPerWeek((prev) => ({ ...prev, [8]: todayIndex }));
  }, []);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index >= 0 && index < weeks.length && index !== currentWeekIndex) {
      setCurrentWeekIndex(index);
      setSelectedDayPerWeek((prev) => ({ ...prev, [index]: prev[index] ?? 0 }));
    }
  }, [currentWeekIndex, weeks.length]);

  if (loading) {
    return (
      <Screen header={false} style={{ backgroundColor: 'transparent', flex: 1 }}>
        <LinearGradient
          colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Animated.View entering={FadeIn.duration(500)}>
            <Icon source="pill" size={64} color="#6D5BFF80" />
          </Animated.View>
          <Text style={{ color: '#A8A2D2', marginTop: 20, fontSize: 18 }}>Загрузка...</Text>
        </View>
      </Screen>
    );
  }

  if (!patient) {
    return (
      <Screen header={false} style={{ backgroundColor: 'transparent', flex: 1 }}>
        <LinearGradient
          colors={['#0A0A0F', '#0E0D18', '#151328', '#0E0D18', '#0A0A0F']}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
          <Animated.View entering={FadeIn.duration(600)}>
            <View style={styles.emptyIconBox}>
              <Icon source="account-remove" size={64} color="#FF3B3060" />
            </View>
            <Text style={styles.emptyTitle}>Нет подключённого пациента</Text>
            <Text style={styles.emptySubtitle}>
              Перейдите в профиль, чтобы добавить пациента.
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/tabs/profile')}
              style={styles.addButton}
            >
              <LinearGradient
                colors={['#6D5BFF', '#8A7FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.addButtonInner}
              >
                <Text style={styles.addButtonText}>Перейти в профиль</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </View>
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

      <FlatList
        ref={flatListRef}
        data={weeks}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, index) => `week-${index}`}
        initialScrollIndex={8}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({ item: weekStart, index }) => (
          <View style={{ width }} key={`week-${index}`}>
            <WeekContent
              weekStart={weekStart}
              selectedDayIndex={selectedDayPerWeek[index] ?? 0}
              setSelectedDayIndex={(dayIndex) => {
                setSelectedDayPerWeek((prev) => ({ ...prev, [index]: dayIndex }));
              }}
              medications={medications}
              intakes={intakes}
              patient={patient}
              router={router}
              onGoToToday={goToToday}
            />
          </View>
        )}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        windowSize={5}
      />
    </Screen>
  );
}

// 💅 Стили — 100% как в schedule.tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
  },
  calendarBox: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3A345F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  calendarGradient: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  calendarTitle: {
    color: '#E0E0E0',
    fontSize: 18,
    fontWeight: '600',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: -1,
  },
  dayWrapper: {
    width: DAY_WIDTH,
    borderRadius: 16,
    padding: 4,
    alignItems: 'center',
  },
  dayBorder: {
    borderRightWidth: 1,
    borderRightColor: '#3A345F30',
  },
  dayButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#1E1C33',
  },
  activeDayButton: {
    backgroundColor: '#2A2742',
  },
  todayHighlight: {
    borderWidth: 2,
    borderColor: '#A090FF40',
    backgroundColor: '#2A2742',
    shadowColor: '#A090FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  dayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayAbbr: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A8A2D2',
  },
  activeDayAbbr: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  todayAbbr: {
    color: '#A090FF',
  },
  todayBadge: {
    marginLeft: 4,
  },
  todayBadgeText: {
    color: '#A090FF',
    fontSize: 18,
  },
  dayNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B5B0D1',
  },
  activeDayNumber: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  todayNumber: {
    color: '#A090FF',
    fontWeight: '700',
  },
  activeDayLine: {
    width: 32,
    height: 4,
    backgroundColor: '#5ECC7B',
    borderRadius: 2,
    position: 'absolute',
    bottom: 4,
    zIndex: 10,
  },
  dateHeaderCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3A345F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  dateHeaderGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  daySubtitle: {
    color: '#E0E0E0',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  todayButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginLeft: 12,
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  todayButtonInner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  todayButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  scrollMaskContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F0D1D',
    borderColor: '#222',
    borderWidth: 1,
  },
  medItem: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  timeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  timesText: {
    color: '#A8A2D2',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 4,
  },
  iconWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  medCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A345F',
  },
  medCardGradient: {
    padding: 16,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6D5BFF15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: {
    flex: 1,
  },
  medName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  medForm: {
    color: '#A8A2D2',
    fontSize: 13,
  },
  emptyContainer: {
    marginTop: 80,
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconBox: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 32,
    backgroundColor: '#6D5BFF10',
  },
  emptyTitle: {
    color: '#E0E0E0',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#A8A2D2',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 12,
    opacity: 0.9,
  },
  actionButtonContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  unsubButton: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  unsubGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  unsubContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  unsubText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  addButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  addButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});