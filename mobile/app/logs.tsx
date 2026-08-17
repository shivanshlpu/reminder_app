/**
 * Message History / Logs Screen — Light Theme
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMessageLogs, MessageLog } from '../hooks/useMessageLogs';
import { Colors, Spacing, BorderRadius, Fonts, Shadows } from '../constants/theme';

export default function LogsScreen() {
  const { logs, fetchLogs } = useMessageLogs();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent': return { name: 'check-circle-outline', color: Colors.success };
      case 'failed': return { name: 'close-circle-outline', color: Colors.error };
      default: return { name: 'clock-outline', color: Colors.warning };
    }
  };

  const renderLog = ({ item }: { item: MessageLog }) => {
    const statusIcon = getStatusIcon(item.status);
    const time = new Date(item.sent_at * 1000).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <View style={styles.logLocationBadge}>
            <MaterialCommunityIcons name="map-marker-outline" size={14} color={Colors.secondary} />
            <Text style={styles.logLocation}>{item.location_name}</Text>
          </View>
          <MaterialCommunityIcons
            name={statusIcon.name as any}
            size={20}
            color={statusIcon.color}
          />
        </View>

        <View style={styles.logBody}>
          <Text style={styles.logRecipient}>
            📱 {item.recipient_name} ({item.recipient_phone})
          </Text>
          <Text style={styles.logMessage} numberOfLines={2}>
            "{item.message_content}"
          </Text>
        </View>

        <View style={styles.logFooter}>
          <Text style={styles.logTime}>{time}</Text>
          <Text style={[styles.logStatus, { color: statusIcon.color }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>

        {item.error_message && (
          <Text style={styles.errorMsg}>❌ {item.error_message}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderLog}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="message-text-outline" size={54} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No message history</Text>
            <Text style={styles.emptySubtext}>
              Logs will appear here when WhatsApp auto-messages are triggered
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },
  logCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.small,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  logLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondaryBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  logLocation: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '700',
    color: Colors.secondary,
  },
  logBody: { marginBottom: Spacing.sm },
  logRecipient: {
    fontSize: Fonts.sizes.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  logMessage: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  logFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  logTime: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textMuted,
  },
  logStatus: {
    fontSize: Fonts.sizes.xs,
    fontWeight: '800',
  },
  errorMsg: {
    fontSize: Fonts.sizes.xs,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: Spacing.sm },
  emptyText: { fontSize: Fonts.sizes.lg, color: Colors.text, fontWeight: '700' },
  emptySubtext: { fontSize: Fonts.sizes.sm, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xxl },
});
