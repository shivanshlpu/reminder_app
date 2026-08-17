/**
 * Contacts Screen — WhatsApp Alert Recipients with Smart Phone Number Validation & In-App Toast
 */
import React, { useState } from 'react';
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
import { FAB, Modal, Portal, TextInput, Button, Switch } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useContacts, Contact } from '../../hooks/useContacts';
import { confirmAction, showMessage } from '../../utils/dialogs';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../../constants/theme';

export default function ContactsScreen() {
  const { contacts, fetchContacts, addContact, updateContact, deleteContact } = useContacts();
  const { isWide } = useResponsiveLayout();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const openAddModal = (contact?: Contact) => {
    if (contact) {
      setEditingId(contact.id);
      setContactName(contact.name);
      setPhone(contact.phone);
      setIsGroup(contact.is_group === 1);
      setGroupId(contact.group_id || '');
    } else {
      setEditingId(null);
      setContactName('');
      setPhone('');
      setIsGroup(false);
      setGroupId('');
    }
    setShowAddModal(true);
  };

  const handleSave = async () => {
    const trimmedName = contactName.trim();
    if (!trimmedName) {
      showMessage('Missing Name', 'Please enter a contact name (e.g. "Mom", "Dad", "Roommate")', 'error');
      return;
    }
    if (!phone.trim()) {
      showMessage('Missing Number', 'Please enter a phone number (or Group JID)', 'error');
      return;
    }

    let cleanPhone = phone.replace(/\D/g, '');

    // Auto-prepend 91 if 10-digit Indian number is entered
    if (!isGroup) {
      if (cleanPhone.length === 10) {
        cleanPhone = `91${cleanPhone}`;
      } else if (cleanPhone.length < 10) {
        showMessage('Invalid Number', 'Please enter a full 10-digit mobile number (e.g. 9009149694)', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateContact(editingId, trimmedName, cleanPhone, isGroup, groupId || undefined);
        showMessage('Contact Updated', `Updated "${trimmedName}" (+${cleanPhone})`, 'whatsapp');
      } else {
        await addContact(trimmedName, cleanPhone, isGroup, groupId || undefined);
        showMessage('Contact Saved', `Added "${trimmedName}" (+${cleanPhone}) to alert list`, 'whatsapp');
      }
      setShowAddModal(false);
    } catch (error: any) {
      showMessage('Error', error?.message || 'Failed to save contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number, name: string) => {
    confirmAction(
      'Delete Contact',
      `Are you sure you want to remove "${name}" from your WhatsApp alert list?`,
      async () => {
        await deleteContact(id);
        showMessage('Contact Removed', `"${name}" removed from alert list`, 'info');
      }
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
  };

  const renderContactCard = (item: Contact) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.contactCard, isWide && styles.contactCardDesktop]}
      onPress={() => openAddModal(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.contactAvatar, { backgroundColor: item.is_group ? Colors.accent + '15' : Colors.primary + '15' }]}>
        <MaterialCommunityIcons
          name={item.is_group ? 'account-group' : 'whatsapp'}
          size={22}
          color={item.is_group ? Colors.accent : Colors.primary}
        />
      </View>
      <View style={styles.contactInfo}>
        <View style={styles.contactNameRow}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.is_group === 1 && (
            <View style={styles.groupBadge}>
              <Text style={styles.groupBadgeText}>Group</Text>
            </View>
          )}
        </View>
        <Text style={styles.contactPhone}>+{item.phone}</Text>
      </View>
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation?.();
          handleDelete(item.id, item.name);
        }}
        style={styles.deleteBtn}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={20} color={Colors.accent} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        {contacts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-plus-outline" size={54} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No contacts added</Text>
            <Text style={styles.emptySubtext}>Add contacts or WhatsApp groups to receive automated gate arrival messages</Text>
            <Button mode="contained" buttonColor={Colors.primary} onPress={() => openAddModal()} style={{ marginTop: Spacing.md }}>
              + Add WhatsApp Contact
            </Button>
          </View>
        ) : (
          <View style={isWide ? styles.gridDesktop : undefined}>
            {contacts.map(renderContactCard)}
          </View>
        )}
      </ScrollView>

      <FAB icon="plus" style={styles.fab} onPress={() => openAddModal()} color="#FFFFFF" customSize={56} />

      {/* Add / Edit Contact Modal */}
      <Portal>
        <Modal visible={showAddModal} onDismiss={() => setShowAddModal(false)} contentContainerStyle={styles.modal}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Recipient' : 'Add WhatsApp Recipient'}
              </Text>

              <TextInput
                label="Name / Label"
                value={contactName}
                onChangeText={setContactName}
                mode="outlined"
                placeholder='e.g. "Mom", "Dad", "Hostel Roommate"'
                left={<TextInput.Icon icon="account-outline" color={Colors.textSecondary} />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />

              <TextInput
                label="WhatsApp Phone Number"
                value={phone}
                onChangeText={setPhone}
                mode="outlined"
                placeholder='e.g. 9009149694 or 919009149694'
                keyboardType="phone-pad"
                left={<TextInput.Icon icon="whatsapp" color={Colors.primary} />}
                style={styles.modalInput}
                outlineColor={Colors.border}
                activeOutlineColor={Colors.primary}
                textColor={Colors.text}
                theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
              />
              <Text style={styles.phoneHint}>
                💡 10-digit numbers automatically get Indian country code (+91).
              </Text>

              <View style={styles.groupToggleRow}>
                <Text style={styles.groupToggleLabel}>Is this a WhatsApp Group?</Text>
                <Switch value={isGroup} onValueChange={setIsGroup} color={Colors.primary} />
              </View>

              {isGroup && (
                <TextInput
                  label="Group JID (optional)"
                  value={groupId}
                  onChangeText={setGroupId}
                  mode="outlined"
                  placeholder="e.g. 120363041234567890@g.us"
                  style={styles.modalInput}
                  outlineColor={Colors.border}
                  activeOutlineColor={Colors.primary}
                  textColor={Colors.text}
                  theme={{ colors: { background: Colors.surface, onSurfaceVariant: Colors.textSecondary } }}
                />
              )}

              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setShowAddModal(false)} textColor={Colors.textSecondary} style={styles.modalBtn}>
                  Cancel
                </Button>
                <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving} buttonColor={Colors.primary} style={styles.modalBtn}>
                  Save Recipient
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
  listContent: { padding: Spacing.lg, paddingBottom: 100 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  contactCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  contactCardDesktop: {
    width: '48.5%',
    marginBottom: 0,
  },
  contactAvatar: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  contactInfo: { flex: 1 },
  contactNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  contactName: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.text },
  groupBadge: {
    backgroundColor: Colors.accent + '20',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  groupBadgeText: { fontSize: 10, color: Colors.accent, fontWeight: '700' },
  contactPhone: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  deleteBtn: { padding: 8 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: Fonts.sizes.lg, color: Colors.text, fontWeight: '700' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xxl },
  fab: { position: 'absolute', right: Spacing.lg, bottom: Spacing.lg, backgroundColor: Colors.primary, borderRadius: 28, ...Shadows.large },
  modal: { backgroundColor: Colors.surface, margin: Spacing.md, maxWidth: 500, maxHeight: '85%', alignSelf: 'center', width: '90%', borderRadius: BorderRadius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.lg },
  modalInput: { backgroundColor: Colors.surface, marginBottom: Spacing.md },
  phoneHint: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginTop: -Spacing.sm, marginBottom: Spacing.md },
  groupToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  groupToggleLabel: { fontSize: Fonts.sizes.md, color: Colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md },
  modalBtn: { borderRadius: BorderRadius.md },
});
