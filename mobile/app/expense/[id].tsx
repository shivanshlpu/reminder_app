/**
 * Edit Expense Screen — Light Theme with Toast Notifications
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { TextInput, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDatabase } from '../../contexts/DatabaseContext';
import { useAuth } from '../../contexts/AuthContext';
import { useExpenses, Expense } from '../../hooks/useExpenses';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

interface CategoryItem {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db } = useDatabase();
  const { user } = useAuth();
  const { updateExpense, deleteExpense } = useExpenses();
  const router = useRouter();

  const [expense, setExpense] = useState<Expense | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpense();
  }, [id]);

  const loadExpense = async () => {
    if (!db || !user || !id) return;

    try {
      const exp = await db.getFirstAsync<Expense>(
        `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
         FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.id = ? AND e.user_id = ?`,
        [parseInt(id), user.uid]
      );

      if (exp) {
        setExpense(exp);
        setAmount(exp.amount.toString());
        setNote(exp.note || '');
        setExpenseDate(exp.date);
      }

      const cats = await db.getAllAsync<CategoryItem>(
        'SELECT id, name, icon, color FROM categories WHERE user_id = ? ORDER BY name ASC',
        [user.uid]
      );
      setCategories(cats);

      if (exp) {
        const matchedCat = cats.find((c) => c.id === exp.category_id);
        setSelectedCategory(matchedCat || null);
      }
    } catch (error) {
      console.error('Failed to load expense:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCategory || !expense) return;
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showMessage('Invalid Amount', 'Please enter a valid amount', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateExpense(expense.id, selectedCategory.id, amountNum, expenseDate, note);
      showMessage('Expense Updated', `Saved changes for Rs. ${amountNum.toLocaleString('en-IN')}`, 'success');
      router.back();
    } catch (error: any) {
      showMessage('Update Error', error?.message || 'Failed to update expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!expense) return;
    confirmAction('Delete Expense', 'Are you sure you want to remove this expense?', async () => {
      await deleteExpense(expense.id);
      showMessage('Expense Deleted', 'Removed from ledger', 'info');
      router.back();
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading expense...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <TextInput
          label="Amount (INR)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          mode="outlined"
          left={<TextInput.Affix text="Rs. " />}
          style={styles.input}
          outlineColor={Colors.border}
          activeOutlineColor={Colors.primary}
          textColor={Colors.text}
          theme={{ colors: { background: Colors.surface } }}
        />

        <Text style={styles.sectionLabel}>Category</Text>
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
                <Text style={[styles.catOptionText, isSelected && styles.catOptionTextSelected]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          label="Date"
          value={expenseDate}
          onChangeText={setExpenseDate}
          mode="outlined"
          placeholder="YYYY-MM-DD"
          style={styles.input}
          outlineColor={Colors.border}
          activeOutlineColor={Colors.primary}
          textColor={Colors.text}
          theme={{ colors: { background: Colors.surface } }}
        />

        <TextInput
          label="Note / Description"
          value={note}
          onChangeText={setNote}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          outlineColor={Colors.border}
          activeOutlineColor={Colors.primary}
          textColor={Colors.text}
          theme={{ colors: { background: Colors.surface } }}
        />

        <Button
          mode="contained"
          buttonColor={Colors.primary}
          textColor="#FFFFFF"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveBtn}
        >
          Update Expense
        </Button>

        <Button
          mode="outlined"
          textColor={Colors.accent}
          onPress={handleDelete}
          style={styles.deleteBtn}
          icon="trash-can-outline"
        >
          Delete Expense
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background },
  loadingText: { color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
    ...Shadows.medium,
  },
  input: { backgroundColor: Colors.surface, marginBottom: Spacing.md },
  sectionLabel: { fontSize: Fonts.sizes.xs, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.xs, textTransform: 'uppercase' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md },
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
  saveBtn: { marginTop: Spacing.md, borderRadius: BorderRadius.md },
  deleteBtn: { marginTop: Spacing.sm, borderColor: Colors.accent, borderRadius: BorderRadius.md },
});
