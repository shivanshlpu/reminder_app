/**
 * Loan & Debt Manager (Khata / Udhaar Tracker)
 * Dual-sided tracking: Money Lent (To Receive) vs Money Borrowed (You Owe)
 * Automated professional WhatsApp notifications & follow-up reminders!
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import {
  TextInput,
  Button,
  Modal,
  Portal,
  FAB,
  Chip,
  SegmentedButtons,
  ProgressBar,
  Switch,
} from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLoans, Loan } from '../../hooks/useLoans';
import { useContacts } from '../../hooks/useContacts';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { DatePickerInput } from '../../components/DatePickerInput';
import { formatToDDMMYYYY, formatToISO, getTodayDDMMYYYY, getTodayISO } from '../../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';
import { ReminderStyle, formatINR } from '../../services/loan-templates';
import { pickContactFromDevice } from '../../services/contact-picker';

type FilterTab = 'lent' | 'borrowed' | 'settled' | 'all';

export default function LoansScreen() {
  const {
    loans,
    loading,
    stats,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
    recordRepayment,
    markAsSettled,
    sendReminder,
  } = useLoans();

  const { contacts } = useContacts();
  const { isWide } = useResponsiveLayout();

  // Filters & Search
  const [filterTab, setFilterTab] = useState<FilterTab>('lent');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Re-fetch automatically on tab focus
  useFocusEffect(
    useCallback(() => {
      fetchLoans(false);
    }, [fetchLoans])
  );

  // Add/Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [loanType, setLoanType] = useState<'lent' | 'borrowed'>('lent');
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayDDMMYYYY());
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [autoNotify, setAutoNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingContact, setPickingContact] = useState(false);

  // Repayment Modal
  const [showRepaymentModal, setShowRepaymentModal] = useState(false);
  const [repaymentLoan, setRepaymentLoan] = useState<Loan | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [recordingPay, setRecordingPay] = useState(false);

  // Reminder Modal
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderLoan, setReminderLoan] = useState<Loan | null>(null);
  const [reminderStyle, setReminderStyle] = useState<ReminderStyle>('friendly');
  const [sendingReminder, setSendingReminder] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLoans();
    setRefreshing(false);
  };

  const handlePickPhoneContact = async () => {
    setPickingContact(true);
    try {
      const res = await pickContactFromDevice();
      if (res.success && res.contact) {
        if (res.contact.name) {
          setPersonName(res.contact.name);
        }
        if (res.contact.phone) {
          setPersonPhone(res.contact.phone);
        }
        showMessage('Contact Selected', `Selected ${res.contact.name} (${res.contact.phone})`, 'whatsapp');
      } else if (res.error) {
        showMessage('Contact Picker', res.error, 'info');
      }
    } catch (e: any) {
      showMessage('Picker Error', e?.message || 'Could not pick contact', 'error');
    } finally {
      setPickingContact(false);
    }
  };

  const openAddModal = (loan?: Loan, defaultType: 'lent' | 'borrowed' = 'lent') => {
    if (loan) {
      setEditingLoanId(loan.id);
      setLoanType(loan.type);
      setPersonName(loan.person_name !== undefined && loan.person_name !== null ? String(loan.person_name) : '');
      setPersonPhone(loan.person_phone !== undefined && loan.person_phone !== null ? String(loan.person_phone) : '');
      setAmount(String(loan.amount !== undefined && loan.amount !== null ? loan.amount : ''));
      setDate(formatToDDMMYYYY(loan.date));
      setDueDate(loan.due_date ? formatToDDMMYYYY(loan.due_date) : '');
      setNote(loan.note !== undefined && loan.note !== null ? String(loan.note) : '');
      setAutoNotify(loan.auto_notify === 1);
    } else {
      setEditingLoanId(null);
      setLoanType(defaultType);
      setPersonName('');
      setPersonPhone('');
      setAmount('');
      setDate(getTodayDDMMYYYY());
      setDueDate('');
      setNote('');
      setAutoNotify(true);
    }
    setShowAddModal(true);
  };

  const handleSaveLoan = async () => {
    const trimmedName = String(personName || '').trim();
    if (!trimmedName) {
      showMessage('Validation Error', 'Please enter the person\'s name', 'error');
      return;
    }
    const cleanAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.]/g, '')) || 0;
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
      showMessage('Validation Error', 'Please enter a valid amount greater than 0', 'error');
      return;
    }

    const cleanPhone = personPhone ? String(personPhone).replace(/[^\d+]/g, '') : '';
    const safeNote = note !== undefined && note !== null && String(note).trim() !== '' ? String(note).trim() : undefined;

    setSaving(true);
    try {
      const isoDate = formatToISO(date) || getTodayISO();
      const isoDueDate = dueDate ? formatToISO(dueDate) : undefined;

      if (editingLoanId) {
        const existing = loans.find((l) => l.id === editingLoanId);
        await updateLoan(
          editingLoanId,
          trimmedName,
          cleanPhone,
          loanType,
          cleanAmount,
          existing?.amount_repaid || 0,
          isoDate,
          isoDueDate,
          safeNote
        );
        showMessage('Record Updated', 'Loan details updated successfully', 'success');
      } else {
        const result = await addLoan(
          trimmedName,
          cleanPhone,
          loanType,
          cleanAmount,
          isoDate,
          isoDueDate,
          safeNote,
          autoNotify
        );

        if (result.messageSent) {
          showMessage(
            'Record Created & WhatsApp Alert Sent!',
            `Sent professional loan confirmation to ${trimmedName} (+${cleanPhone})`,
            'whatsapp'
          );
        } else {
          showMessage('Record Saved', `Recorded ${loanType === 'lent' ? 'loan given' : 'loan taken'} of ${formatINR(cleanAmount)}`, 'success');
        }
      }
      setShowAddModal(false);
    } catch (err: any) {
      showMessage('Save Failed', err?.message || 'Could not save loan record', 'error');
    } finally {
      setSaving(false);
    }
  };


  const handleDelete = (id: number, name: string) => {
    confirmAction(
      'Delete Loan Record',
      `Are you sure you want to delete the loan record for "${name}"?`,
      async () => {
        await deleteLoan(id);
        showMessage('Deleted', `Loan record for ${name} removed`, 'info');
      },
      'Delete'
    );
  };

  const openRepaymentModal = (loan: Loan) => {
    setRepaymentLoan(loan);
    const remaining = Math.max(0, loan.amount - (loan.amount_repaid || 0));
    setRepaymentAmount(String(remaining));
    setSendReceipt(true);
    setShowRepaymentModal(true);
  };

  const handleRecordRepayment = async () => {
    if (!repaymentLoan) return;
    const num = parseFloat(repaymentAmount);
    if (isNaN(num) || num <= 0) {
      showMessage('Invalid Amount', 'Please enter a valid repayment amount', 'error');
      return;
    }

    setRecordingPay(true);
    try {
      await recordRepayment(repaymentLoan.id, num, sendReceipt);
      setShowRepaymentModal(false);
      showMessage('Repayment Recorded', `Recorded payment of ${formatINR(num)}. Balance updated!`, 'success');
    } catch (e: any) {
      showMessage('Repayment Failed', e?.message || 'Could not record repayment', 'error');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleQuickSettle = (loan: Loan) => {
    const remaining = loan.amount - (loan.amount_repaid || 0);
    confirmAction(
      'Mark as Fully Settled',
      `Mark the remaining ${formatINR(remaining)} for "${loan.person_name}" as fully paid and cleared?`,
      async () => {
        await markAsSettled(loan.id, true);
        showMessage('Settled', `Loan with ${loan.person_name} marked as fully cleared!`, 'success');
      },
      'Mark Settled'
    );
  };

  const openReminderModal = (loan: Loan) => {
    setReminderLoan(loan);
    setReminderStyle('friendly');
    setShowReminderModal(true);
  };

  const handleSendReminder = async () => {
    if (!reminderLoan) return;
    setSendingReminder(true);
    try {
      const ok = await sendReminder(reminderLoan, reminderStyle);
      setShowReminderModal(false);
      if (ok) {
        showMessage(
          'WhatsApp Reminder Sent!',
          `Delivered ${reminderStyle} payment reminder to ${reminderLoan.person_name}`,
          'whatsapp'
        );
      } else {
        showMessage('Reminder Dispatched', 'Queued reminder to WhatsApp service', 'info');
      }
    } catch (e: any) {
      showMessage('Reminder Failed', e?.message || 'Check WhatsApp connection in Settings', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  // Filtered loans list
  const filteredLoans = loans.filter((l) => {
    // Tab filter
    if (filterTab === 'lent' && (l.type !== 'lent' || l.status === 'settled')) return false;
    if (filterTab === 'borrowed' && (l.type !== 'borrowed' || l.status === 'settled')) return false;
    if (filterTab === 'settled' && l.status !== 'settled') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = l.person_name.toLowerCase().includes(q);
      const matchPhone = l.person_phone.toLowerCase().includes(q);
      const matchNote = l.note ? l.note.toLowerCase().includes(q) : false;
      return matchName || matchPhone || matchNote;
    }
    return true;
  });

  const renderLoanCard = (item: Loan) => {
    const remaining = Math.max(0, item.amount - (item.amount_repaid || 0));
    const progress = item.amount > 0 ? (item.amount_repaid || 0) / item.amount : 0;
    const isLent = item.type === 'lent';
    const isSettled = item.status === 'settled' || remaining === 0;

    return (
      <View
        key={item.id}
        style={[
          styles.loanCard,
          isWide && styles.loanCardDesktop,
          isSettled && styles.loanCardSettled,
          !isSettled && (isLent ? styles.loanCardLent : styles.loanCardBorrowed),
        ]}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.avatarWrap, { backgroundColor: isSettled ? '#E2E8F0' : isLent ? '#DCFCE7' : '#FEE2E2' }]}>
            <MaterialCommunityIcons
              name={isSettled ? 'check-circle' : isLent ? 'arrow-top-right-bold-box-outline' : 'arrow-bottom-left-bold-box-outline'}
              size={22}
              color={isSettled ? Colors.textMuted : isLent ? Colors.success : Colors.accent}
            />
          </View>

          <View style={styles.personInfo}>
            <Text style={styles.personName}>{item.person_name}</Text>
            <Text style={styles.personPhone}>
              {item.person_phone ? `📞 +${item.person_phone}` : 'No phone'}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.amountText, { color: isSettled ? Colors.textMuted : isLent ? Colors.success : Colors.accent }]}>
              {isLent ? '+' : '-'}{formatINR(remaining)}
            </Text>
            <Text style={styles.originalAmount}>
              of {formatINR(item.amount)}
            </Text>
          </View>
        </View>

        {/* Repayment Progress Bar */}
        {!isSettled && (
          <View style={styles.progressSection}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>
                Repaid: <Text style={{ fontWeight: '700', color: Colors.text }}>{formatINR(item.amount_repaid || 0)}</Text> ({Math.round(progress * 100)}%)
              </Text>
              <Text style={styles.progressLabel}>
                Pending: <Text style={{ fontWeight: '700', color: isLent ? Colors.success : Colors.accent }}>{formatINR(remaining)}</Text>
              </Text>
            </View>
            <ProgressBar
              progress={progress}
              color={isLent ? Colors.success : Colors.accent}
              style={styles.progressBar}
            />
          </View>
        )}

        {/* Date & Note Info */}
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="calendar" size={14} color={Colors.textMuted} />
            <Text style={styles.detailText}>Given: {formatToDDMMYYYY(item.date)}</Text>
          </View>
          {item.due_date && (
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="calendar-clock" size={14} color={Colors.secondary} />
              <Text style={[styles.detailText, { color: Colors.secondary, fontWeight: '600' }]}>
                Due: {formatToDDMMYYYY(item.due_date)}
              </Text>
            </View>
          )}
          <View style={[styles.statusBadge, isSettled ? styles.statusSettled : isLent ? styles.statusLent : styles.statusBorrowed]}>
            <Text style={[styles.statusBadgeText, isSettled ? { color: Colors.textMuted } : isLent ? { color: Colors.success } : { color: Colors.accent }]}>
              {isSettled ? 'Settled' : isLent ? 'You will get' : 'You owe'}
            </Text>
          </View>
        </View>

        {item.note ? (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>📝 "{item.note}"</Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.cardActions}>
          {!isSettled && isLent && item.person_phone && (
            <Button
              mode="contained"
              icon="whatsapp"
              buttonColor="#25D366"
              textColor="#FFFFFF"
              onPress={() => openReminderModal(item)}
              style={styles.actionBtn}
              labelStyle={{ fontSize: 11, fontWeight: '700' }}
            >
              WhatsApp Reminder
            </Button>
          )}

          {!isSettled && (
            <Button
              mode="outlined"
              icon="cash-plus"
              textColor={Colors.secondary}
              onPress={() => openRepaymentModal(item)}
              style={[styles.actionBtn, { borderColor: Colors.secondary }]}
              labelStyle={{ fontSize: 11, fontWeight: '700' }}
            >
              Pay / Repay
            </Button>
          )}

          {!isSettled && (
            <Button
              mode="text"
              icon="check-all"
              textColor={Colors.success}
              onPress={() => handleQuickSettle(item)}
              style={styles.actionBtnSmall}
              labelStyle={{ fontSize: 11, fontWeight: '700' }}
            >
              Settle
            </Button>
          )}

          <TouchableOpacity onPress={() => openAddModal(item)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="pencil-outline" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleDelete(item.id, item.person_name)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Aggregate Financial Dashboard */}
      <View style={styles.summaryBar}>
        <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
          <Text style={styles.summaryLabel}>TO RECEIVE (LENT)</Text>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>
            {formatINR(stats.totalLentPending)}
          </Text>
          <Text style={styles.summarySub}>{stats.activeLentCount} active debtors</Text>
        </View>

        <View style={[styles.summaryCard, { borderLeftColor: Colors.accent }]}>
          <Text style={styles.summaryLabel}>YOU OWE (BORROWED)</Text>
          <Text style={[styles.summaryValue, { color: Colors.accent }]}>
            {formatINR(stats.totalBorrowedPending)}
          </Text>
          <Text style={styles.summarySub}>{stats.activeBorrowedCount} active creditors</Text>
        </View>

        <View style={[styles.summaryCard, { borderLeftColor: stats.netBalance >= 0 ? Colors.secondary : Colors.accent }]}>
          <Text style={styles.summaryLabel}>NET BALANCE</Text>
          <Text style={[styles.summaryValue, { color: stats.netBalance >= 0 ? Colors.secondary : Colors.accent }]}>
            {stats.netBalance >= 0 ? '+' : ''}{formatINR(stats.netBalance)}
          </Text>
          <Text style={styles.summarySub}>{stats.settledCount} settled</Text>
        </View>
      </View>

      {/* Quick Filter Tabs */}
      <View style={styles.filterSection}>
        <SegmentedButtons
          value={filterTab}
          onValueChange={(val) => setFilterTab(val as FilterTab)}
          buttons={[
            { value: 'lent', label: `Lent (${stats.activeLentCount})` },
            { value: 'borrowed', label: `Borrowed (${stats.activeBorrowedCount})` },
            { value: 'settled', label: `Settled (${stats.settledCount})` },
            { value: 'all', label: `All (${stats.totalCount})` },
          ]}
          style={styles.segmentedBtn}
          theme={{ colors: { secondaryContainer: Colors.secondaryBg, onSecondaryContainer: Colors.secondary } }}
        />

        {/* Search Input */}
        <TextInput
          placeholder="Search by person name, phone, note..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          style={styles.searchInput}
          outlineColor={Colors.border}
          activeOutlineColor={Colors.secondary}
          textColor={Colors.text}
          left={<TextInput.Icon icon="magnify" color={Colors.textSecondary} />}
          right={searchQuery ? <TextInput.Icon icon="close" onPress={() => setSearchQuery('')} /> : undefined}
          theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
        />
      </View>

      {/* Loans List */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.secondary}
            colors={[Colors.secondary]}
          />
        }
      >
        {filteredLoans.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name={filterTab === 'lent' ? 'hand-coin-outline' : filterTab === 'borrowed' ? 'bank-transfer-out' : 'check-decagram-outline'}
              size={56}
              color={Colors.border}
            />
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'No matching loan records'
                : filterTab === 'lent'
                ? 'No money lent to anyone currently'
                : filterTab === 'borrowed'
                ? 'You do not owe any money!'
                : 'No settled loan records found'}
            </Text>
            <Text style={styles.emptySubtext}>
              Tap the "+ Add" button below to record when you give or take a loan.
            </Text>
          </View>
        ) : (
          <View style={isWide ? styles.gridDesktop : null}>
            {filteredLoans.map(renderLoanCard)}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        label="Add Loan / Debt"
        style={styles.fab}
        color="#FFFFFF"
        onPress={() => openAddModal(undefined, filterTab === 'borrowed' ? 'borrowed' : 'lent')}
      />

      {/* ================= ADD / EDIT MODAL ================= */}
      <Portal>
        <Modal
          visible={showAddModal}
          onDismiss={() => setShowAddModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>
            {editingLoanId ? 'Edit Loan Record' : 'Record New Loan / Debt'}
          </Text>

          {/* Type Toggle */}
          <SegmentedButtons
            value={loanType}
            onValueChange={(val) => setLoanType(val as 'lent' | 'borrowed')}
            buttons={[
              { value: 'lent', label: '💸 I Gave Loan (Lent)' },
              { value: 'borrowed', label: '🤝 I Took Loan (Borrowed)' },
            ]}
            style={{ marginBottom: Spacing.md }}
          />

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {/* Pick from Phonebook Button */}
            <TouchableOpacity
              style={styles.pickContactBtn}
              onPress={handlePickPhoneContact}
              disabled={pickingContact}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="contacts" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.pickContactBtnText}>
                {pickingContact ? 'Opening Phonebook...' : '📱 Select from Phone Contacts'}
              </Text>
            </TouchableOpacity>

            {/* Person Name */}
            <TextInput
              label="Person's Name *"
              value={personName}
              onChangeText={setPersonName}
              mode="outlined"
              style={styles.modalInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.secondary}
              theme={{ colors: { background: Colors.surface } }}
            />


            {/* Quick Contact Picker */}
            {contacts.length > 0 && (
              <View style={styles.quickContactsWrap}>
                <Text style={styles.quickContactsLabel}>Pick from saved contacts:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginVertical: 4 }}>
                  {contacts.slice(0, 8).map((c) => (
                    <Chip
                      key={c.id}
                      onPress={() => {
                        setPersonName(c.name);
                        setPersonPhone(c.phone);
                      }}
                      style={styles.contactChip}
                      textStyle={{ fontSize: 11 }}
                    >
                      {c.name}
                    </Chip>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Phone Number */}
            <TextInput
              label="WhatsApp Phone Number (with country code)"
              value={personPhone}
              onChangeText={setPersonPhone}
              mode="outlined"
              keyboardType="phone-pad"
              placeholder="e.g. 919876543210"
              style={styles.modalInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.secondary}
              theme={{ colors: { background: Colors.surface } }}
            />

            {/* Amount */}
            <TextInput
              label="Loan Amount (₹) *"
              value={amount}
              onChangeText={setAmount}
              mode="outlined"
              keyboardType="decimal-pad"
              placeholder="e.g. 5000"
              style={styles.modalInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.secondary}
              theme={{ colors: { background: Colors.surface } }}
            />

            {/* Date & Due Date */}
            <View style={styles.modalRow}>
              <DatePickerInput
                label="Date (DD/MM/YYYY) *"
                value={date}
                onChangeDate={(ddmm) => setDate(ddmm)}
                style={{ flex: 1 }}
              />
              <DatePickerInput
                label="Due Date (Optional)"
                value={dueDate}
                onChangeDate={(ddmm) => setDueDate(ddmm)}
                placeholder="DD/MM/YYYY"
                style={{ flex: 1 }}
              />
            </View>

            {/* Note / Purpose */}
            <TextInput
              label="Purpose / Note"
              value={note}
              onChangeText={setNote}
              mode="outlined"
              placeholder="e.g. College fee advance, Rent split, Emergency"
              multiline
              numberOfLines={2}
              style={styles.modalInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.secondary}
              theme={{ colors: { background: Colors.surface } }}
            />

            {/* Auto WhatsApp Notification Switch */}
            {!editingLoanId && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>Send WhatsApp Confirmation Now</Text>
                  <Text style={styles.switchSub}>
                    Instantly sends a professional acknowledgment message to {personName || 'the recipient'}.
                  </Text>
                </View>
                <Switch
                  value={autoNotify}
                  onValueChange={setAutoNotify}
                  color="#25D366"
                />
              </View>
            )}
          </ScrollView>

          {/* Modal Actions */}
          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShowAddModal(false)} textColor={Colors.textSecondary}>
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor={Colors.secondary}
              onPress={handleSaveLoan}
              loading={saving}
              disabled={saving}
            >
              {editingLoanId ? 'Save Changes' : 'Record Loan'}
            </Button>
          </View>
        </Modal>

        {/* ================= REPAYMENT MODAL ================= */}
        <Modal
          visible={showRepaymentModal}
          onDismiss={() => setShowRepaymentModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Record Repayment</Text>
          <Text style={styles.modalSubtitle}>
            {repaymentLoan?.type === 'lent' ? 'Received from' : 'Paid to'} <Text style={{ fontWeight: '700', color: Colors.text }}>{repaymentLoan?.person_name}</Text>
          </Text>

          <TextInput
            label="Repayment Amount (₹) *"
            value={repaymentAmount}
            onChangeText={setRepaymentAmount}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.modalInput}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.secondary}
            theme={{ colors: { background: Colors.surface } }}
          />

          {repaymentLoan?.person_phone && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.switchTitle}>Send WhatsApp Payment Receipt</Text>
                <Text style={styles.switchSub}>
                  Sends a detailed payment acknowledgment with the updated remaining balance.
                </Text>
              </View>
              <Switch
                value={sendReceipt}
                onValueChange={setSendReceipt}
                color="#25D366"
              />
            </View>
          )}

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShowRepaymentModal(false)} textColor={Colors.textSecondary}>
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor={Colors.secondary}
              onPress={handleRecordRepayment}
              loading={recordingPay}
              disabled={recordingPay}
            >
              Confirm Payment
            </Button>
          </View>
        </Modal>

        {/* ================= REMINDER STYLE MODAL ================= */}
        <Modal
          visible={showReminderModal}
          onDismiss={() => setShowReminderModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Send WhatsApp Reminder</Text>
          <Text style={styles.modalSubtitle}>
            To: <Text style={{ fontWeight: '700', color: Colors.text }}>{reminderLoan?.person_name}</Text> (+{reminderLoan?.person_phone})
          </Text>

          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 8, marginBottom: 4 }}>
            SELECT REMINDER TONE:
          </Text>

          <SegmentedButtons
            value={reminderStyle}
            onValueChange={(val) => setReminderStyle(val as ReminderStyle)}
            buttons={[
              { value: 'friendly', label: '👋 Friendly' },
              { value: 'formal', label: '📢 Formal' },
              { value: 'urgent', label: '⚠️ Overdue' },
            ]}
            style={{ marginBottom: Spacing.md }}
          />

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShowReminderModal(false)} textColor={Colors.textSecondary}>
              Cancel
            </Button>
            <Button
              mode="contained"
              icon="whatsapp"
              buttonColor="#25D366"
              textColor="#FFFFFF"
              onPress={handleSendReminder}
              loading={sendingReminder}
              disabled={sendingReminder}
            >
              Send via WhatsApp
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  summaryBar: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
  },
  summaryLabel: { fontSize: 9, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  summaryValue: { fontSize: Fonts.sizes.md, fontWeight: '800', marginTop: 2 },
  summarySub: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  filterSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    backgroundColor: Colors.surface,
    gap: Spacing.xs,
  },
  segmentedBtn: { marginBottom: 4 },
  searchInput: { backgroundColor: Colors.surface, height: 40, marginBottom: Spacing.xs },
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  loanCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
    ...Shadows.small,
  },
  loanCardDesktop: { width: '48.5%', marginBottom: 0 },
  loanCardLent: { borderLeftColor: Colors.success },
  loanCardBorrowed: { borderLeftColor: Colors.accent },
  loanCardSettled: { borderLeftColor: Colors.textMuted, opacity: 0.85 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  avatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  personInfo: { flex: 1 },
  personName: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text },
  personPhone: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 1 },
  amountText: { fontSize: Fonts.sizes.lg, fontWeight: '800' },
  originalAmount: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  progressSection: { marginVertical: Spacing.xs },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  progressLabel: { fontSize: 10, color: Colors.textSecondary },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: '#E2E8F0' },
  detailsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: 4, flexWrap: 'wrap' },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailText: { fontSize: 11, color: Colors.textMuted },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusLent: { backgroundColor: '#DCFCE7' },
  statusBorrowed: { backgroundColor: '#FEE2E2' },
  statusSettled: { backgroundColor: '#F1F5F9' },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  noteBox: {
    backgroundColor: Colors.background,
    padding: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginVertical: 4,
  },
  noteText: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic' },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexWrap: 'wrap',
  },
  actionBtn: { borderRadius: BorderRadius.sm },
  actionBtnSmall: { paddingHorizontal: 0 },
  iconBtn: { padding: 6, marginLeft: 'auto' },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: Fonts.sizes.lg, color: Colors.text, fontWeight: '700' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xxl },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    backgroundColor: Colors.secondary,
    borderRadius: 28,
    ...Shadows.large,
  },
  modal: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    maxWidth: 580,
    maxHeight: '90%',
    alignSelf: 'center',
    width: '94%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalTitle: { fontSize: Fonts.sizes.lg, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSubtitle: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  modalInput: { backgroundColor: Colors.surface, marginBottom: Spacing.sm },
  modalRow: { flexDirection: 'row', gap: Spacing.sm },
  quickContactsWrap: { marginBottom: Spacing.xs },
  quickContactsLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  contactChip: { marginRight: Spacing.xs, backgroundColor: Colors.background },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginVertical: Spacing.xs,
  },
  switchTitle: { fontSize: 12, fontWeight: '700', color: Colors.text },
  switchSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md },
  pickContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25D366',
    borderRadius: BorderRadius.md,
    paddingVertical: 9,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.small,
  },
  pickContactBtnText: {
    color: '#FFFFFF',
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
  },
});

