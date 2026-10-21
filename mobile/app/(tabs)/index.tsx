/**
 * Dashboard Screen — Fluid Multi-Device Responsive (Mobile & Desktop Laptop)
 * Real-time Weekly, Monthly, and Past Month Expense Summaries + Khata Book Insights
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { GeofenceRadarBanner } from '../../components/GeofenceRadarBanner';
import { DatePickerInput } from '../../components/DatePickerInput';
import {
  formatDisplayDate,
  getCurrentMonthRange,
  getLastMonthRange,
  getWeekRange,
  formatToISO,
  formatToDDMMYYYY,
  getTodayDDMMYYYY,
  getDaysDifference,
} from '../../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';

interface DashboardStats {
  monthlyTotal: number;
  monthlyCount: number;
  lastMonthTotal: number;
  lastMonthCount: number;
  thisWeekTotal: number;
  thisWeekCount: number;
  todayTotal: number;
  topCategory: string;
  topCategoryAmount: number;
  recentExpenses: any[];
  khataDueTotal: number;
  activeShopsCount: number;
}

type DashboardPeriod = 'this_month' | 'last_month' | 'this_week' | 'custom_range';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { db, isReady } = useDatabase();
  const { isWide } = useResponsiveLayout();
  const { t } = useLanguage();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [activePeriod, setActivePeriod] = useState<DashboardPeriod>('this_month');

  // Custom Date Range calculation states (From Date to To Date)
  const [customStart, setCustomStart] = useState<string>(() => {
    const cur = new Date();
    const firstDay = new Date(cur.getFullYear(), cur.getMonth(), 1);
    return formatToDDMMYYYY(firstDay);
  });
  const [customEnd, setCustomEnd] = useState<string>(getTodayDDMMYYYY());
  const [customStats, setCustomStats] = useState({ total: 0, count: 0 });

  const [stats, setStats] = useState<DashboardStats>({
    monthlyTotal: 0,
    monthlyCount: 0,
    lastMonthTotal: 0,
    lastMonthCount: 0,
    thisWeekTotal: 0,
    thisWeekCount: 0,
    todayTotal: 0,
    topCategory: '-',
    topCategoryAmount: 0,
    recentExpenses: [],
    khataDueTotal: 0,
    activeShopsCount: 0,
  });

  const loadStats = useCallback(async () => {
    if (!db || !user) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thisMonth = getCurrentMonthRange();
    const lastMonth = getLastMonthRange();
    const thisWeek = getWeekRange(0);

    try {
      const [
        monthly,
        monthlyCountRes,
        lastMonthRes,
        lastMonthCountRes,
        weekRes,
        weekCountRes,
        todayResult,
        topCat,
        recent,
        shopsList,
        shopEntries,
      ] = await Promise.all([
        db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, thisMonth.start, thisMonth.end]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, thisMonth.start, thisMonth.end]
        ),
        db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, lastMonth.start, lastMonth.end]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, lastMonth.start, lastMonth.end]
        ),
        db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, thisWeek.start, thisWeek.end]
        ),
        db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
          [user.uid, thisWeek.start, thisWeek.end]
        ),
        db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?',
          [user.uid, today]
        ),
        db.getFirstAsync<{ name: string; total: number }>(
          `SELECT c.name, COALESCE(SUM(e.amount), 0) as total 
           FROM expenses e JOIN categories c ON e.category_id = c.id 
           WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? 
           GROUP BY c.id ORDER BY total DESC LIMIT 1`,
          [user.uid, thisMonth.start, thisMonth.end]
        ),
        db.getAllAsync(
          `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
           FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
           WHERE e.user_id = ? ORDER BY e.date DESC, e.created_at DESC LIMIT 6`,
          [user.uid]
        ),
        db.getAllAsync<{ id: number }>('SELECT id FROM shops WHERE user_id = ?', [user.uid]),
        db.getAllAsync<{ shop_id: number; type: string; amount: number }>(
          'SELECT shop_id, type, amount FROM shop_entries WHERE user_id = ?',
          [user.uid]
        ),
      ]);

      // Calculate total pending udhaar to shops
      let khataDueTotal = 0;
      let activeShopsCount = 0;
      if (shopsList && shopsList.length > 0) {
        const shopTotals: Record<number, { purchases: number; payments: number }> = {};
        (shopEntries || []).forEach((e) => {
          if (!shopTotals[e.shop_id]) shopTotals[e.shop_id] = { purchases: 0, payments: 0 };
          if (e.type === 'purchase') shopTotals[e.shop_id].purchases += Number(e.amount) || 0;
          else shopTotals[e.shop_id].payments += Number(e.amount) || 0;
        });

        shopsList.forEach((s) => {
          const t = shopTotals[s.id] || { purchases: 0, payments: 0 };
          const due = t.purchases - t.payments;
          if (due > 0) {
            khataDueTotal += due;
            activeShopsCount++;
          }
        });
      }

      setStats({
        monthlyTotal: monthly?.total || 0,
        monthlyCount: monthlyCountRes?.count || 0,
        lastMonthTotal: lastMonthRes?.total || 0,
        lastMonthCount: lastMonthCountRes?.count || 0,
        thisWeekTotal: weekRes?.total || 0,
        thisWeekCount: weekCountRes?.count || 0,
        todayTotal: todayResult?.total || 0,
        topCategory: topCat?.name || '-',
        topCategoryAmount: topCat?.total || 0,
        recentExpenses: recent || [],
        khataDueTotal,
        activeShopsCount,
      });
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    }
  }, [db, user]);

  const loadCustomStats = useCallback(async () => {
    if (!db || !user) return;
    try {
      const sIso = formatToISO(customStart) || new Date().toISOString().split('T')[0];
      const eIso = formatToISO(customEnd) || new Date().toISOString().split('T')[0];
      const realStart = sIso <= eIso ? sIso : eIso;
      const realEnd = sIso <= eIso ? eIso : sIso;
      const res = await db.getFirstAsync<{ total: number; count: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
        [user.uid, realStart, realEnd]
      );
      setCustomStats({ total: res?.total || 0, count: res?.count || 0 });
    } catch (error) {
      console.error('Failed to load custom date range stats:', error);
    }
  }, [db, user, customStart, customEnd]);

  useEffect(() => {
    if (activePeriod === 'custom_range') {
      loadCustomStats();
    }
  }, [activePeriod, loadCustomStats]);

  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadStats();
        if (activePeriod === 'custom_range') {
          loadCustomStats();
        }
      }
    }, [isReady, loadStats, activePeriod, loadCustomStats])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    if (activePeriod === 'custom_range') {
      await loadCustomStats();
    }
    setRefreshing(false);
  };

  const now = new Date();
  const currentMonthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const lastMonthRange = getLastMonthRange();

  // Active hero values
  const activeAmount =
    activePeriod === 'this_month'
      ? stats.monthlyTotal
      : activePeriod === 'last_month'
      ? stats.lastMonthTotal
      : activePeriod === 'this_week'
      ? stats.thisWeekTotal
      : customStats.total;

  const activeCount =
    activePeriod === 'this_month'
      ? stats.monthlyCount
      : activePeriod === 'last_month'
      ? stats.lastMonthCount
      : activePeriod === 'this_week'
      ? stats.thisWeekCount
      : customStats.count;

  const activeTitle =
    activePeriod === 'this_month'
      ? `${currentMonthLabel} ${t('dash_spent')}`
      : activePeriod === 'last_month'
      ? `${lastMonthRange.label}`
      : activePeriod === 'this_week'
      ? `${t('dash_this_week')} ${t('dash_spent')}`
      : `${formatDisplayDate(customStart)} — ${formatDisplayDate(customEnd)}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('dash_welcome')}</Text>
          <Text style={styles.userName}>
            {user?.email?.toLowerCase().includes('shivansh')
              ? 'Shivansh'
              : user?.email?.split('@')[0]?.replace(/[0-9_.-]/g, '') || 'Shivansh'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={onRefresh}
            style={styles.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={refreshing ? 'loading' : 'refresh'}
              size={22}
              color={refreshing ? Colors.primary : Colors.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/logs')}
            style={styles.headerBtn}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Live Geofence Radar & Proximity Status */}
      <GeofenceRadarBanner onPressManage={() => router.push('/(tabs)/locations')} />

      {/* Quick Period Selector for Dashboard */}
      <View style={styles.dashboardPeriodTabs}>
        <TouchableOpacity
          style={[styles.dashTab, activePeriod === 'this_month' && styles.dashTabActive]}
          onPress={() => setActivePeriod('this_month')}
        >
          <Text style={[styles.dashTabText, activePeriod === 'this_month' && styles.dashTabTextActive]}>
            {t('dash_this_month')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dashTab, activePeriod === 'last_month' && styles.dashTabActive]}
          onPress={() => setActivePeriod('last_month')}
        >
          <Text style={[styles.dashTabText, activePeriod === 'last_month' && styles.dashTabTextActive]}>
            {t('dash_last_month')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dashTab, activePeriod === 'this_week' && styles.dashTabActive]}
          onPress={() => setActivePeriod('this_week')}
        >
          <Text style={[styles.dashTabText, activePeriod === 'this_week' && styles.dashTabTextActive]}>
            {t('dash_this_week')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dashTab, activePeriod === 'custom_range' && styles.dashTabActive]}
          onPress={() => setActivePeriod('custom_range')}
        >
          <Text style={[styles.dashTabText, activePeriod === 'custom_range' && styles.dashTabTextActive]}>
            📅 Custom Dates
          </Text>
        </TouchableOpacity>
      </View>

      {/* Custom Date Range Picker on Dashboard */}
      {activePeriod === 'custom_range' && (
        <View style={styles.dashCustomRangeBox}>
          <View style={styles.dashCustomHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="calculator" size={18} color={Colors.primary} />
              <Text style={styles.dashCustomTitle}>{t('exp_calculation_title')}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
              <Text style={styles.dashCustomLink}>Full List in Expenses &rarr;</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Presets for Dashboard */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const now = new Date();
                const past = new Date(now);
                past.setDate(now.getDate() - 6);
                setCustomStart(formatToDDMMYYYY(past));
                setCustomEnd(getTodayDDMMYYYY());
              }}
            >
              <Text style={styles.presetChipText}>Last 7 Days</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const now = new Date();
                const past = new Date(now);
                past.setDate(now.getDate() - 29);
                setCustomStart(formatToDDMMYYYY(past));
                setCustomEnd(getTodayDDMMYYYY());
              }}
            >
              <Text style={styles.presetChipText}>Last 30 Days</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const cur = getCurrentMonthRange();
                setCustomStart(formatToDDMMYYYY(cur.start));
                setCustomEnd(getTodayDDMMYYYY());
              }}
            >
              <Text style={styles.presetChipText}>This Month</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.presetChip}
              onPress={() => {
                const last = getLastMonthRange();
                setCustomStart(formatToDDMMYYYY(last.start));
                setCustomEnd(formatToDDMMYYYY(last.end));
              }}
            >
              <Text style={styles.presetChipText}>Last Month</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={[styles.datePickersRow, isWide && styles.datePickersRowDesktop]}>
            <View style={{ flex: 1 }}>
              <DatePickerInput
                label={t('exp_from_date')}
                value={customStart}
                onChangeDate={(ddmm) => setCustomStart(ddmm)}
              />
            </View>
            <View style={{ justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
              <MaterialCommunityIcons name="arrow-right-bold" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <DatePickerInput
                label={t('exp_to_date')}
                value={customEnd}
                onChangeDate={(ddmm) => setCustomEnd(ddmm)}
              />
            </View>
          </View>
        </View>
      )}

      {/* Overview Grid (Side by side on Laptop, stacked on Mobile) */}
      <View style={[styles.overviewGrid, isWide && styles.overviewGridDesktop]}>
        {/* Hero Card */}
        <View style={[styles.heroCard, isWide && { flex: 1.2, marginBottom: 0 }]}>
          <View style={styles.heroCardTop}>
            <Text style={styles.heroLabel}>{activeTitle}</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{activeCount} {t('dash_entries')}</Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>
            ₹{activeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={styles.heroSubtext}>
            {activePeriod === 'this_month'
              ? 'Total expenses logged this month'
              : activePeriod === 'last_month'
              ? 'Complete expenditure for previous month'
              : activePeriod === 'this_week'
              ? 'Expenses logged since Monday'
              : `Total calculation for ${getDaysDifference(customStart, customEnd)} days`}
          </Text>
        </View>

        {/* Quick Stats Grid */}
        <View style={[styles.statsRow, isWide && { flex: 1, marginBottom: 0 }]}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: Colors.secondaryBg }]}>
              <MaterialCommunityIcons name="calendar-today" size={17} color={Colors.secondary} />
            </View>
            <Text style={styles.statValue}>₹{stats.todayTotal.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>{t('dash_today')}</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: '#EDE9FE' }]}>
              <MaterialCommunityIcons name="history" size={17} color="#7C3AED" />
            </View>
            <Text style={styles.statValue}>₹{stats.lastMonthTotal.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>{t('dash_last_month')}</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: Colors.warningBg }]}>
              <MaterialCommunityIcons name="calendar-week" size={17} color={Colors.warning} />
            </View>
            <Text style={styles.statValue}>₹{stats.thisWeekTotal.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>{t('dash_this_week')}</Text>
          </View>
        </View>
      </View>

      {/* Khata Book / Shop Udhaar Quick Banner */}
      <TouchableOpacity
        style={styles.khataBanner}
        onPress={() => router.push('/(tabs)/loans')}
        activeOpacity={0.8}
      >
        <View style={styles.khataBannerIcon}>
          <MaterialCommunityIcons name="storefront-outline" size={26} color="#B45309" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.khataBannerTitle}>{t('dash_khata_title')}</Text>
            <View style={styles.khataBadge}>
              <Text style={styles.khataBadgeText}>{t('dash_khata_badge')}</Text>
            </View>
          </View>
          <Text style={styles.khataBannerSub}>
            {stats.khataDueTotal > 0
              ? `₹${stats.khataDueTotal.toLocaleString('en-IN')} ${t('dash_khata_due_sub')} (${stats.activeShopsCount} shops)`
              : t('dash_khata_empty_sub')}
          </Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Recent Expenses Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('dash_recent_trans')}</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
            <Text style={styles.seeAllText}>{t('dash_view_all')}</Text>
          </TouchableOpacity>
        </View>

        {stats.recentExpenses.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="receipt" size={36} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>{t('dash_no_expenses')}</Text>
            <Text style={styles.emptySubtext}>
              {t('dash_no_expenses_sub')}
            </Text>
          </View>
        ) : (
          <View style={isWide ? styles.transactionsGridDesktop : undefined}>
            {stats.recentExpenses.map((expense: any) => (
              <TouchableOpacity
                key={expense.id}
                style={[styles.expenseCard, isWide && styles.expenseCardDesktop]}
                onPress={() => router.push(`/expense/${expense.id}`)}
              >
                <View style={[styles.expenseAvatar, { backgroundColor: (expense.category_color || Colors.primary) + '15' }]}>
                  <MaterialCommunityIcons
                    name={expense.category_icon || 'cash'}
                    size={22}
                    color={expense.category_color || Colors.primary}
                  />
                </View>

                <View style={styles.expenseDetails}>
                  <Text style={styles.expenseCategory}>{expense.category_name || 'Other'}</Text>
                  <Text style={styles.expenseNote} numberOfLines={1}>
                    {expense.note ? `${expense.note} • ${formatDisplayDate(expense.date)}` : formatDisplayDate(expense.date)}
                  </Text>
                </View>

                <Text style={styles.expenseAmount}>
                  -₹{expense.amount.toLocaleString('en-IN')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  greeting: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  userName: {
    fontSize: Fonts.sizes.xxl,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.small,
  },
  dashboardPeriodTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: 3,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dashTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
  },
  dashTabActive: {
    backgroundColor: Colors.primary,
    ...Shadows.small,
  },
  dashTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  dashTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dashCustomRangeBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: Spacing.xs,
    ...Shadows.small,
  },
  dashCustomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dashCustomTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  dashCustomLink: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
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
  presetChip: {
    backgroundColor: '#F1F5F9',
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
  overviewGrid: {
    flexDirection: 'column',
    marginBottom: Spacing.lg,
  },
  overviewGridDesktop: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'stretch',
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    justifyContent: 'center',
    ...Shadows.large,
  },
  heroCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  heroLabel: {
    fontSize: Fonts.sizes.sm,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  heroBadgeText: {
    fontSize: Fonts.sizes.xs,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  heroAmount: {
    fontSize: Fonts.sizes.hero,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginVertical: 4,
  },
  heroSubtext: {
    fontSize: Fonts.sizes.xs,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  statIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontSize: Fonts.sizes.sm + 1,
    fontWeight: '700',
    color: Colors.text,
  },
  statLabel: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  khataBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: Spacing.md,
    ...Shadows.small,
  },
  khataBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDE68A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  khataBannerTitle: {
    fontSize: Fonts.sizes.sm,
    fontWeight: '800',
    color: '#92400E',
  },
  khataBadge: {
    backgroundColor: '#B45309',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  khataBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  khataBannerSub: {
    fontSize: Fonts.sizes.xs,
    color: '#B45309',
    marginTop: 2,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  seeAllText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.primary,
    fontWeight: '700',
  },
  transactionsGridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  emptyState: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyText: {
    fontSize: Fonts.sizes.md,
    color: Colors.text,
    fontWeight: '700',
  },
  emptySubtext: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  expenseCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  expenseAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  expenseDetails: {
    flex: 1,
  },
  expenseCategory: {
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.text,
  },
  expenseNote: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.accent,
  },
});
