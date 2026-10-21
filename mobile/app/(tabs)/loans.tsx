/**
 * Khata Book & Udhaar Ledger (Shop & Ration Khata + Personal Loans)
 * Full Internationalization: English (Default) and Hindi.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
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
import { useShopKhata, Shop, ShopEntry } from '../../hooks/useShopKhata';
import { useLoans, Loan } from '../../hooks/useLoans';
import { useContacts } from '../../hooks/useContacts';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { DatePickerInput } from '../../components/DatePickerInput';
import { formatToDDMMYYYY, formatToISO, getTodayDDMMYYYY, getTodayISO, formatDisplayDate } from '../../utils/date';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';
import { ReminderStyle, formatINR } from '../../services/loan-templates';
import { pickContactFromDevice } from '../../services/contact-picker';
import { exportShopPdf } from '../../services/shop-pdf';

type MainViewMode = 'shop_khata' | 'personal_loans';
type LoanFilterTab = 'lent' | 'borrowed' | 'settled' | 'all';
type ShopCategoryFilter = 'all' | 'Kirana / Ration' | 'Dairy / Milk' | 'Sabzi / Veg' | 'Medical' | 'due' | 'settled';

const QUICK_ITEMS_EN = [
  'Atta (10kg)',
  'Rice (5kg)',
  'Cooking Oil (1L)',
  'Sugar (2kg)',
  'Daal (1kg)',
  'Milk (1L)',
  'Tea (250g)',
  'Spices',
  'Bread',
  'Biscuits',
  'Soap',
  'Vegetables',
];

const QUICK_ITEMS_HI = [
  'आटा (Atta)',
  'चावल (Rice)',
  'दाल (Daal)',
  'तेल (Oil)',
  'चीनी (Sugar)',
  'दूध (Milk)',
  'चायपत्ती (Tea)',
  'मसाले (Spices)',
  'ब्रेड (Bread)',
  'बिस्कुट (Biscuits)',
  'साबुन (Soap)',
  'सब्जी (Vegetables)',
];

export default function KhataBookScreen() {
  const { isWide } = useResponsiveLayout();
  const { contacts } = useContacts();
  const { t, language } = useLanguage();

  const quickItems = language === 'hi' ? QUICK_ITEMS_HI : QUICK_ITEMS_EN;

  // Top Mode Switcher
  const [viewMode, setViewMode] = useState<MainViewMode>('shop_khata');

  // ================= SHOP KHATA HOOK & STATES =================
  const {
    shops,
    allEntries,
    loading: shopLoading,
    stats: shopStats,
    fetchShopsAndEntries,
    addShop,
    updateShop,
    deleteShop,
    addEntry,
    deleteEntry,
    getEntriesForShop,
    sendWhatsAppStatement,
  } = useShopKhata();

  const [shopSearch, setShopSearch] = useState('');
  const [shopCategoryFilter, setShopCategoryFilter] = useState<ShopCategoryFilter>('all');
  const [refreshingShop, setRefreshingShop] = useState(false);

  // Shop Creation / Edit Modal
  const [showShopModal, setShowShopModal] = useState(false);
  const [editingShopId, setEditingShopId] = useState<number | null>(null);
  const [shopNameInput, setShopNameInput] = useState('');
  const [shopPersonInput, setShopPersonInput] = useState('');
  const [shopPhoneInput, setShopPhoneInput] = useState('');
  const [shopCatInput, setShopCatInput] = useState('Kirana / Ration');
  const [shopAddrInput, setShopAddrInput] = useState('');
  const [savingShop, setSavingShop] = useState(false);

  // Shop Entry Modal (Add Samaan / Add Payment)
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryShopId, setEntryShopId] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<'purchase' | 'payment'>('purchase');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryItems, setEntryItems] = useState('');
  const [entryDate, setEntryDate] = useState(getTodayDDMMYYYY());
  const [entryNote, setEntryNote] = useState('');
  const [autoRecordExpense, setAutoRecordExpense] = useState(true);
  const [savingEntry, setSavingEntry] = useState(false);

  // Passbook / Ledger View Modal
  const [selectedShopForPassbook, setSelectedShopForPassbook] = useState<Shop | null>(null);
  const [showPassbookModal, setShowPassbookModal] = useState(false);

  // ================= PERSONAL LOANS HOOK & STATES =================
  const {
    loans,
    loading: loansLoading,
    stats: loanStats,
    fetchLoans,
    addLoan,
    updateLoan,
    deleteLoan,
    recordRepayment,
    markAsSettled,
    sendReminder,
  } = useLoans();

  const [loanFilterTab, setLoanFilterTab] = useState<LoanFilterTab>('lent');
  const [loanSearchQuery, setLoanSearchQuery] = useState('');
  const [refreshingLoans, setRefreshingLoans] = useState(false);

  const [showLoanModal, setShowLoanModal] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<number | null>(null);
  const [loanType, setLoanType] = useState<'lent' | 'borrowed'>('lent');
  const [loanPersonName, setLoanPersonName] = useState('');
  const [loanPersonPhone, setLoanPersonPhone] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDate, setLoanDate] = useState(getTodayDDMMYYYY());
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanAutoNotify, setLoanAutoNotify] = useState(true);
  const [savingLoan, setSavingLoan] = useState(false);
  const [pickingContact, setPickingContact] = useState(false);

  const [showRepaymentModal, setShowRepaymentModal] = useState(false);
  const [repaymentLoan, setRepaymentLoan] = useState<Loan | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [sendReceipt, setSendReceipt] = useState(true);
  const [recordingPay, setRecordingPay] = useState(false);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderLoan, setReminderLoan] = useState<Loan | null>(null);
  const [reminderStyle, setReminderStyle] = useState<ReminderStyle>('friendly');
  const [sendingReminder, setSendingReminder] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchShopsAndEntries(false);
      fetchLoans(false);
    }, [fetchShopsAndEntries, fetchLoans])
  );

  const onRefresh = async () => {
    if (viewMode === 'shop_khata') {
      setRefreshingShop(true);
      await fetchShopsAndEntries(false);
      setRefreshingShop(false);
    } else {
      setRefreshingLoans(true);
      await fetchLoans(false);
      setRefreshingLoans(false);
    }
  };

  // ================= SHOP ACTIONS =================
  const handleOpenAddShopModal = (shopToEdit?: Shop) => {
    if (shopToEdit) {
      setEditingShopId(shopToEdit.id);
      setShopNameInput(shopToEdit.name);
      setShopPersonInput(shopToEdit.person_name || '');
      setShopPhoneInput(shopToEdit.phone || '');
      setShopCatInput(shopToEdit.category || 'Kirana / Ration');
      setShopAddrInput(shopToEdit.address || '');
    } else {
      setEditingShopId(null);
      setShopNameInput('');
      setShopPersonInput('');
      setShopPhoneInput('');
      setShopCatInput('Kirana / Ration');
      setShopAddrInput('');
    }
    setShowShopModal(true);
  };

  const handleSaveShop = async () => {
    if (!shopNameInput.trim()) {
      showMessage(
        language === 'hi' ? 'दुकान का नाम आवश्यक है' : 'Shop Name Required',
        language === 'hi' ? 'कृपया दुकान का नाम दर्ज करें' : 'Please enter the shop/business name',
        'error'
      );
      return;
    }
    setSavingShop(true);
    try {
      if (editingShopId) {
        await updateShop(
          editingShopId,
          shopNameInput,
          shopPersonInput,
          shopPhoneInput,
          shopCatInput,
          shopAddrInput
        );
        showMessage(
          language === 'hi' ? 'दुकान अपडेट हो गई' : 'Shop Updated',
          `${shopNameInput} details saved`,
          'success'
        );
      } else {
        await addShop(
          shopNameInput,
          shopPersonInput,
          shopPhoneInput,
          shopCatInput,
          shopAddrInput
        );
        showMessage(
          language === 'hi' ? 'नया खाता खुला' : 'New Shop Added',
          `${shopNameInput} added to Khata Book`,
          'success'
        );
      }
      setShowShopModal(false);
    } catch (e: any) {
      showMessage('Error', e?.message || 'Could not save shop', 'error');
    } finally {
      setSavingShop(false);
    }
  };

  const handleDeleteShop = (shop: Shop) => {
    confirmAction(
      language === 'hi' ? 'दुकान खाता हटाएं?' : 'Delete Shop Khata?',
      language === 'hi'
        ? `क्या आप सचमुच "${shop.name}" और इसके सभी पुराने राशन बिलों को हटाना चाहते हैं?`
        : `Are you sure you want to remove "${shop.name}" and all its transaction history?`,
      async () => {
        await deleteShop(shop.id);
        if (selectedShopForPassbook?.id === shop.id) {
          setShowPassbookModal(false);
          setSelectedShopForPassbook(null);
        }
        showMessage(language === 'hi' ? 'खाता हटाया गया' : 'Shop Removed', `${shop.name} deleted`, 'info');
      },
      t('common_delete')
    );
  };

  const handleOpenAddEntryModal = (shopId: number, type: 'purchase' | 'payment') => {
    setEntryShopId(shopId);
    setEntryType(type);
    setEntryAmount('');
    setEntryItems('');
    setEntryNote('');
    setEntryDate(getTodayDDMMYYYY());
    setAutoRecordExpense(true);
    setShowEntryModal(true);
  };

  const handleAppendItemChip = (itemLabel: string) => {
    setEntryItems((prev) => {
      const cleanLabel = itemLabel.split(' ')[0];
      if (!prev.trim()) return cleanLabel;
      return `${prev}, ${cleanLabel}`;
    });
  };

  const handleSaveEntry = async () => {
    if (!entryShopId) {
      showMessage('Shop Required', 'Please select a shop', 'error');
      return;
    }
    const num = parseFloat(entryAmount);
    if (isNaN(num) || num <= 0) {
      showMessage('Invalid Amount', 'Please enter a valid amount greater than 0', 'error');
      return;
    }
    if (entryType === 'purchase' && !entryItems.trim() && !entryNote.trim()) {
      showMessage(
        language === 'hi' ? 'सामान का नाम लिखें' : 'Items Description Required',
        language === 'hi' ? 'कृपया क्या सामान लिया है लिखें (उदा. आटा, तेल, चीनी)' : 'Please list the items bought (e.g. Atta, Oil, Sugar)',
        'error'
      );
      return;
    }

    setSavingEntry(true);
    try {
      const isoDate = formatToISO(entryDate) || getTodayISO();
      await addEntry(
        entryShopId,
        entryType,
        num,
        isoDate,
        entryItems,
        entryNote,
        autoRecordExpense
      );
      setShowEntryModal(false);
      showMessage(
        entryType === 'purchase' ? (language === 'hi' ? 'सामान दर्ज हुआ' : 'Bill Recorded') : (language === 'hi' ? 'भुगतान दर्ज हुआ' : 'Payment Recorded'),
        `₹${num.toLocaleString('en-IN')} ${entryType === 'purchase' ? 'added to shop dues' : 'payment recorded'}`,
        'success'
      );
      if (selectedShopForPassbook && selectedShopForPassbook.id === entryShopId) {
        const updated = shops.find((s) => s.id === entryShopId);
        if (updated) setSelectedShopForPassbook(updated);
      }
    } catch (e: any) {
      showMessage('Error', e?.message || 'Could not record entry', 'error');
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = (entryId: number, shopName: string) => {
    confirmAction(
      language === 'hi' ? 'लेन-देन हटाएं?' : 'Delete Entry?',
      language === 'hi' ? 'क्या आप इस एंट्री को खाते से हटाना चाहते हैं?' : 'Remove this transaction entry from the ledger?',
      async () => {
        await deleteEntry(entryId);
        showMessage(language === 'hi' ? 'हटाया गया' : 'Deleted', 'Entry removed', 'info');
      },
      t('common_delete')
    );
  };

  const handleOpenPassbook = (shop: Shop) => {
    setSelectedShopForPassbook(shop);
    setShowPassbookModal(true);
  };

  const handleSendWhatsAppStatement = async (shop: Shop) => {
    if (!shop.phone) {
      showMessage(
        language === 'hi' ? 'फोन नंबर नहीं है' : 'Phone Number Missing',
        language === 'hi' ? 'व्हाट्सएप भेजने के लिए दुकान या दुकानदार का फोन नंबर जोड़ें' : 'Please edit shop to add a WhatsApp phone number',
        'info'
      );
      handleOpenAddShopModal(shop);
      return;
    }
    try {
      showMessage(language === 'hi' ? 'WhatsApp भेजा जा रहा है...' : 'Sending WhatsApp...', 'Preparing statement message', 'whatsapp');
      const ok = await sendWhatsAppStatement(shop);
      if (ok) {
        showMessage('WhatsApp Statement Sent!', `Sent full statement to ${shop.name} (+${shop.phone})`, 'whatsapp');
      } else {
        showMessage('Dispatched', 'Statement dispatched', 'info');
      }
    } catch (e: any) {
      showMessage('WhatsApp Error', e?.message || 'Check WhatsApp connection in Settings', 'error');
    }
  };

  const handleExportShopPdf = async (shop: Shop) => {
    try {
      showMessage('Generating PDF...', `Preparing statement for ${shop.name}`, 'info');
      const entries = getEntriesForShop(shop.id);
      await exportShopPdf(shop, entries);
      showMessage('PDF Ready', 'Statement exported successfully', 'success');
    } catch (e: any) {
      showMessage('PDF Error', 'Failed to generate PDF statement', 'error');
    }
  };

  // Filtered Shops
  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      if (shopCategoryFilter === 'due' && (s.balance_due || 0) <= 0) return false;
      if (shopCategoryFilter === 'settled' && (s.balance_due || 0) !== 0) return false;
      if (
        shopCategoryFilter !== 'all' &&
        shopCategoryFilter !== 'due' &&
        shopCategoryFilter !== 'settled' &&
        s.category !== shopCategoryFilter
      ) {
        return false;
      }

      if (shopSearch.trim()) {
        const q = shopSearch.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchPerson = s.person_name ? s.person_name.toLowerCase().includes(q) : false;
        const matchPhone = s.phone ? s.phone.includes(q) : false;
        const sEntries = allEntries.filter((e) => e.shop_id === s.id);
        const matchItem = sEntries.some((e) => e.items && e.items.toLowerCase().includes(q));
        return matchName || matchPerson || matchPhone || matchItem;
      }
      return true;
    });
  }, [shops, shopCategoryFilter, shopSearch, allEntries]);

  // ================= PERSONAL LOANS HANDLERS =================
  const handlePickPhoneContact = async () => {
    setPickingContact(true);
    try {
      const res = await pickContactFromDevice();
      if (res.success && res.contact) {
        if (res.contact.name) setLoanPersonName(res.contact.name);
        if (res.contact.phone) setLoanPersonPhone(res.contact.phone);
        showMessage('Contact Selected', `Selected ${res.contact.name}`, 'whatsapp');
      }
    } catch (e: any) {
      showMessage('Picker Error', e?.message || 'Could not pick contact', 'error');
    } finally {
      setPickingContact(false);
    }
  };

  const openAddLoanModal = (loan?: Loan, defaultType: 'lent' | 'borrowed' = 'lent') => {
    if (loan) {
      setEditingLoanId(loan.id);
      setLoanType(loan.type);
      setLoanPersonName(loan.person_name || '');
      setLoanPersonPhone(loan.person_phone || '');
      setLoanAmount(String(loan.amount || ''));
      setLoanDate(formatToDDMMYYYY(loan.date));
      setLoanDueDate(loan.due_date ? formatToDDMMYYYY(loan.due_date) : '');
      setLoanNote(loan.note || '');
      setLoanAutoNotify(loan.auto_notify === 1);
    } else {
      setEditingLoanId(null);
      setLoanType(defaultType);
      setLoanPersonName('');
      setLoanPersonPhone('');
      setLoanAmount('');
      setLoanDate(getTodayDDMMYYYY());
      setLoanDueDate('');
      setLoanNote('');
      setLoanAutoNotify(true);
    }
    setShowLoanModal(true);
  };

  const handleSaveLoan = async () => {
    const trimmed = loanPersonName.trim();
    if (!trimmed) {
      showMessage('Validation Error', "Please enter the person's name", 'error');
      return;
    }
    const num = parseFloat(loanAmount);
    if (isNaN(num) || num <= 0) {
      showMessage('Validation Error', 'Please enter a valid amount', 'error');
      return;
    }
    setSavingLoan(true);
    try {
      const isoDate = formatToISO(loanDate) || getTodayISO();
      const isoDue = loanDueDate ? formatToISO(loanDueDate) : undefined;
      if (editingLoanId) {
        const existing = loans.find((l) => l.id === editingLoanId);
        await updateLoan(
          editingLoanId,
          trimmed,
          loanPersonPhone,
          loanType,
          num,
          existing?.amount_repaid || 0,
          isoDate,
          isoDue,
          loanNote
        );
        showMessage('Updated', 'Loan record updated', 'success');
      } else {
        await addLoan(
          trimmed,
          loanPersonPhone,
          loanType,
          num,
          isoDate,
          isoDue,
          loanNote,
          loanAutoNotify
        );
        showMessage('Saved', `Recorded ${loanType === 'lent' ? 'loan given' : 'loan taken'} of ${formatINR(num)}`, 'success');
      }
      setShowLoanModal(false);
    } catch (e: any) {
      showMessage('Save Error', e?.message || 'Could not save loan', 'error');
    } finally {
      setSavingLoan(false);
    }
  };

  const handleRecordRepayment = async () => {
    if (!repaymentLoan) return;
    const num = parseFloat(repaymentAmount);
    if (isNaN(num) || num <= 0) {
      showMessage('Invalid Amount', 'Please enter repayment amount', 'error');
      return;
    }
    setRecordingPay(true);
    try {
      await recordRepayment(repaymentLoan.id, num, sendReceipt);
      setShowRepaymentModal(false);
      showMessage('Repayment Recorded', `Recorded payment of ${formatINR(num)}`, 'success');
    } catch (e: any) {
      showMessage('Error', e?.message || 'Could not record repayment', 'error');
    } finally {
      setRecordingPay(false);
    }
  };

  const handleSendReminder = async () => {
    if (!reminderLoan) return;
    setSendingReminder(true);
    try {
      const ok = await sendReminder(reminderLoan, reminderStyle);
      setShowReminderModal(false);
      if (ok) {
        showMessage('WhatsApp Reminder Sent!', `Delivered reminder to ${reminderLoan.person_name}`, 'whatsapp');
      } else {
        showMessage('Reminder Dispatched', 'Queued reminder to WhatsApp', 'info');
      }
    } catch (e: any) {
      showMessage('Error', e?.message || 'Check WhatsApp connection', 'error');
    } finally {
      setSendingReminder(false);
    }
  };

  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (loanFilterTab === 'lent' && (l.type !== 'lent' || l.status === 'settled')) return false;
      if (loanFilterTab === 'borrowed' && (l.type !== 'borrowed' || l.status === 'settled')) return false;
      if (loanFilterTab === 'settled' && l.status !== 'settled') return false;

      if (loanSearchQuery.trim()) {
        const q = loanSearchQuery.toLowerCase();
        return (
          l.person_name.toLowerCase().includes(q) ||
          l.person_phone.toLowerCase().includes(q) ||
          (l.note && l.note.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [loans, loanFilterTab, loanSearchQuery]);

  // ================= RENDER SHOP CARD =================
  const renderShopCard = (shop: Shop) => {
    const due = shop.balance_due || 0;
    const isDue = due > 0;
    const isSettled = due === 0;

    return (
      <View
        key={shop.id}
        style={[
          styles.shopCard,
          isWide && styles.shopCardDesktop,
          isDue ? styles.shopCardDue : isSettled ? styles.shopCardSettled : styles.shopCardAdvance,
        ]}
      >
        <View style={styles.shopCardHeader}>
          <View style={[styles.shopAvatar, { backgroundColor: isDue ? '#FEE2E2' : '#DCFCE7' }]}>
            <MaterialCommunityIcons
              name={
                shop.category.includes('Milk') || shop.category.includes('Dairy')
                  ? 'cup'
                  : shop.category.includes('Medical')
                  ? 'medical-bag'
                  : shop.category.includes('Sabzi')
                  ? 'carrot'
                  : 'storefront'
              }
              size={22}
              color={isDue ? Colors.accent : Colors.success}
            />
          </View>

          <View style={styles.shopInfoWrap}>
            <Text style={styles.shopNameText}>{shop.name}</Text>
            <View style={styles.shopMetaRow}>
              {shop.person_name ? (
                <Text style={styles.shopPersonText}>👤 {shop.person_name}</Text>
              ) : null}
              {shop.phone ? (
                <Text style={styles.shopPhoneText}>📞 +{shop.phone}</Text>
              ) : null}
            </View>
            <Text style={styles.shopCategoryBadge}>{shop.category}</Text>
          </View>

          <View style={styles.shopBalanceWrap}>
            <Text
              style={[
                styles.shopBalanceAmount,
                { color: isDue ? Colors.accent : isSettled ? Colors.success : Colors.secondary },
              ]}
            >
              ₹{Math.abs(due).toLocaleString('en-IN')}
            </Text>
            <View
              style={[
                styles.shopStatusBadge,
                { backgroundColor: isDue ? '#FEE2E2' : isSettled ? '#DCFCE7' : '#E0E7FF' },
              ]}
            >
              <Text
                style={[
                  styles.shopStatusBadgeText,
                  { color: isDue ? '#991B1B' : isSettled ? '#166534' : '#3730A3' },
                ]}
              >
                {isDue ? t('shop_due_badge') : isSettled ? t('shop_settled_badge') : t('shop_advance_badge')}
              </Text>
            </View>
          </View>
        </View>

        {/* Totals Summary Row */}
        <View style={styles.shopTotalsRow}>
          <View style={styles.shopTotalItem}>
            <Text style={styles.shopTotalLabel}>{t('shop_total_purchased')}</Text>
            <Text style={styles.shopTotalVal}>₹{(shop.total_purchases || 0).toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.shopTotalDivider} />
          <View style={styles.shopTotalItem}>
            <Text style={styles.shopTotalLabel}>{t('shop_total_paid')}</Text>
            <Text style={[styles.shopTotalVal, { color: Colors.success }]}>
              ₹{(shop.total_payments || 0).toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.shopTotalDivider} />
          <View style={styles.shopTotalItem}>
            <Text style={styles.shopTotalLabel}>{t('shop_total_bills')}</Text>
            <Text style={styles.shopTotalVal}>{shop.entry_count || 0}</Text>
          </View>
        </View>

        {/* Last Item Info */}
        {shop.last_entry_items ? (
          <View style={styles.lastItemBox}>
            <MaterialCommunityIcons name="cart-outline" size={14} color="#B45309" />
            <Text style={styles.lastItemText} numberOfLines={1}>
              {shop.last_entry_date ? `${formatDisplayDate(shop.last_entry_date)}: ` : ''}
              {shop.last_entry_items}
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={styles.shopCardActions}>
          <Button
            mode="contained"
            icon="cart-plus"
            buttonColor={Colors.primary}
            textColor="#FFFFFF"
            onPress={() => handleOpenAddEntryModal(shop.id, 'purchase')}
            style={styles.actionBtnSmall}
            labelStyle={{ fontSize: 11, fontWeight: '700' }}
          >
            {t('shop_add_items_btn')}
          </Button>

          <Button
            mode="outlined"
            icon="cash-check"
            textColor={Colors.success}
            onPress={() => handleOpenAddEntryModal(shop.id, 'payment')}
            style={[styles.actionBtnSmall, { borderColor: Colors.success }]}
            labelStyle={{ fontSize: 11, fontWeight: '700' }}
          >
            {t('shop_add_payment_btn')}
          </Button>

          <Button
            mode="text"
            icon="book-open-page-variant"
            textColor={Colors.secondary}
            onPress={() => handleOpenPassbook(shop)}
            style={styles.actionBtnText}
            labelStyle={{ fontSize: 11, fontWeight: '700' }}
          >
            {t('shop_passbook_btn')}
          </Button>

          <TouchableOpacity
            style={styles.shopIconActionBtn}
            onPress={() => handleSendWhatsAppStatement(shop)}
          >
            <MaterialCommunityIcons name="whatsapp" size={20} color="#25D366" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shopIconActionBtn}
            onPress={() => handleExportShopPdf(shop)}
          >
            <MaterialCommunityIcons name="file-pdf-box" size={20} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shopIconActionBtn}
            onPress={() => handleOpenAddShopModal(shop)}
          >
            <MaterialCommunityIcons name="pencil-outline" size={17} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shopIconActionBtn}
            onPress={() => handleDeleteShop(shop)}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={17} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ================= MAIN RETURN =================
  return (
    <View style={styles.container}>
      {/* Top Main Mode Switcher: Shop Khata vs Personal Loans */}
      <View style={styles.topModeBar}>
        <TouchableOpacity
          style={[styles.mainTabBtn, viewMode === 'shop_khata' && styles.mainTabBtnActive]}
          onPress={() => setViewMode('shop_khata')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="storefront"
            size={18}
            color={viewMode === 'shop_khata' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[styles.mainTabText, viewMode === 'shop_khata' && styles.mainTabTextActive]}>
            {t('khata_tab_shop')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.mainTabBtn, viewMode === 'personal_loans' && styles.mainTabBtnActive]}
          onPress={() => setViewMode('personal_loans')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name="hand-coin"
            size={18}
            color={viewMode === 'personal_loans' ? '#FFFFFF' : Colors.textSecondary}
          />
          <Text style={[styles.mainTabText, viewMode === 'personal_loans' && styles.mainTabTextActive]}>
            {t('khata_tab_personal')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ================= VIEW 1: SHOP KHATA ================= */}
      {viewMode === 'shop_khata' && (
        <View style={{ flex: 1 }}>
          {/* Shop Financial Stats Overview */}
          <View style={styles.summaryBar}>
            <View style={[styles.summaryCard, { borderLeftColor: Colors.accent }]}>
              <Text style={styles.summaryLabel}>{t('shop_owe_label')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.accent }]}>
                ₹{shopStats.totalOwedAcrossAllShops.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.summarySub}>{shopStats.activeShopsCount} {t('shop_active_due_sub')}</Text>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: Colors.primary }]}>
              <Text style={styles.summaryLabel}>{t('shop_this_month_purchases')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.primary }]}>
                ₹{shopStats.thisMonthPurchases.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.summarySub}>{t('shop_this_month_purchases_sub')}</Text>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
              <Text style={styles.summaryLabel}>{t('shop_this_month_payments')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.success }]}>
                ₹{shopStats.thisMonthPayments.toLocaleString('en-IN')}
              </Text>
              <Text style={styles.summarySub}>{shopStats.totalShopsCount} {t('shop_total_shops_sub')}</Text>
            </View>
          </View>

          {/* Search & Category Filter */}
          <View style={styles.filterSection}>
            <TextInput
              placeholder={t('shop_search_placeholder')}
              value={shopSearch}
              onChangeText={setShopSearch}
              mode="outlined"
              dense
              style={styles.searchInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.primary}
              textColor={Colors.text}
              left={<TextInput.Icon icon="magnify" color={Colors.textSecondary} />}
              right={shopSearch ? <TextInput.Icon icon="close" onPress={() => setShopSearch('')} /> : undefined}
              theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
            />

            {/* Category Chips Scroll */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'all' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('all')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'all' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_all')} ({shops.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'due' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('due')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'due' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_due')} ({shopStats.activeShopsCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'Kirana / Ration' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('Kirana / Ration')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'Kirana / Ration' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_ration')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'Dairy / Milk' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('Dairy / Milk')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'Dairy / Milk' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_dairy')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'Sabzi / Veg' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('Sabzi / Veg')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'Sabzi / Veg' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_veg')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'Medical' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('Medical')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'Medical' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_medical')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catFilterChip, shopCategoryFilter === 'settled' && styles.catFilterChipActive]}
                onPress={() => setShopCategoryFilter('settled')}
              >
                <Text style={[styles.catFilterChipText, shopCategoryFilter === 'settled' && styles.catFilterChipTextActive]}>
                  {t('shop_filter_settled')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Shop List */}
          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshingShop}
                onRefresh={onRefresh}
                tintColor={Colors.primary}
                colors={[Colors.primary]}
              />
            }
          >
            {filteredShops.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="storefront-outline" size={60} color={Colors.border} />
                <Text style={styles.emptyText}>
                  {shopSearch ? t('shop_empty_search') : t('shop_empty_title')}
                </Text>
                <Text style={styles.emptySubtext}>{t('shop_empty_sub')}</Text>
                <Button
                  mode="contained"
                  icon="plus"
                  buttonColor={Colors.primary}
                  onPress={() => handleOpenAddShopModal()}
                  style={{ marginTop: Spacing.md }}
                >
                  {t('shop_add_first_btn')}
                </Button>
              </View>
            ) : (
              <View style={isWide ? styles.gridDesktop : null}>
                {filteredShops.map(renderShopCard)}
              </View>
            )}
          </ScrollView>

          {/* Floating Action Button */}
          <FAB
            icon="plus"
            label={t('shop_fab_add')}
            style={styles.fab}
            color="#FFFFFF"
            onPress={() => handleOpenAddShopModal()}
          />
        </View>
      )}

      {/* ================= VIEW 2: PERSONAL LOANS ================= */}
      {viewMode === 'personal_loans' && (
        <View style={{ flex: 1 }}>
          <View style={styles.summaryBar}>
            <View style={[styles.summaryCard, { borderLeftColor: Colors.success }]}>
              <Text style={styles.summaryLabel}>{t('loan_lent_label')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.success }]}>
                {formatINR(loanStats.totalLentPending)}
              </Text>
              <Text style={styles.summarySub}>{loanStats.activeLentCount} active</Text>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: Colors.accent }]}>
              <Text style={styles.summaryLabel}>{t('loan_borrowed_label')}</Text>
              <Text style={[styles.summaryValue, { color: Colors.accent }]}>
                {formatINR(loanStats.totalBorrowedPending)}
              </Text>
              <Text style={styles.summarySub}>{loanStats.activeBorrowedCount} active</Text>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: loanStats.netBalance >= 0 ? Colors.secondary : Colors.accent }]}>
              <Text style={styles.summaryLabel}>{t('loan_net_label')}</Text>
              <Text style={[styles.summaryValue, { color: loanStats.netBalance >= 0 ? Colors.secondary : Colors.accent }]}>
                {loanStats.netBalance >= 0 ? '+' : ''}{formatINR(loanStats.netBalance)}
              </Text>
              <Text style={styles.summarySub}>{loanStats.settledCount} settled</Text>
            </View>
          </View>

          <View style={styles.filterSection}>
            <SegmentedButtons
              value={loanFilterTab}
              onValueChange={(val) => setLoanFilterTab(val as LoanFilterTab)}
              buttons={[
                { value: 'lent', label: `Lent (${loanStats.activeLentCount})` },
                { value: 'borrowed', label: `Borrowed (${loanStats.activeBorrowedCount})` },
                { value: 'settled', label: `Settled (${loanStats.settledCount})` },
                { value: 'all', label: `All (${loanStats.totalCount})` },
              ]}
              style={styles.segmentedBtn}
              theme={{ colors: { secondaryContainer: Colors.secondaryBg, onSecondaryContainer: Colors.secondary } }}
            />

            <TextInput
              placeholder={t('loan_search_placeholder')}
              value={loanSearchQuery}
              onChangeText={setLoanSearchQuery}
              mode="outlined"
              dense
              style={styles.searchInput}
              outlineColor={Colors.border}
              activeOutlineColor={Colors.secondary}
              textColor={Colors.text}
              left={<TextInput.Icon icon="magnify" color={Colors.textSecondary} />}
              right={loanSearchQuery ? <TextInput.Icon icon="close" onPress={() => setLoanSearchQuery('')} /> : undefined}
              theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
            />
          </View>

          <ScrollView
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshingLoans}
                onRefresh={onRefresh}
                tintColor={Colors.secondary}
                colors={[Colors.secondary]}
              />
            }
          >
            {filteredLoans.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="hand-coin-outline" size={56} color={Colors.border} />
                <Text style={styles.emptyText}>{t('loan_empty_title')}</Text>
                <Text style={styles.emptySubtext}>{t('loan_empty_sub')}</Text>
              </View>
            ) : (
              <View style={isWide ? styles.gridDesktop : null}>
                {filteredLoans.map((item) => {
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
                          <Text style={styles.personPhone}>{item.person_phone ? `📞 +${item.person_phone}` : 'No phone'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.amountText, { color: isSettled ? Colors.textMuted : isLent ? Colors.success : Colors.accent }]}>
                            {isLent ? '+' : '-'}{formatINR(remaining)}
                          </Text>
                          <Text style={styles.originalAmount}>of {formatINR(item.amount)}</Text>
                        </View>
                      </View>

                      {!isSettled && (
                        <View style={styles.progressSection}>
                          <View style={styles.progressRow}>
                            <Text style={styles.progressLabel}>Repaid: {formatINR(item.amount_repaid || 0)} ({Math.round(progress * 100)}%)</Text>
                            <Text style={styles.progressLabel}>Pending: {formatINR(remaining)}</Text>
                          </View>
                          <ProgressBar progress={progress} color={isLent ? Colors.success : Colors.accent} style={styles.progressBar} />
                        </View>
                      )}

                      <View style={styles.detailsRow}>
                        <Text style={styles.detailText}>Given: {formatToDDMMYYYY(item.date)}</Text>
                        {item.due_date && <Text style={[styles.detailText, { color: Colors.secondary }]}>Due: {formatToDDMMYYYY(item.due_date)}</Text>}
                        <View style={[styles.statusBadge, isSettled ? styles.statusSettled : isLent ? styles.statusLent : styles.statusBorrowed]}>
                          <Text style={[styles.statusBadgeText, isSettled ? { color: Colors.textMuted } : isLent ? { color: Colors.success } : { color: Colors.accent }]}>
                            {isSettled ? 'Settled' : isLent ? 'You will get' : 'You owe'}
                          </Text>
                        </View>
                      </View>

                      {item.note && (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>📝 "{item.note}"</Text>
                        </View>
                      )}

                      <View style={styles.cardActions}>
                        {!isSettled && isLent && item.person_phone && (
                          <Button
                            mode="contained"
                            icon="whatsapp"
                            buttonColor="#25D366"
                            textColor="#FFFFFF"
                            onPress={() => {
                              setReminderLoan(item);
                              setReminderStyle('friendly');
                              setShowReminderModal(true);
                            }}
                            style={styles.actionBtnSmall}
                            labelStyle={{ fontSize: 11, fontWeight: '700' }}
                          >
                            WhatsApp
                          </Button>
                        )}
                        {!isSettled && (
                          <Button
                            mode="outlined"
                            icon="cash-plus"
                            textColor={Colors.secondary}
                            onPress={() => {
                              setRepaymentLoan(item);
                              setRepaymentAmount(String(remaining));
                              setShowRepaymentModal(true);
                            }}
                            style={[styles.actionBtnSmall, { borderColor: Colors.secondary }]}
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
                            onPress={() => {
                              confirmAction('Mark Settled', `Mark ${formatINR(remaining)} for ${item.person_name} as settled?`, async () => {
                                await markAsSettled(item.id, true);
                                showMessage('Settled', 'Cleared loan', 'success');
                              });
                            }}
                            style={styles.actionBtnSmall}
                            labelStyle={{ fontSize: 11, fontWeight: '700' }}
                          >
                            Settle
                          </Button>
                        )}
                        <TouchableOpacity onPress={() => openAddLoanModal(item)} style={styles.iconBtn}>
                          <MaterialCommunityIcons name="pencil-outline" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            confirmAction('Delete Loan', `Delete loan for ${item.person_name}?`, async () => {
                              await deleteLoan(item.id);
                              showMessage('Deleted', 'Loan removed', 'info');
                            });
                          }}
                          style={styles.iconBtn}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>

          <FAB
            icon="plus"
            label={t('loan_fab_add')}
            style={styles.fab}
            color="#FFFFFF"
            onPress={() => openAddLoanModal(undefined, loanFilterTab === 'borrowed' ? 'borrowed' : 'lent')}
          />
        </View>
      )}

      {/* ================= MODAL 1: ADD / EDIT SHOP ================= */}
      <Portal>
        <Modal
          visible={showShopModal}
          onDismiss={() => setShowShopModal(false)}
          contentContainerStyle={styles.modal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Modal Header with Close Button */}
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={styles.modalTitle}>
                    {editingShopId ? t('modal_shop_title_edit') : t('modal_shop_title_new')}
                  </Text>
                  <Text style={styles.modalSubtitle}>{t('modal_shop_sub')}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowShopModal(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <TextInput
                label={t('modal_shop_name_label')}
                value={shopNameInput}
                onChangeText={setShopNameInput}
                mode="outlined"
                placeholder={t('modal_shop_name_placeholder')}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <TextInput
                label={t('modal_shop_person_label')}
                value={shopPersonInput}
                onChangeText={setShopPersonInput}
                mode="outlined"
                placeholder={t('modal_shop_person_placeholder')}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <TextInput
                label={t('modal_shop_phone_label')}
                value={shopPhoneInput}
                onChangeText={setShopPhoneInput}
                mode="outlined"
                keyboardType="phone-pad"
                placeholder={t('modal_shop_phone_placeholder')}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <Text style={styles.sectionSubtitle}>{t('modal_shop_cat_subtitle')}</Text>
              <View style={styles.quickChipsWrap}>
                {['Kirana / Ration', 'Dairy / Milk', 'Sabzi / Veg', 'Medical', 'General Store', 'Other'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.modalCatChip, shopCatInput === cat && styles.modalCatChipActive]}
                    onPress={() => setShopCatInput(cat)}
                  >
                    <Text style={[styles.modalCatChipText, shopCatInput === cat && styles.modalCatChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                label={t('modal_shop_addr_label')}
                value={shopAddrInput}
                onChangeText={setShopAddrInput}
                mode="outlined"
                placeholder={t('modal_shop_addr_placeholder')}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={() => setShowShopModal(false)}
                  textColor={Colors.textSecondary}
                  style={styles.modalCancelBtn}
                >
                  {t('modal_shop_cancel')}
                </Button>
                <Button
                  mode="contained"
                  buttonColor={Colors.primary}
                  onPress={handleSaveShop}
                  loading={savingShop}
                  disabled={savingShop}
                  style={styles.modalSubmitBtn}
                >
                  {editingShopId ? t('modal_shop_save_edit') : t('modal_shop_save_new')}
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* ================= MODAL 2: ADD ITEMS / RECORD PAYMENT ================= */}
      <Portal>
        <Modal
          visible={showEntryModal}
          onDismiss={() => setShowEntryModal(false)}
          contentContainerStyle={styles.modal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Modal Header with Close Button */}
              <View style={styles.modalHeaderRow}>
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={styles.modalTitle}>
                    {entryType === 'purchase' ? t('modal_entry_title_purchase') : t('modal_entry_title_payment')}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    Shop: <Text style={{ fontWeight: '800', color: Colors.primary }}>{shops.find((s) => s.id === entryShopId)?.name}</Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEntryModal(false)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Toggle Entry Type */}
              <SegmentedButtons
                value={entryType}
                onValueChange={(val) => setEntryType(val as 'purchase' | 'payment')}
                buttons={[
                  { value: 'purchase', label: t('modal_entry_type_purchase') },
                  { value: 'payment', label: t('modal_entry_type_payment') },
                ]}
                style={{ marginBottom: Spacing.md }}
              />

              {/* Amount */}
              <TextInput
                label={t('modal_entry_amount_label')}
                value={entryAmount}
                onChangeText={setEntryAmount}
                mode="outlined"
                keyboardType="decimal-pad"
                placeholder="0.00"
                left={<TextInput.Affix text="₹ " />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface } }}
              />

              {/* If purchase: What items were bought? */}
              {entryType === 'purchase' && (
                <View style={{ marginBottom: Spacing.sm }}>
                  <TextInput
                    label={t('modal_entry_items_label')}
                    value={entryItems}
                    onChangeText={setEntryItems}
                    mode="outlined"
                    placeholder={t('modal_entry_items_placeholder')}
                    multiline
                    numberOfLines={2}
                    style={styles.modalInput}
                    outlineColor={Colors.border}
                    activeOutlineColor={Colors.primary}
                    textColor={Colors.text}
                    theme={{ colors: { background: Colors.surface } }}
                  />

                  {/* Fast Tap Item Chips in Horizontal Scroll */}
                  <Text style={styles.quickItemsLabel}>{t('modal_entry_fast_chips_label')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickChipsScroll}
                  >
                    {quickItems.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.quickItemChip}
                        onPress={() => handleAppendItemChip(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.quickItemChipText}>+ {item}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Date */}
              <DatePickerInput
                label={t('modal_entry_date_label')}
                value={entryDate}
                onChangeDate={(ddmm) => setEntryDate(ddmm)}
                style={styles.modalInput}
              />

              {/* Note / Slip # */}
              <TextInput
                label={entryType === 'purchase' ? t('modal_entry_note_purchase') : t('modal_entry_note_payment')}
                value={entryNote}
                onChangeText={setEntryNote}
                mode="outlined"
                placeholder={entryType === 'purchase' ? 'e.g. Slip #42 / Monthly list' : 'e.g. Paid via UPI / Cash'}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                theme={{ colors: { background: Colors.surface } }}
              />

              {/* Auto record in monthly expenses */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchTitle}>{t('modal_entry_sync_expense')}</Text>
                  <Text style={styles.switchSub}>{t('modal_entry_sync_expense_sub')}</Text>
                </View>
                <Switch
                  value={autoRecordExpense}
                  onValueChange={setAutoRecordExpense}
                  color={Colors.primary}
                />
              </View>

              <View style={styles.modalActions}>
                <Button
                  mode="outlined"
                  onPress={() => setShowEntryModal(false)}
                  textColor={Colors.textSecondary}
                  style={styles.modalCancelBtn}
                >
                  {t('common_cancel')}
                </Button>
                <Button
                  mode="contained"
                  buttonColor={Colors.primary}
                  onPress={handleSaveEntry}
                  loading={savingEntry}
                  disabled={savingEntry}
                  style={styles.modalSubmitBtn}
                >
                  {entryType === 'purchase' ? t('modal_entry_save_purchase') : t('modal_entry_save_payment')}
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* ================= MODAL 3: SHOP PASSBOOK / LEDGER ================= */}
      <Portal>
        <Modal
          visible={showPassbookModal && selectedShopForPassbook !== null}
          onDismiss={() => setShowPassbookModal(false)}
          contentContainerStyle={[styles.modal, styles.passbookModal]}
        >
          {selectedShopForPassbook && (
            <View style={{ flex: 1 }}>
              <View style={styles.passbookHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.passbookShopName}>{selectedShopForPassbook.name}</Text>
                  <Text style={styles.passbookPersonName}>
                    {selectedShopForPassbook.person_name ? `👤 ${selectedShopForPassbook.person_name} • ` : ''}
                    {selectedShopForPassbook.phone ? `📞 +${selectedShopForPassbook.phone}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowPassbookModal(false)} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              {/* Outstanding Balance Banner */}
              <View
                style={[
                  styles.passbookBalanceCard,
                  {
                    backgroundColor:
                      (selectedShopForPassbook.balance_due || 0) > 0
                        ? '#FEF2F2'
                        : (selectedShopForPassbook.balance_due || 0) === 0
                        ? '#F0FDF4'
                        : '#EFF6FF',
                  },
                ]}
              >
                <Text style={styles.passbookBalanceLabel}>{t('passbook_net_balance')}</Text>
                <Text
                  style={[
                    styles.passbookBalanceValue,
                    {
                      color:
                        (selectedShopForPassbook.balance_due || 0) > 0
                          ? Colors.accent
                          : (selectedShopForPassbook.balance_due || 0) === 0
                          ? Colors.success
                          : Colors.secondary,
                    },
                  ]}
                >
                  ₹{Math.abs(selectedShopForPassbook.balance_due || 0).toLocaleString('en-IN')}
                </Text>
                <Text style={styles.passbookBalanceSub}>
                  {(selectedShopForPassbook.balance_due || 0) > 0
                    ? t('passbook_status_due')
                    : (selectedShopForPassbook.balance_due || 0) === 0
                    ? t('passbook_status_settled')
                    : t('passbook_status_advance')}
                </Text>
              </View>

              {/* Passbook Top Quick Action Buttons */}
              <View style={styles.passbookActionsRow}>
                <TouchableOpacity
                  style={[styles.passbookActionBtn, { backgroundColor: Colors.primary }]}
                  onPress={() => handleOpenAddEntryModal(selectedShopForPassbook.id, 'purchase')}
                >
                  <MaterialCommunityIcons name="cart-plus" size={16} color="#FFFFFF" />
                  <Text style={styles.passbookActionBtnText}>{t('passbook_btn_items')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.passbookActionBtn, { backgroundColor: Colors.success }]}
                  onPress={() => handleOpenAddEntryModal(selectedShopForPassbook.id, 'payment')}
                >
                  <MaterialCommunityIcons name="cash-check" size={16} color="#FFFFFF" />
                  <Text style={styles.passbookActionBtnText}>{t('passbook_btn_pay')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.passbookActionBtn, { backgroundColor: '#25D366' }]}
                  onPress={() => handleSendWhatsAppStatement(selectedShopForPassbook)}
                >
                  <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
                  <Text style={styles.passbookActionBtnText}>{t('passbook_btn_whatsapp')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.passbookActionBtnOutlined]}
                  onPress={() => handleExportShopPdf(selectedShopForPassbook)}
                >
                  <MaterialCommunityIcons name="file-pdf-box" size={16} color={Colors.primary} />
                  <Text style={[styles.passbookActionBtnText, { color: Colors.primary }]}>{t('passbook_btn_pdf')}</Text>
                </TouchableOpacity>
              </View>

              {/* Entries Timeline List */}
              <Text style={styles.passbookEntriesTitle}>
                {t('passbook_timeline_title')} ({getEntriesForShop(selectedShopForPassbook.id).length})
              </Text>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {getEntriesForShop(selectedShopForPassbook.id).length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={44} color={Colors.textMuted} />
                    <Text style={{ marginTop: 8, color: Colors.textMuted, fontSize: 13 }}>
                      {t('passbook_empty')}
                    </Text>
                  </View>
                ) : (
                  getEntriesForShop(selectedShopForPassbook.id).map((entry) => {
                    const isPurchase = entry.type === 'purchase';
                    return (
                      <View key={entry.id} style={styles.passbookEntryCard}>
                        <View
                          style={[
                            styles.passbookEntryIcon,
                            { backgroundColor: isPurchase ? '#FEE2E2' : '#DCFCE7' },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={isPurchase ? 'cart' : 'cash-check'}
                            size={18}
                            color={isPurchase ? Colors.accent : Colors.success}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={styles.passbookEntryType}>
                              {isPurchase ? t('passbook_purchase_tag') : t('passbook_payment_tag')}
                            </Text>
                            <Text
                              style={[
                                styles.passbookEntryAmount,
                                { color: isPurchase ? Colors.accent : Colors.success },
                              ]}
                            >
                              {isPurchase ? '+' : '-'}₹{Number(entry.amount).toLocaleString('en-IN')}
                            </Text>
                          </View>
                          <Text style={styles.passbookEntryDate}>{formatDisplayDate(entry.date)}</Text>
                          {entry.items ? (
                            <Text style={styles.passbookEntryItems}>🛒 {entry.items}</Text>
                          ) : null}
                          {entry.note ? (
                            <Text style={styles.passbookEntryNote}>📝 {entry.note}</Text>
                          ) : null}
                        </View>
                        <TouchableOpacity
                          onPress={() => handleDeleteEntry(entry.id, selectedShopForPassbook.name)}
                          style={{ padding: 6, alignSelf: 'flex-start' }}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={17} color={Colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </Modal>
      </Portal>

      {/* ================= MODAL 4: PERSONAL LOAN MODAL ================= */}
      <Portal>
        <Modal
          visible={showLoanModal}
          onDismiss={() => setShowLoanModal(false)}
          contentContainerStyle={styles.modal}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                {editingLoanId ? 'Edit Loan Record' : 'Record New Loan / Debt'}
              </Text>

              <SegmentedButtons
                value={loanType}
                onValueChange={(val) => setLoanType(val as 'lent' | 'borrowed')}
                buttons={[
                  { value: 'lent', label: '💸 I Gave (Lent)' },
                  { value: 'borrowed', label: '🤝 I Took (Borrowed)' },
                ]}
                style={{ marginBottom: Spacing.md }}
              />

              <TouchableOpacity
                style={styles.pickContactBtn}
                onPress={handlePickPhoneContact}
                disabled={pickingContact}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="contacts" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.pickContactBtnText}>
                  {pickingContact ? 'Opening Phonebook...' : t('loan_pick_contacts')}
                </Text>
              </TouchableOpacity>

              <TextInput
                label={t('loan_person_name')}
                value={loanPersonName}
                onChangeText={setLoanPersonName}
                mode="outlined"
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <TextInput
                label={t('loan_person_phone')}
                value={loanPersonPhone}
                onChangeText={setLoanPersonPhone}
                mode="outlined"
                keyboardType="phone-pad"
                placeholder="e.g. 919876543210"
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <TextInput
                label={t('loan_amount')}
                value={loanAmount}
                onChangeText={setLoanAmount}
                mode="outlined"
                keyboardType="decimal-pad"
                placeholder="e.g. 5000"
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                theme={{ colors: { background: Colors.surface } }}
              />

              <View style={styles.modalRow}>
                <DatePickerInput
                  label={t('loan_date')}
                  value={loanDate}
                  onChangeDate={(ddmm) => setLoanDate(ddmm)}
                  style={{ flex: 1 }}
                />
                <DatePickerInput
                  label={t('loan_due_date')}
                  value={loanDueDate}
                  onChangeDate={(ddmm) => setLoanDueDate(ddmm)}
                  placeholder="DD/MM/YYYY"
                  style={{ flex: 1 }}
                />
              </View>

              <TextInput
                label={t('loan_note')}
                value={loanNote}
                onChangeText={setLoanNote}
                mode="outlined"
                placeholder="e.g. College fee, Rent advance, Emergency"
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.secondary}
                theme={{ colors: { background: Colors.surface } }}
              />

              {!editingLoanId && (
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.switchTitle}>{t('loan_whatsapp_notify')}</Text>
                    <Text style={styles.switchSub}>{t('loan_whatsapp_notify_sub')}</Text>
                  </View>
                  <Switch
                    value={loanAutoNotify}
                    onValueChange={setLoanAutoNotify}
                    color="#25D366"
                  />
                </View>
              )}

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setShowLoanModal(false)} textColor={Colors.textSecondary}>
                  {t('common_cancel')}
                </Button>
                <Button
                  mode="contained"
                  buttonColor={Colors.secondary}
                  onPress={handleSaveLoan}
                  loading={savingLoan}
                  disabled={savingLoan}
                >
                  {editingLoanId ? t('common_save') : t('loan_fab_add')}
                </Button>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </Portal>

      {/* ================= MODAL 5: REPAYMENT MODAL ================= */}
      <Portal>
        <Modal
          visible={showRepaymentModal}
          onDismiss={() => setShowRepaymentModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>{t('loan_repay_title')}</Text>
          <Text style={styles.modalSubtitle}>
            Person: <Text style={{ fontWeight: '700', color: Colors.text }}>{repaymentLoan?.person_name}</Text>
          </Text>

          <TextInput
            label={t('loan_repay_amount')}
            value={repaymentAmount}
            onChangeText={setRepaymentAmount}
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.modalInput}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.secondary}
            theme={{ colors: { background: Colors.surface } }}
          />

          {repaymentLoan?.person_phone ? (
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.switchTitle}>{t('loan_repay_receipt')}</Text>
                <Text style={styles.switchSub}>{t('loan_repay_receipt_sub')}</Text>
              </View>
              <Switch value={sendReceipt} onValueChange={setSendReceipt} color="#25D366" />
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShowRepaymentModal(false)} textColor={Colors.textSecondary}>
              {t('common_cancel')}
            </Button>
            <Button
              mode="contained"
              buttonColor={Colors.secondary}
              onPress={handleRecordRepayment}
              loading={recordingPay}
              disabled={recordingPay}
            >
              {t('common_confirm')}
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* ================= MODAL 6: REMINDER STYLE MODAL ================= */}
      <Portal>
        <Modal
          visible={showReminderModal}
          onDismiss={() => setShowReminderModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>{t('loan_reminder_title')}</Text>
          <Text style={styles.modalSubtitle}>
            To: <Text style={{ fontWeight: '700', color: Colors.text }}>{reminderLoan?.person_name}</Text> (+{reminderLoan?.person_phone})
          </Text>

          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: 8, marginBottom: 6 }}>
            {t('loan_reminder_tone')}
          </Text>
          <SegmentedButtons
            value={reminderStyle}
            onValueChange={(val) => setReminderStyle(val as ReminderStyle)}
            buttons={[
              { value: 'friendly', label: t('tone_friendly') },
              { value: 'firm', label: t('tone_firm') },
              { value: 'formal', label: t('tone_formal') },
            ]}
            style={{ marginBottom: Spacing.md }}
          />

          <View style={styles.modalActions}>
            <Button mode="outlined" onPress={() => setShowReminderModal(false)} textColor={Colors.textSecondary}>
              {t('common_cancel')}
            </Button>
            <Button
              mode="contained"
              buttonColor="#25D366"
              onPress={handleSendReminder}
              loading={sendingReminder}
              disabled={sendingReminder}
            >
              Send Reminder
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topModeBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  mainTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mainTabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  mainTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  mainTabTextActive: {
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  summaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '900',
    marginVertical: 2,
  },
  summarySub: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  filterSection: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    height: 40,
  },
  categoryScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingRight: Spacing.lg,
  },
  catFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catFilterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    ...Shadows.small,
  },
  catFilterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  catFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    padding: Spacing.md,
    paddingBottom: 110,
  },
  gridDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  shopCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  shopCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  shopCardDue: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  shopCardSettled: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  shopCardAdvance: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.secondary,
  },
  shopCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  shopAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopInfoWrap: {
    flex: 1,
  },
  shopNameText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.text,
  },
  shopMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  shopPersonText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  shopPhoneText: {
    fontSize: 11.5,
    color: Colors.textMuted,
  },
  shopCategoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: Colors.primaryBg,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 4,
  },
  shopBalanceWrap: {
    alignItems: 'flex-end',
  },
  shopBalanceAmount: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  shopStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 3,
  },
  shopStatusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  shopTotalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: Spacing.sm,
    alignItems: 'center',
  },
  shopTotalItem: {
    flex: 1,
    alignItems: 'center',
  },
  shopTotalLabel: {
    fontSize: 9.5,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  shopTotalVal: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 1,
  },
  shopTotalDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
  },
  lastItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: Spacing.xs,
  },
  lastItemText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  shopCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexWrap: 'wrap',
  },
  actionBtnSmall: {
    borderRadius: BorderRadius.md,
  },
  actionBtnText: {
    borderRadius: BorderRadius.md,
  },
  shopIconActionBtn: {
    padding: 6,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    gap: Spacing.xs,
  },
  emptyText: {
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  emptySubtext: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: 28,
    ...Shadows.large,
  },
  modal: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    maxWidth: 540,
    maxHeight: '85%',
    alignSelf: 'center',
    width: '92%',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  passbookModal: {
    maxHeight: '90%',
    height: 600,
  },
  modalTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  quickChipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  modalRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sectionSubtitle: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
  },
  quickChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  modalCatChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCatChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  modalCatChipText: {
    fontSize: 11,
    color: Colors.text,
    fontWeight: '600',
  },
  modalCatChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  quickItemsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  quickItemChip: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  },
  quickItemChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  switchSub: {
    fontSize: 10.5,
    color: Colors.textMuted,
    marginTop: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderColor: Colors.border,
  },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: BorderRadius.md,
  },
  pickContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    paddingVertical: 9,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  pickContactBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  passbookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.sm,
  },
  passbookShopName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
  },
  passbookPersonName: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  passbookBalanceCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    marginVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  passbookBalanceLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  passbookBalanceValue: {
    fontSize: 26,
    fontWeight: '900',
    marginVertical: 2,
    letterSpacing: -0.5,
  },
  passbookBalanceSub: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  passbookActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  passbookActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  passbookActionBtnOutlined: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  passbookActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  passbookEntriesTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  passbookEntryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  passbookEntryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  passbookEntryType: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  passbookEntryAmount: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  passbookEntryDate: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  passbookEntryItems: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 2,
  },
  passbookEntryNote: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  loanCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  loanCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  loanCardSettled: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.textMuted,
  },
  loanCardLent: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  loanCardBorrowed: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: Colors.text,
  },
  personPhone: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800',
  },
  originalAmount: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  progressSection: {
    marginVertical: Spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 10.5,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  detailText: {
    fontSize: 10.5,
    color: Colors.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  statusSettled: { backgroundColor: '#F1F5F9' },
  statusLent: { backgroundColor: '#DCFCE7' },
  statusBorrowed: { backgroundColor: '#FEE2E2' },
  noteBox: {
    backgroundColor: Colors.background,
    padding: 6,
    borderRadius: BorderRadius.sm,
    marginTop: 6,
  },
  noteText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    flexWrap: 'wrap',
  },
  iconBtn: {
    padding: 6,
  },
  segmentedBtn: {
    marginBottom: Spacing.xs,
  },
});
