/**
 * Expenses Screen — Fluid Multi-Device Responsive with Period Filters (This Month, Last Month, Weekly, Custom Month Browser)
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FAB, Modal, Portal, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useExpenses, Expense } from '../../hooks/useExpenses';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useAuth } from '../../contexts/AuthContext';
import { exportToPdf } from '../../services/export-pdf';
import { exportToExcel } from '../../services/export-excel';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { DatePickerInput } from '../../components/DatePickerInput';
import {
  getTodayDDMMYYYY,
  formatToISO,
  formatToDDMMYYYY,
  formatDisplayDate,
  getWeekRange,
  getMonthRange,
  getCurrentMonthRange,
  getLastMonthRange,
  getDaysDifference,
} from '../../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';

interface CategoryItem {
  id: number;
  name: string;
  icon: string;
  color: string;
}

type PeriodType = 'this_month' | 'last_month' | 'this_week' | 'last_week' | 'month_browser' | 'custom_range' | 'all';

export default function ExpensesScreen() {
  const { expenses, fetchExpenses, addExpense, deleteExpense } = useExpenses();
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const { isWide } = useResponsiveLayout();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Period Filtering States
  const now = new Date();
  const [periodType, setPeriodType] = useState<PeriodType>('this_month');
  const [browseYear, setBrowseYear] = useState<number>(now.getFullYear());
  const [browseMonth, setBrowseMonth] = useState<number>(now.getMonth()); // 0-11

  // Custom Date Range states (From Date to To Date calculation)
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const cur = new Date();
    const firstDay = new Date(cur.getFullYear(), cur.getMonth(), 1);
    return formatToDDMMYYYY(firstDay);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(getTodayDDMMYYYY());

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [expenseDate, setExpenseDate] = useState(getTodayDDMMYYYY());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Compute active date range based on periodType
  const activeDateRange = useMemo((): { start?: string; end?: string; label: string; sublabel?: string } => {
    if (periodType === 'all') {
      return { label: t('exp_all_time'), sublabel: 'Complete transaction history' };
    }
    if (periodType === 'this_week') {
      const range = getWeekRange(0);
      return { start: range.start, end: range.end, label: t('exp_this_week'), sublabel: `${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)}` };
    }
    if (periodType === 'last_week') {
      const range = getWeekRange(-1);
      return { start: range.start, end: range.end, label: t('exp_last_week'), sublabel: `${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)}` };
    }
    if (periodType === 'this_month') {
      const range = getCurrentMonthRange();
      return { start: range.start, end: range.end, label: t('exp_this_month'), sublabel: range.label };
    }
    if (periodType === 'last_month') {
      const range = getLastMonthRange();
      return { start: range.start, end: range.end, label: t('exp_last_month'), sublabel: range.label };
    }
    if (periodType === 'custom_range') {
      const startIso = formatToISO(customStartDate) || new Date().toISOString().split('T')[0];
      const endIso = formatToISO(customEndDate) || new Date().toISOString().split('T')[0];
      const realStart = startIso <= endIso ? startIso : endIso;
      const realEnd = startIso <= endIso ? endIso : startIso;
      const days = getDaysDifference(realStart, realEnd);
      return {
        start: realStart,
        end: realEnd,
        label: `${formatDisplayDate(realStart)} — ${formatDisplayDate(realEnd)}`,
        sublabel: `${days} ${t('exp_days_count')}`,
      };
    }
    // month_browser
    const range = getMonthRange(browseYear, browseMonth);
    return { start: range.start, end: range.end, label: range.label, sublabel: `${formatDisplayDate(range.start)} - ${formatDisplayDate(range.end)}` };
  }, [periodType, browseYear, browseMonth, customStartDate, customEndDate, t]);

  const loadCategories = useCallback(async () => {
    if (!db || !user) return;
    try {
      const cats = await db.getAllAsync<CategoryItem>(
        'SELECT id, name, icon, color FROM categories WHERE user_id = ? ORDER BY name ASC',
        [user.uid]
      );
      setCategories(cats || []);
      if (cats && cats.length > 0) {
        setSelectedCategory((prev) => {
          if (!prev) return cats[0];
          const stillExists = cats.find((c) => c.id === prev.id);
          return stillExists || cats[0];
        });
      }
    } catch (e) {
      console.error('Failed to load categories', e);
    }
  }, [db, user]);

  const doFetchExpenses = useCallback(
    (spinner = false) => {
      fetchExpenses(
        {
          startDate: activeDateRange.start,
          endDate: activeDateRange.end,
          categoryId: filterCategory,
          searchText,
        },
        spinner
      );
    },
    [fetchExpenses, activeDateRange, filterCategory, searchText]
  );

  // Re-fetch on focus and when filters change
  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadCategories();
        doFetchExpenses(false);
      }
    }, [isReady, loadCategories, doFetchExpenses])
  );

  useEffect(() => {
    if (isReady) {
      doFetchExpenses(false);
    }
  }, [isReady, doFetchExpenses]);

  // Navigate to previous month
  const handlePrevMonth = () => {
    let newM = browseMonth - 1;
    let newY = browseYear;
    if (newM < 0) {
      newM = 11;
      newY -= 1;
    }
    setBrowseMonth(newM);
    setBrowseYear(newY);
    setPeriodType('month_browser');
  };

  // Navigate to next month
  const handleNextMonth = () => {
    let newM = browseMonth + 1;
    let newY = browseYear;
    if (newM > 11) {
      newM = 0;
      newY += 1;
    }
    setBrowseMonth(newM);
    setBrowseYear(newY);
    setPeriodType('month_browser');
  };

  const handleResetToCurrentMonth = () => {
    const cur = new Date();
    setBrowseYear(cur.getFullYear());
    setBrowseMonth(cur.getMonth());
    setPeriodType('this_month');
  };

  const openAddModal = async () => {
    await loadCategories();
    setAmount('');
    setNote('');
    setExpenseDate(getTodayDDMMYYYY());
    setShowAddModal(true);
  };

  const handleSave = async () => {
    const activeCat = selectedCategory || (categories.length > 0 ? categories[0] : null);
    if (!activeCat) {
      showMessage('Missing Category', 'Please select a category', 'error');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showMessage('Invalid Amount', 'Please enter a valid expense amount', 'error');
      return;
    }

    setSaving(true);
    try {
      const isoDate = formatToISO(expenseDate) || new Date().toISOString().split('T')[0];
      await addExpense(activeCat.id, amountNum, isoDate, note);
      setShowAddModal(false);
      showMessage('Expense Recorded', `Added ₹${amountNum.toLocaleString('en-IN')} under ${activeCat.name}`, 'success');
      doFetchExpenses(false);
    } catch (error: any) {
      showMessage('Error', error?.message || 'Failed to save expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    confirmAction('Delete Expense', 'Are you sure you want to remove this expense from your records?', async () => {
      await deleteExpense(id);
      showMessage('Expense Deleted', 'Removed from ledger', 'info');
      doFetchExpenses(false);
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    doFetchExpenses(true);
    await loadCategories();
    setRefreshing(false);
  };

  const handleExportPdf = async () => {
    try {
      showMessage('Exporting PDF', 'Generating period statement...', 'info');
      const statementTitle = `Expense Statement — ${activeDateRange.label}${activeDateRange.sublabel ? ` (${activeDateRange.sublabel})` : ''}`;
      await exportToPdf(expenses, statementTitle, activeDateRange.start && activeDateRange.end ? { start: activeDateRange.start, end: activeDateRange.end } : undefined);
      showMessage('PDF Downloaded', 'Financial report saved successfully', 'success');
    } catch (error) {
      showMessage('Export Error', 'Failed to generate PDF statement', 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportToExcel(expenses);
      showMessage('Excel Exported', 'CSV report saved', 'success');
    } catch (error) {
      showMessage('Export Error', 'Failed to export CSV', 'error');
    }
  };

  const filteredTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const isBrowsingHistory = periodType === 'month_browser' || periodType === 'last_month' || periodType === 'last_week';

  const renderExpenseItem = (item: Expense) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.expenseCard, isWide && styles.expenseCardDesktop]}
      onPress={() => router.push(`/expense/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.categoryIconWrap, { backgroundColor: (item.category_color || Colors.primary) + '15' }]}>
        <MaterialCommunityIcons
          name={(item.category_icon as any) || 'cash'}
          size={22}
          color={item.category_color || Colors.primary}
        />
      </View>
      <View style={styles.expenseDetails}>
        <Text style={styles.expenseCategory}>{item.category_name || 'Uncategorized'}</Text>
        <Text style={styles.expenseDate}>{formatDisplayDate(item.date)}</Text>
        {item.note && <Text style={styles.expenseNote} numberOfLines={1}>{item.note}</Text>}
      </View>
      <View style={styles.amountWrap}>
        <Text style={styles.expenseAmount}>-₹{item.amount.toLocaleString('en-IN')}</Text>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            handleDelete(item.id);
          }}
          style={styles.deleteBtn}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Top Search & Filter Bar */}
      <View style={styles.topBar}>
        <View style={styles.searchRow}>
          <TextInput
            placeholder={t('exp_search_placeholder')}
            value={searchText}
            onChangeText={(text) => setSearchText(text)}
            mode="outlined"
            dense
            style={styles.searchInput}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            textColor={Colors.text}
            left={<TextInput.Icon icon="magnify" color={Colors.textSecondary} />}
            right={
              searchText ? (
                <TextInput.Icon
                  icon="close-circle"
                  color={Colors.textSecondary}
                  onPress={() => setSearchText('')}
                />
              ) : undefined
            }
            theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
          />
          <TouchableOpacity
            style={styles.exportIconBtn}
            onPress={handleExportPdf}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={20} color="#FFFFFF" />
            <Text style={styles.exportBtnLabel}>{t('exp_pdf')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportIconBtnOutlined}
            onPress={handleExportExcel}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="file-excel" size={18} color={Colors.text} />
            <Text style={styles.exportBtnLabelOutlined}>{t('exp_csv')}</Text>
          </TouchableOpacity>
        </View>

        {/* TIME PERIOD SELECTOR (This Month, Last Month, Weekly, Custom Dates, Custom Month Browser, All) */}
        <View style={styles.periodSelectorWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodScroll}>
            <TouchableOpacity
              style={[styles.periodChip, periodType === 'custom_range' && styles.periodChipActive]}
              onPress={() => setPeriodType('custom_range')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="calendar-range"
                size={15}
                color={periodType === 'custom_range' ? '#FFFFFF' : Colors.primary}
              />
              <Text style={[styles.periodChipText, periodType === 'custom_range' && styles.periodChipTextActive]}>
                {t('exp_custom_range')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'this_month' && styles.periodChipActive]}
              onPress={() => {
                setPeriodType('this_month');
                const cur = new Date();
                setBrowseYear(cur.getFullYear());
                setBrowseMonth(cur.getMonth());
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="calendar-month"
                size={15}
                color={periodType === 'this_month' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'this_month' && styles.periodChipTextActive]}>
                {t('exp_this_month')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'last_month' && styles.periodChipActive]}
              onPress={() => {
                setPeriodType('last_month');
                const cur = new Date();
                let prevM = cur.getMonth() - 1;
                let prevY = cur.getFullYear();
                if (prevM < 0) {
                  prevM = 11;
                  prevY -= 1;
                }
                setBrowseYear(prevY);
                setBrowseMonth(prevM);
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="history"
                size={15}
                color={periodType === 'last_month' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'last_month' && styles.periodChipTextActive]}>
                {t('exp_last_month')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'this_week' && styles.periodChipActive]}
              onPress={() => setPeriodType('this_week')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="calendar-week"
                size={15}
                color={periodType === 'this_week' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'this_week' && styles.periodChipTextActive]}>
                {t('exp_this_week')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'last_week' && styles.periodChipActive]}
              onPress={() => setPeriodType('last_week')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="clock-time-four-outline"
                size={15}
                color={periodType === 'last_week' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'last_week' && styles.periodChipTextActive]}>
                {t('exp_last_week')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'month_browser' && styles.periodChipActive]}
              onPress={() => setPeriodType('month_browser')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="calendar-search"
                size={15}
                color={periodType === 'month_browser' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'month_browser' && styles.periodChipTextActive]}>
                {t('exp_browse_months')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodChip, periodType === 'all' && styles.periodChipActive]}
              onPress={() => setPeriodType('all')}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="all-inclusive"
                size={15}
                color={periodType === 'all' ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text style={[styles.periodChipText, periodType === 'all' && styles.periodChipTextActive]}>
                {t('exp_all_time')}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* INTERACTIVE CUSTOM DATE RANGE CALCULATOR (From Date to To Date) */}
        {periodType === 'custom_range' && (
          <View style={styles.customRangeContainer}>
            <View style={styles.rangeHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="calculator" size={18} color={Colors.primary} />
                <Text style={styles.rangeHeaderTitle}>{t('exp_calculation_title')}</Text>
              </View>
              <Text style={styles.rangeDaysBadge}>
                {getDaysDifference(customStartDate, customEndDate)} {t('exp_days_count')}
              </Text>
            </View>

            {/* Quick Presets Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsRow}>
              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  const now = new Date();
                  const past = new Date(now);
                  past.setDate(now.getDate() - 6);
                  setCustomStartDate(formatToDDMMYYYY(past));
                  setCustomEndDate(getTodayDDMMYYYY());
                }}
              >
                <Text style={styles.presetChipText}>Last 7 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  const now = new Date();
                  const past = new Date(now);
                  past.setDate(now.getDate() - 14);
                  setCustomStartDate(formatToDDMMYYYY(past));
                  setCustomEndDate(getTodayDDMMYYYY());
                }}
              >
                <Text style={styles.presetChipText}>Last 15 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  const now = new Date();
                  const past = new Date(now);
                  past.setDate(now.getDate() - 29);
                  setCustomStartDate(formatToDDMMYYYY(past));
                  setCustomEndDate(getTodayDDMMYYYY());
                }}
              >
                <Text style={styles.presetChipText}>Last 30 Days</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  const cur = getCurrentMonthRange();
                  setCustomStartDate(formatToDDMMYYYY(cur.start));
                  setCustomEndDate(getTodayDDMMYYYY());
                }}
              >
                <Text style={styles.presetChipText}>This Month</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetChip}
                onPress={() => {
                  const last = getLastMonthRange();
                  setCustomStartDate(formatToDDMMYYYY(last.start));
                  setCustomEndDate(formatToDDMMYYYY(last.end));
                }}
              >
                <Text style={styles.presetChipText}>Last Month</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Date Pickers: From Date & To Date */}
            <View style={[styles.datePickersRow, isWide && styles.datePickersRowDesktop]}>
              <View style={{ flex: 1 }}>
                <DatePickerInput
                  label={t('exp_from_date')}
                  value={customStartDate}
                  onChangeDate={(ddmm) => setCustomStartDate(ddmm)}
                />
              </View>
              <View style={{ justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                <MaterialCommunityIcons name="arrow-right-bold" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <DatePickerInput
                  label={t('exp_to_date')}
                  value={customEndDate}
                  onChangeDate={(ddmm) => setCustomEndDate(ddmm)}
                />
              </View>
            </View>

            {/* Calculation Insights Stat Cards */}
            <View style={styles.calcInsightRow}>
              <View style={styles.calcInsightCard}>
                <Text style={styles.calcInsightLabel}>{t('exp_total')}</Text>
                <Text style={styles.calcInsightValue}>₹{filteredTotal.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.calcInsightCard}>
                <Text style={styles.calcInsightLabel}>{t('exp_daily_avg')}</Text>
                <Text style={styles.calcInsightValue}>
                  ₹{Math.round(filteredTotal / Math.max(1, getDaysDifference(customStartDate, customEndDate))).toLocaleString('en-IN')}
                  <Text style={styles.calcInsightUnit}>/day</Text>
                </Text>
              </View>
              <View style={styles.calcInsightCard}>
                <Text style={styles.calcInsightLabel}>{t('exp_transactions')}</Text>
                <Text style={styles.calcInsightValue}>{expenses.length}</Text>
              </View>
            </View>
          </View>
        )}

        {/* INTERACTIVE MONTH NAVIGATOR (Available when browsing months or viewing previous periods) */}
        {(periodType === 'month_browser' || isBrowsingHistory) && (
          <View style={styles.monthNavigator}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={Colors.primary} />
              <Text style={styles.monthNavBtnText}>{t('exp_prev_month')}</Text>
            </TouchableOpacity>

            <View style={styles.monthNavCenter}>
              <Text style={styles.monthNavTitle}>
                {new Date(browseYear, browseMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </Text>
              {isBrowsingHistory && (
                <TouchableOpacity onPress={handleResetToCurrentMonth} style={styles.resetToCurrentBtn}>
                  <Text style={styles.resetToCurrentText}>{t('exp_back_to_current')}</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
              <Text style={styles.monthNavBtnText}>{t('exp_next_month')}</Text>
              <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Category Filters Horizontal Scroll */}
        <View style={styles.categoryFilterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            <TouchableOpacity
              style={[
                styles.customFilterChip,
                filterCategory === undefined && styles.customFilterChipActive,
              ]}
              onPress={() => setFilterCategory(undefined)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={15}
                color={filterCategory === undefined ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  filterCategory === undefined && styles.filterChipTextActive,
                ]}
              >
                {t('exp_all_categories')}
              </Text>
            </TouchableOpacity>

            {categories.map((cat) => {
              const isActive = filterCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.customFilterChip,
                    isActive && styles.customFilterChipActive,
                  ]}
                  onPress={() => setFilterCategory(isActive ? undefined : cat.id)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={(cat.icon as any) || 'cash'}
                    size={15}
                    color={isActive ? '#FFFFFF' : cat.color || Colors.primary}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Summary Counter & Total Filtered Amount with active period label */}
        <View style={styles.summaryBar}>
          <View>
            <Text style={styles.periodActiveLabel}>
              📅 {activeDateRange.label}
              {activeDateRange.sublabel && activeDateRange.sublabel !== activeDateRange.label ? ` (${activeDateRange.sublabel})` : ''}
            </Text>
            <Text style={styles.summaryCount}>
              {expenses.length} {expenses.length === 1 ? t('exp_transaction') : t('exp_transactions')}
              {filterCategory !== undefined && (
                <Text style={{ fontWeight: '700', color: Colors.primary }}>
                  {' '}• {categories.find((c) => c.id === filterCategory)?.name || 'Filtered'}
                </Text>
              )}
            </Text>
          </View>
          <View style={styles.summaryAmountBadge}>
            <Text style={styles.summaryTotalLabel}>{t('exp_total')}:</Text>
            <Text style={styles.summaryTotalValue}>₹{filteredTotal.toLocaleString('en-IN')}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {expenses.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="receipt" size={54} color={Colors.textMuted} />
            <Text style={styles.emptyText}>{t('exp_no_expenses')}</Text>
            <Text style={styles.emptySubtext}>
              {periodType === 'this_month' || periodType === 'this_week'
                ? t('exp_no_expenses_sub')
                : t('exp_no_expenses_browse_sub')}
            </Text>
            {isBrowsingHistory && (
              <Button
                mode="contained"
                onPress={handleResetToCurrentMonth}
                buttonColor={Colors.primary}
                style={{ marginTop: Spacing.md }}
              >
                {t('exp_back_to_current')}
              </Button>
            )}
          </View>
        ) : (
          <View style={isWide ? styles.gridDesktop : undefined}>
            {expenses.map(renderExpenseItem)}
          </View>
        )}
      </ScrollView>

      <FAB icon="plus" style={styles.fab} onPress={openAddModal} color="#FFFFFF" customSize={56} />

      {/* Add Expense Modal */}
      <Portal>
        <Modal visible={showAddModal} onDismiss={() => setShowAddModal(false)} contentContainerStyle={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{t('exp_record_title')}</Text>

              <TextInput
                label={t('exp_amount_label')}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                mode="outlined"
                placeholder="0.00"
                left={<TextInput.Affix text="₹ " />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              <Text style={styles.sectionSubtitle}>{t('exp_category_select')}</Text>
              <View style={{ marginBottom: Spacing.md }}>
                <View style={styles.categoryGrid}>
                  {categories.map((cat) => {
                    const isSelected = selectedCategory?.id === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.catOption, isSelected && styles.catOptionSelected]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <MaterialCommunityIcons
                          name={(cat.icon as any) || 'cash'}
                          size={18}
                          color={isSelected ? '#FFFFFF' : cat.color || Colors.primary}
                        />
                        <Text style={[styles.catOptionText, isSelected && styles.catOptionTextSelected]} numberOfLines={1}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <DatePickerInput
                label={t('exp_date_label')}
                value={expenseDate}
                onChangeDate={(ddmm) => setExpenseDate(ddmm)}
                style={styles.modalInput}
              />

              <TextInput
                label={t('exp_note_label')}
                value={note}
                onChangeText={setNote}
                mode="outlined"
                placeholder={t('exp_note_placeholder')}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setShowAddModal(false)} textColor={Colors.textSecondary} style={styles.modalBtn}>
                  {t('exp_cancel')}
                </Button>
                <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} buttonColor={Colors.primary} style={styles.modalBtn}>
                  {t('exp_save')}
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.xs,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.background,
    height: 40,
  },
  exportIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    height: 40,
    justifyContent: 'center',
    ...Shadows.small,
  },
  exportBtnLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  exportIconBtnOutlined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    height: 40,
    justifyContent: 'center',
  },
  exportBtnLabelOutlined: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  periodSelectorWrap: {
    paddingVertical: 3,
  },
  periodScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: Spacing.lg,
  },
  periodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  periodChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  periodChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  monthNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  customRangeContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: Spacing.sm,
    marginTop: 4,
    ...Shadows.small,
  },
  rangeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rangeHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  rangeDaysBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '25',
  },
  presetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  datePickersRow: {
    flexDirection: 'column',
    gap: Spacing.xs,
  },
  datePickersRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  calcInsightRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: 2,
  },
  calcInsightCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  calcInsightLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  calcInsightValue: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
  },
  calcInsightUnit: {
    fontSize: 9.5,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  monthNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  monthNavBtnText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  monthNavCenter: {
    alignItems: 'center',
  },
  monthNavTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  resetToCurrentBtn: {
    marginTop: 1,
  },
  resetToCurrentText: {
    fontSize: 10.5,
    color: Colors.secondary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  categoryFilterContainer: {
    paddingVertical: 3,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: Spacing.lg,
  },
  customFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customFilterChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
    ...Shadows.small,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 2,
  },
  periodActiveLabel: {
    fontSize: 11.5,
    color: Colors.text,
    fontWeight: '700',
  },
  summaryCount: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  summaryAmountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  summaryTotalLabel: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },
  summaryTotalValue: {
    fontSize: 13.5,
    color: Colors.primary,
    fontWeight: '800',
  },
  listContent: { padding: Spacing.lg, paddingBottom: 100 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  expenseCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  expenseCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  categoryIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  expenseDetails: { flex: 1 },
  expenseCategory: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text },
  expenseDate: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  expenseNote: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginTop: 2 },
  amountWrap: { alignItems: 'flex-end' },
  expenseAmount: { fontSize: Fonts.sizes.md, fontWeight: '800', color: Colors.text },
  deleteBtn: { padding: 4, marginTop: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 50, gap: Spacing.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg },
  emptyText: { fontSize: Fonts.sizes.md, color: Colors.text, fontWeight: '700', textAlign: 'center' },
  emptySubtext: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, textAlign: 'center', maxWidth: 300 },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, backgroundColor: Colors.primary, borderRadius: 28, ...Shadows.large },
  modal: { backgroundColor: Colors.surface, margin: Spacing.md, maxWidth: 540, maxHeight: '85%', alignSelf: 'center', width: '92%', borderRadius: BorderRadius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.md },
  modalInput: { backgroundColor: Colors.surface, marginBottom: Spacing.md },
  sectionSubtitle: { fontSize: Fonts.sizes.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.xs, textTransform: 'uppercase' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  catOptionSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catOptionText: { fontSize: Fonts.sizes.xs, color: Colors.text, fontWeight: '600' },
  catOptionTextSelected: { color: '#FFFFFF' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md },
  modalBtn: { borderRadius: BorderRadius.md },
});
