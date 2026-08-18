/**
 * Hybrid DatePickerInput Component
 * Supports BOTH:
 * 1. Manual keyboard input in Indian Standard DD/MM/YYYY format with smart auto-masking.
 * 2. Visual interactive Calendar Modal with month navigation and quick presets.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { TextInput, Modal, Portal, Button, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  formatToDDMMYYYY,
  formatToISO,
  isValidDDMMYYYY,
  applyDateMask,
  getTodayDDMMYYYY,
} from '../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

interface DatePickerInputProps {
  label: string;
  value: string; // Accepts either DD/MM/YYYY or YYYY-MM-DD
  onChangeDate: (ddmmyyyy: string, iso: string) => void;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  style?: any;
  disabled?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function DatePickerInput({
  label,
  value,
  onChangeDate,
  placeholder = 'DD/MM/YYYY',
  error = false,
  helperText,
  style,
  disabled = false,
}: DatePickerInputProps) {
  // Always display formatted as DD/MM/YYYY to the user
  const [textValue, setTextValue] = useState<string>(formatToDDMMYYYY(value) || getTodayDDMMYYYY());
  const [showCalendar, setShowCalendar] = useState(false);

  // Calendar navigator state
  const [viewYear, setViewYear] = useState<number>(() => {
    const iso = formatToISO(value) || formatToISO(new Date());
    return parseInt(iso.split('-')[0], 10) || new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const iso = formatToISO(value) || formatToISO(new Date());
    return (parseInt(iso.split('-')[1], 10) || (new Date().getMonth() + 1)) - 1;
  });
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const iso = formatToISO(value) || formatToISO(new Date());
    return parseInt(iso.split('-')[2], 10) || new Date().getDate();
  });

  // Keep internal text state synchronized with incoming prop changes
  useEffect(() => {
    if (value) {
      const formatted = formatToDDMMYYYY(value);
      setTextValue(formatted);

      const iso = formatToISO(value);
      if (iso) {
        const parts = iso.split('-');
        if (parts.length === 3) {
          setViewYear(parseInt(parts[0], 10));
          setViewMonth(parseInt(parts[1], 10) - 1);
          setSelectedDay(parseInt(parts[2], 10));
        }
      }
    }
  }, [value]);

  /**
   * Handle manual typing in text field with smart auto-masking
   */
  const handleManualChange = (raw: string) => {
    // Apply automatic DD/MM/YYYY mask
    const masked = applyDateMask(raw);
    setTextValue(masked);

    if (masked.length === 10) {
      if (isValidDDMMYYYY(masked)) {
        const iso = formatToISO(masked);
        onChangeDate(masked, iso);

        const parts = iso.split('-');
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10) - 1);
        setSelectedDay(parseInt(parts[2], 10));
      }
    } else {
      // In-progress typing
      const partialISO = formatToISO(masked);
      onChangeDate(masked, partialISO);
    }
  };

  /**
   * Open the Calendar Modal
   */
  const openCalendar = () => {
    if (disabled) return;
    const iso = formatToISO(textValue) || formatToISO(new Date());
    if (iso) {
      const parts = iso.split('-');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0], 10));
        setViewMonth(parseInt(parts[1], 10) - 1);
        setSelectedDay(parseInt(parts[2], 10));
      }
    }
    setShowCalendar(true);
  };

  /**
   * Month Navigation
   */
  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  /**
   * Select a date from calendar grid
   */
  const handleSelectCalendarDay = (day: number) => {
    setSelectedDay(day);
    const dd = String(day).padStart(2, '0');
    const mm = String(viewMonth + 1).padStart(2, '0');
    const yyyy = viewYear;

    const formattedDDMM = `${dd}/${mm}/${yyyy}`;
    const iso = `${yyyy}-${mm}-${dd}`;

    setTextValue(formattedDDMM);
    onChangeDate(formattedDDMM, iso);
    setShowCalendar(false);
  };

  /**
   * Quick Preset Selectors
   */
  const applyPreset = (daysOffset: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysOffset);

    const formatted = formatToDDMMYYYY(target);
    const iso = formatToISO(target);

    setTextValue(formatted);
    onChangeDate(formatted, iso);
    setShowCalendar(false);
  };

  const applyEndOfMonth = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const formatted = formatToDDMMYYYY(lastDay);
    const iso = formatToISO(lastDay);

    setTextValue(formatted);
    onChangeDate(formatted, iso);
    setShowCalendar(false);
  };

  // Generate calendar grid for viewMonth & viewYear
  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const calendarDays: Array<number | null> = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  const today = new Date();
  const isCurrentMonthToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const todayDay = today.getDate();

  const isInvalid = textValue.length === 10 && !isValidDDMMYYYY(textValue);

  return (
    <View style={[styles.wrapper, style]}>
      <TextInput
        label={label}
        value={textValue}
        onChangeText={handleManualChange}
        mode="outlined"
        placeholder={placeholder}
        keyboardType="number-pad"
        maxLength={10}
        disabled={disabled}
        error={error || isInvalid}
        style={styles.textInput}
        outlineColor={Colors.border}
        activeOutlineColor={Colors.primary}
        textColor={Colors.text}
        theme={{
          colors: {
            background: Colors.surface,
            onSurfaceVariant: Colors.textSecondary,
          },
        }}
        right={
          <TextInput.Icon
            icon="calendar-month"
            color={Colors.primary}
            onPress={openCalendar}
            forceTextInputFocus={false}
          />
        }
      />

      {isInvalid && (
        <Text style={styles.errorHelper}>Please enter a valid date (DD/MM/YYYY)</Text>
      )}

      {helperText && !isInvalid && (
        <Text style={styles.helperText}>{helperText}</Text>
      )}

      {/* Visual Interactive Calendar Modal */}
      <Portal>
        <Modal
          visible={showCalendar}
          onDismiss={() => setShowCalendar(false)}
          contentContainerStyle={styles.calendarModal}
        >
          <View style={styles.calendarCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalHeaderSubtitle}>SELECT DATE (DD/MM/YYYY)</Text>
                <Text style={styles.modalHeaderTitle}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>
              </View>
              <View style={styles.monthNavRow}>
                <IconButton
                  icon="chevron-left"
                  size={24}
                  iconColor={Colors.text}
                  onPress={handlePrevMonth}
                />
                <IconButton
                  icon="chevron-right"
                  size={24}
                  iconColor={Colors.text}
                  onPress={handleNextMonth}
                />
              </View>
            </View>

            {/* Quick Preset Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.presetScroll}
              contentContainerStyle={styles.presetContent}
            >
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset(0)}
              >
                <Text style={styles.presetChipText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset(1)}
              >
                <Text style={styles.presetChipText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset(7)}
              >
                <Text style={styles.presetChipText}>+7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => applyPreset(30)}
              >
                <Text style={styles.presetChipText}>+30 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={applyEndOfMonth}
              >
                <Text style={styles.presetChipText}>End of Month</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Day of Week Headers */}
            <View style={styles.dayNamesRow}>
              {DAY_NAMES.map((name) => (
                <Text key={name} style={styles.dayNameText}>
                  {name}
                </Text>
              ))}
            </View>

            {/* Day Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }

                const isSelected =
                  day === selectedDay &&
                  formatToISO(textValue) ===
                    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = isCurrentMonthToday && day === todayDay;

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      styles.dayCell,
                      isToday && !isSelected && styles.dayCellToday,
                      isSelected && styles.dayCellSelected,
                    ]}
                    onPress={() => handleSelectCalendarDay(day)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        isToday && !isSelected && styles.dayCellTextToday,
                        isSelected && styles.dayCellTextSelected,
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Modal Bottom Actions */}
            <View style={styles.modalFooter}>
              <Text style={styles.currentSelectionText}>
                Selected: <Text style={{ fontWeight: '800', color: Colors.primary }}>{textValue || '-'}</Text>
              </Text>
              <Button
                mode="text"
                textColor={Colors.textSecondary}
                onPress={() => setShowCalendar(false)}
              >
                Cancel
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.surface,
  },
  errorHelper: {
    fontSize: Fonts.sizes.xs,
    color: Colors.accent,
    marginTop: 3,
    marginLeft: 4,
    fontWeight: '600',
  },
  helperText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 3,
    marginLeft: 4,
  },
  calendarModal: {
    backgroundColor: 'transparent',
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xxl,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 380,
    ...Shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalHeaderSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  modalHeaderTitle: {
    fontSize: Fonts.sizes.xl,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presetScroll: {
    marginBottom: Spacing.md,
  },
  presetContent: {
    gap: Spacing.xs,
  },
  presetChip: {
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  dayNamesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.xs,
  },
  dayNameText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  dayCell: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 20,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayCellText: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  dayCellTextToday: {
    color: Colors.primary,
    fontWeight: '800',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
  },
  currentSelectionText: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
  },
});
