/**
 * Dashboard Screen — Fluid Multi-Device Responsive (Mobile & Desktop Laptop)
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
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

interface DashboardStats {
  monthlyTotal: number;
  todayTotal: number;
  transactionCount: number;
  topCategory: string;
  topCategoryAmount: number;
  recentExpenses: any[];
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { db, isReady } = useDatabase();
  const { isWide } = useResponsiveLayout();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    monthlyTotal: 0,
    todayTotal: 0,
    transactionCount: 0,
    topCategory: '-',
    topCategoryAmount: 0,
    recentExpenses: [],
  });

  const loadStats = useCallback(async () => {
    if (!db || !user) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const today = `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`;
    const monthStart = `${year}-${month}-01`;
    const monthEnd = `${year}-${month}-31`;

    try {
      const monthly = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
        [user.uid, monthStart, monthEnd]
      );

      const todayResult = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?',
        [user.uid, today]
      );

      const count = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?',
        [user.uid, monthStart, monthEnd]
      );

      const topCat = await db.getFirstAsync<{ name: string; total: number }>(
        `SELECT c.name, COALESCE(SUM(e.amount), 0) as total 
         FROM expenses e JOIN categories c ON e.category_id = c.id 
         WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? 
         GROUP BY c.id ORDER BY total DESC LIMIT 1`,
        [user.uid, monthStart, monthEnd]
      );

      const recent = await db.getAllAsync(
        `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
         FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = ? ORDER BY e.date DESC, e.created_at DESC LIMIT 6`,
        [user.uid]
      );

      setStats({
        monthlyTotal: monthly?.total || 0,
        todayTotal: todayResult?.total || 0,
        transactionCount: count?.count || 0,
        topCategory: topCat?.name || '-',
        topCategoryAmount: topCat?.total || 0,
        recentExpenses: recent,
      });
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    }
  }, [db, user]);

  useEffect(() => {
    if (isReady) {
      loadStats();
    }
  }, [isReady, loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const now = new Date();
  const monthName = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

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
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.email?.split('@')[0] || 'User'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/logs')}
          style={styles.notifButton}
        >
          <MaterialCommunityIcons name="bell-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Overview Grid (Side by side on Laptop, stacked on Mobile) */}
      <View style={[styles.overviewGrid, isWide && styles.overviewGridDesktop]}>
        {/* Hero Card */}
        <View style={[styles.heroCard, isWide && { flex: 1.2, marginBottom: 0 }]}>
          <View style={styles.heroCardTop}>
            <Text style={styles.heroLabel}>{monthName} Spent</Text>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{stats.transactionCount} entries</Text>
            </View>
          </View>
          <Text style={styles.heroAmount}>
            ₹{stats.monthlyTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={styles.heroSubtext}>Total expenses logged this month</Text>
        </View>

        {/* Quick Stats Grid */}
        <View style={[styles.statsRow, isWide && { flex: 1, marginBottom: 0 }]}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: Colors.secondaryBg }]}>
              <MaterialCommunityIcons name="calendar-today" size={18} color={Colors.secondary} />
            </View>
            <Text style={styles.statValue}>₹{stats.todayTotal.toLocaleString('en-IN')}</Text>
            <Text style={styles.statLabel}>Today</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: Colors.warningBg }]}>
              <MaterialCommunityIcons name="star-outline" size={18} color={Colors.warning} />
            </View>
            <Text style={styles.statValue} numberOfLines={1}>{stats.topCategory}</Text>
            <Text style={styles.statLabel}>Top Category</Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBadge, { backgroundColor: Colors.primaryBg }]}>
              <MaterialCommunityIcons name="chart-bar" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.statValue}>
              ₹{stats.transactionCount > 0
                ? Math.round(stats.monthlyTotal / Math.min(now.getDate(), 30)).toLocaleString('en-IN')
                : '0'}
            </Text>
            <Text style={styles.statLabel}>Daily Avg</Text>
          </View>
        </View>
      </View>

      {/* Recent Expenses Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
            <Text style={styles.seeAllText}>View All</Text>
          </TouchableOpacity>
        </View>

        {stats.recentExpenses.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="receipt" size={36} color={Colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>No expenses logged yet</Text>
            <Text style={styles.emptySubtext}>
              Tap the Expenses tab to add your first expense entry
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
                    {expense.note || new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
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
    marginBottom: Spacing.xl,
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
  notifButton: {
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
  overviewGrid: {
    flexDirection: 'column',
    marginBottom: Spacing.xl,
  },
  overviewGridDesktop: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'stretch',
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
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
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.text,
  },
  statLabel: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
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
