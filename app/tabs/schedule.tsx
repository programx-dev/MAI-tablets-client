// app/(tabs)/schedule.tsx
import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
	ActivityIndicator,
} from 'react-native';
import { Text, Card, Icon, useTheme } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/screen';
import { useDatabase, Medication, IntakeHistory } from '@/hooks/use-database';
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

const { width } = Dimensions.get('window');
const DAY_WIDTH = (width - 48) / 7;
const CALENDAR_OFFSET_X = -2;

// 🔹 WeekContent — компонент одной недели (презентационный)
type WeekContentProps = {
  weekStart: Date;
  selectedDayIndex: number;
  setSelectedDayIndex: (index: number) => void;
  medications: Medication[];
  intakeHistory: IntakeHistory[];
  router: ReturnType<typeof useRouter>;
  onGoToToday: () => void;
};

const WeekContent: React.FC<WeekContentProps> = React.memo(
  ({ 
    weekStart, 
    selectedDayIndex, 
    setSelectedDayIndex, 
    medications, 
    intakeHistory, 
    router, 
    onGoToToday 
  }) => {
    const { colors } = useTheme();

    const todayPulse = useSharedValue(0);
    const todayButtonScale = useSharedValue(1);
    const shakingMedId = useSharedValue<number | null>(null);
    const shakeOffset = useSharedValue(0);

    const pulseStartedRef = useRef(false);

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

    // ✅ Исправлено: проверяем пропущенные ТОЛЬКО на текущую дату (selectedDate), а не глобально
    useEffect(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(weekStart);
      selectedDate.setDate(weekStart.getDate() + selectedDayIndex);
      selectedDate.setHours(0, 0, 0, 0);

      // Тряска только если выбрана СЕГОДНЯ и есть пропущенные приёмы
      if (selectedDate.toDateString() !== today.toDateString()) return;

      const newlySkipped = intakeHistory.filter(intake => {
        const intakeDate = new Date(intake.datetime);
        intakeDate.setHours(0, 0, 0, 0);
        return intake.skipped && intakeDate.toDateString() === today.toDateString();
      });

      if (newlySkipped.length > 0) {
        const medId = newlySkipped[newlySkipped.length - 1].medication_id;
        shakingMedId.value = medId;
      }
    }, [intakeHistory, weekStart, selectedDayIndex]);

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

    const normalizeLocalDate = (date: Date): Date => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

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

    const getIntakeStatusWithTime = useCallback((medicationId: number, date: Date) => {
      const targetDate = normalizeLocalDate(date);
      const dayIntakes = intakeHistory.filter(intake => {
        if (intake.medication_id !== medicationId) return false;
        const intakeDate = normalizeLocalDate(new Date(intake.datetime));
        return (
          intakeDate.getFullYear() === targetDate.getFullYear() &&
          intakeDate.getMonth() === targetDate.getMonth() &&
          intakeDate.getDate() === targetDate.getDate()
        );
      });

      if (dayIntakes.length === 0) {
        return { status: 'Не принято', time: null, color: '#FF3B30', icon: 'clock-outline' };
      }

      const latestIntake = dayIntakes.reduce((a, b) =>
        new Date(a.datetime) > new Date(b.datetime) ? a : b
      );

      const time = new Date(latestIntake.datetime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (latestIntake.taken) {
        return { status: 'Принято', time, color: '#5ECC7B', icon: 'check-circle' };
      } else if (latestIntake.skipped) {
        return { status: 'Пропущено', time, color: '#FF9500', icon: 'close-circle', skipped: true };
      } else {
        return { status: 'Неизвестно', time, color: '#999', icon: 'help-circle-outline' };
      }
    }, [intakeHistory]);

    const isMedForSelectedDay = useCallback((med: Medication, dayIndex: number): boolean => {
      const targetDate = getDateForDay(dayIndex);
      const dayLabel = days[dayIndex];

      let startDate: Date | null = null;
      if (med.start_date) {
        startDate = new Date(med.start_date);
        if (isNaN(startDate.getTime())) startDate = null;
      }
      if (!startDate) return false;

      const normalizedStartDate = normalizeLocalDate(startDate);
      const normalizedTargetDate = normalizeLocalDate(targetDate);

      if (normalizedTargetDate < normalizedStartDate) return false;

      if (med.end_date) {
        const endDate = new Date(med.end_date);
        if (!isNaN(endDate.getTime())) {
          const normalizedEndDate = normalizeLocalDate(endDate);
          if (normalizedTargetDate > normalizedEndDate) return false;
        }
      }

      if (med.schedule_type === 'daily') return true;

      if (med.schedule_type === 'weekly_days' && med.weekly_days) {
        try {
          const daysList = typeof med.weekly_days === 'string'
            ? JSON.parse(med.weekly_days)
            : med.weekly_days;
          if (Array.isArray(daysList)) {
            return daysList.includes(dayLabel);
          }
        } catch {
          return false;
        }
      }

      if (med.schedule_type === 'every_x_days' && typeof med.interval_days === 'number') {
        const diffMs = normalizedTargetDate.getTime() - normalizedStartDate.getTime();
        const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
        return diffDays >= 0 && diffDays % med.interval_days === 0;
      }

      return false;
    }, [getDateForDay]);

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
        try {
          let times: string[] = [];
          if (typeof med.times_list === 'string') {
            try {
              times = JSON.parse(med.times_list);
            } catch {
              times = med.times_list.split(',').map(t => t.trim());
            }
          } else if (Array.isArray(med.times_list)) {
            times = med.times_list;
          }
          if (times.length === 0) return 0;
          return Math.min(...times.map(timeToSeconds));
        } catch {
          return 0;
        }
      };

      return medications
        .filter(med => isMedForSelectedDay(med, selectedDayIndex))
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

    const getFormDisplay = useCallback((form: string | null): { icon: string; label: string } => {
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
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{
              paddingBottom: 8,
              paddingTop: 16,
            }}
            showsVerticalScrollIndicator={false}
            scrollIndicatorInsets={{ right: 8 }}
            bounces={true}
            overScrollMode="always"
            decelerationRate="fast"
            indicatorStyle="white"
            renderItem={({ item, index }) => {
              const result = getIntakeStatusWithTime(item.id, selectedDate);
              const { status, time, color, icon, skipped } = result;

              let timesDisplay = '—';
              try {
                if (Array.isArray(item.times_list)) {
                  timesDisplay = item.times_list.join(', ');
                } else if (typeof item.times_list === 'string') {
                  try {
                    const parsed = JSON.parse(item.times_list);
                    timesDisplay = Array.isArray(parsed) ? parsed.join(', ') : item.times_list;
                  } catch {
                    timesDisplay = item.times_list.split(',').map(t => t.trim()).join(', ');
                  }
                }
              } catch {}

              const { icon: formIcon, label: formLabel } = getFormDisplay(item.form);

              return (
                <Animated.View
                  entering={FadeInDown.delay(index * 50).duration(350)}
                  style={styles.medItem}
                >
                  <TouchableOpacity
                    onPress={() =>
                      router.push(
                        `/modals/take-medication-modal?medicationId=${item.id}&plannedTime=${encodeURIComponent(timesDisplay)}`
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
                            skipped && item.id === shakingMedId.value
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
                              {item.dosage ? `${item.dosage} ${item.unit || ''} • ` : ''}
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
              <Animated.View
                entering={FadeIn.duration(600)}
                style={styles.emptyContainer}
              >
                <View style={styles.emptyIconBox}>
                  <Icon
                    source="pill"
                    size={64}
                    color="#6D5BFF60"
                  />
                </View>
                <Text style={styles.emptyTitle}>Нет приёмов</Text>
                <Text style={styles.emptySubtitle}>
                  На {days[selectedDayIndex].toLowerCase()} нет запланированных лекарств.
                </Text>
              </Animated.View>
            }
            ListFooterComponent={() => (
              <View style={styles.addMedButtonContainer}>
                <TouchableOpacity
                  onPress={() => {
                    router.push('/modals/add');
                  }}
                  activeOpacity={0.85}
                  style={styles.addMedButton}
                >
                  <LinearGradient
                    colors={['#6D5BFF', '#8A7FFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.addMedGradient}
                  >
                    <View style={styles.addMedContent}>
                      <Icon source="plus-circle-outline" size={24} color="#FFFFFF" />
                      <Text style={styles.addMedText}>Добавить лекарство</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            ListFooterComponentStyle={{ paddingBottom: 32 }}
            maxToRenderPerBatch={4}
            windowSize={7}
          />
        </View>
      </View>
    );
  }
);

// 🔹 Основной компонент Schedule
export default function Schedule() {
  const router = useRouter();
  const { colors } = useTheme();
  const { getMedications, getIntakeHistory } = useDatabase();

  const [medications, setMedications] = useState<Medication[]>([]);
  const [intakeHistory, setIntakeHistory] = useState<IntakeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Исправлено: вместо selectedDayIndex — selectedDayPerWeek
  const [currentWeekIndex, setCurrentWeekIndex] = useState<number>(8);
  const [selectedDayPerWeek, setSelectedDayPerWeek] = useState<Record<number, number>>({});

  const flatListRef = useRef<FlatList<Date>>(null);

  // Инициализируем день для текущей недели (8) — сегодня
  useEffect(() => {
    const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    setSelectedDayPerWeek(prev => ({ ...prev, [8]: todayIndex }));
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

  const loadMeds = useCallback(async () => {
    setLoading(true);
    try {
      const meds = await getMedications();
      setMedications(meds);
    } catch (e) {
      console.error('Ошибка загрузки медикаментов:', e);
    } finally {
      setLoading(false);
    }
  }, [getMedications]);

  const loadHistory = useCallback(async () => {
    try {
      const history = await getIntakeHistory();
      setIntakeHistory(history);
    } catch (e) {
      console.error('Ошибка загрузки истории приёма:', e);
    }
  }, [getIntakeHistory]);

  useFocusEffect(
    useCallback(() => {
      loadMeds();
      loadHistory();
    }, [loadMeds, loadHistory])
  );

  const goToToday = useCallback(() => {
    const todayIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    flatListRef.current?.scrollToIndex({
      index: 8,
      animated: true,
    });
    setCurrentWeekIndex(8);
    setSelectedDayPerWeek(prev => ({ ...prev, [8]: todayIndex }));
  }, []);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index >= 0 && index < weeks.length && index !== currentWeekIndex) {
      setCurrentWeekIndex(index);
      // Сохраняем или устанавливаем день (по умолчанию — 0)
      setSelectedDayPerWeek(prev => ({
        ...prev,
        [index]: prev[index] ?? 0,
      }));
    }
  }, [currentWeekIndex, weeks.length]);

  return (
    <Screen header={false} style={{ backgroundColor: 'transparent' }}>
      {/* 🔹 Фон — ИДЕНТИЧЕН notifications.tsx */}
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
                setSelectedDayPerWeek(prev => ({ ...prev, [index]: dayIndex }));
              }}
              medications={medications}
              intakeHistory={intakeHistory}
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

// 💅 Стили (обновлены ТОЛЬКО цвета и градиенты — размеры и паддинги без изменений)
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
    borderColor: '#3A345F', // ✅ как в notifications
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
    borderRightColor: '#3A345F30', // ✅ прозрачный оттенок
  },
  dayButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#1E1C33', // ✅ темная база
  },
  activeDayButton: {
    backgroundColor: '#2A2742', // ✅ чуть светлее активности
  },
  todayHighlight: {
    borderWidth: 2,
    borderColor: '#A090FF40', // ✅ фиолетовый акцент
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
    color: '#A8A2D2', // ✅ серо-фиолетовый
  },
  activeDayAbbr: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  todayAbbr: {
    color: '#A090FF', // ✅ акцентный фиолет
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
    color: '#B5B0D1', // ✅ как в subtitle notifications
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
    backgroundColor: '#5ECC7B', // ✅ ярко-фиолет
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
    backgroundColor: '#6D5BFF15', // ✅ фон иконки — как в notifications
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
  addMedButtonContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  addMedButton: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#6D5BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  addMedGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  addMedContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  addMedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
});