/**
 * Expenses Screen — Fluid Multi-Device Responsive with Toast Notifications & Clean Unique Categories
 */
import React, { useState, useEffect, useCallback } from 'react';
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
import { FAB, Modal, Portal, TextInput, Button, Chip } from 'react-native-paper';
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
import { getTodayDDMMYYYY, formatToISO, formatDisplayDate } from '../../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

interface CategoryItem {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export default function ExpensesScreen() {
  const { expenses, fetchExpenses, addExpense, deleteExpense } = useExpenses();
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const router = useRouter();
  const { isWide } = useResponsiveLayout();

  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [filterCategory, setFilterCategory] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [expenseDate, setExpenseDate] = useState(getTodayDDMMYYYY());
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  // Re-fetch on focus whenever switching to the Expenses tab
  useFocusEffect(
    useCallback(() => {
      if (isReady) {
        loadCategories();
        fetchExpenses({ categoryId: filterCategory, searchText }, false);
      }
    }, [isReady, loadCategories, fetchExpenses, filterCategory, searchText])
  );

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
      showMessage('Expense Recorded', `Added Rs. ${amountNum.toLocaleString('en-IN')} under ${activeCat.name}`, 'success');
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
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchExpenses({ categoryId: filterCategory, searchText });
    await loadCategories();
    setRefreshing(false);
  };

  const handleExportPdf = async () => {
    setShowExportMenu(false);
    try {
      showMessage('Exporting PDF', 'Generating certified financial statement...', 'info');
      await exportToPdf(expenses);
      showMessage('PDF Downloaded', 'Executive financial report saved successfully', 'success');
    } catch (error) {
      showMessage('Export Error', 'Failed to generate PDF statement', 'error');
    }
  };

  const handleExportExcel = async () => {
    setShowExportMenu(false);
    try {
      await exportToExcel(expenses);
      showMessage('Excel Exported', 'CSV report saved', 'success');
    } catch (error) {
      showMessage('Export Error', 'Failed to export CSV', 'error');
    }
  };

  const filteredTotal = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

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
            placeholder="Search expenses / notes..."
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              fetchExpenses({ categoryId: filterCategory, searchText: text });
            }}
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
                  onPress={() => {
                    setSearchText('');
                    fetchExpenses({ categoryId: filterCategory, searchText: '' });
                  }}
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
            <Text style={styles.exportBtnLabel}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportIconBtnOutlined}
            onPress={handleExportExcel}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="file-excel" size={18} color={Colors.text} />
            <Text style={styles.exportBtnLabelOutlined}>CSV</Text>
          </TouchableOpacity>
        </View>

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
              onPress={() => {
                setFilterCategory(undefined);
                fetchExpenses({ searchText });
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={16}
                color={filterCategory === undefined ? '#FFFFFF' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  filterCategory === undefined && styles.filterChipTextActive,
                ]}
              >
                All
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
                  onPress={() => {
                    const newFilter = isActive ? undefined : cat.id;
                    setFilterCategory(newFilter);
                    fetchExpenses({ categoryId: newFilter, searchText });
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={(cat.icon as any) || 'cash'}
                    size={16}
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

        {/* Summary Counter & Total Filtered Amount */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryCount}>
            {expenses.length} {expenses.length === 1 ? 'transaction' : 'transactions'}
            {filterCategory !== undefined && (
              <Text style={{ fontWeight: '700', color: Colors.primary }}>
                {' '}• {categories.find((c) => c.id === filterCategory)?.name || 'Filtered'}
              </Text>
            )}
          </Text>
          <View style={styles.summaryAmountBadge}>
            <Text style={styles.summaryTotalLabel}>Total:</Text>
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
            <Text style={styles.emptyText}>No expenses logged</Text>
            <Text style={styles.emptySubtext}>Tap + below to record an expenditure</Text>
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
              <Text style={styles.modalTitle}>Record Expense</Text>

              <TextInput
                label="Amount (INR)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                mode="outlined"
                placeholder="0.00"
                left={<TextInput.Affix text="Rs. " />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              <Text style={styles.sectionSubtitle}>Select Category</Text>
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
                          size={20}
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
                label="Expense Date (DD/MM/YYYY)"
                value={expenseDate}
                onChangeDate={(ddmm) => setExpenseDate(ddmm)}
                style={styles.modalInput}
              />

              <TextInput
                label="Note / Description (Optional)"
                value={note}
                onChangeText={setNote}
                mode="outlined"
                placeholder="e.g. Amazon order / Barber haircut"
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setShowAddModal(false)} textColor={Colors.textSecondary} style={styles.modalBtn}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} buttonColor={Colors.primary} style={styles.modalBtn}>
                  Save Expense
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
    gap: Spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  searchInput: {
    flex: 1,
    backgroundColor: Colors.background,
    height: 42,
  },
  exportIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    height: 42,
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
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    height: 42,
    justifyContent: 'center',
  },
  exportBtnLabelOutlined: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryFilterContainer: {
    paddingVertical: 4,
  },
  filterScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: Spacing.lg,
  },
  customFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customFilterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  filterChipText: {
    fontSize: 12,
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
    paddingTop: 2,
    paddingBottom: 2,
  },
  summaryCount: {
    fontSize: 11.5,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  summaryAmountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  summaryTotalLabel: {
    fontSize: 10.5,
    color: Colors.primary,
    fontWeight: '600',
  },
  summaryTotalValue: {
    fontSize: 12.5,
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
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: Fonts.sizes.lg, color: Colors.text, fontWeight: '700' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.textMuted },
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
