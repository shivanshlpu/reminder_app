/**
 * Hook for message log operations.
 */
import { useState, useEffect, useCallback } from 'react';
import { useDatabase } from '../contexts/DatabaseContext';
import { useAuth } from '../contexts/AuthContext';

export interface MessageLog {
  id: number;
  user_id: string;
  location_id: number | null;
  contact_id: number | null;
  location_name: string;
  recipient_name: string;
  recipient_phone: string;
  message_content: string;
  status: 'pending' | 'sent' | 'failed';
  error_message: string | null;
  sent_at: number;
}

export function useMessageLogs() {
  const { db, isReady } = useDatabase();
  const { user } = useAuth();
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async (limit: number = 50, showSpinner = false) => {
    if (!db || !user) return;
    if (showSpinner || logs.length === 0) {
      setLoading(true);
    }
    try {
      const result = await db.getAllAsync<MessageLog>(
        'SELECT * FROM message_logs WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?',
        [user.uid, limit]
      );
      setLogs(result || []);
    } catch (error) {
      console.error('Failed to fetch message logs:', error);
    } finally {
      setLoading(false);
    }
  }, [db, user, logs.length]);

  const addLog = useCallback(async (
    locationId: number | null,
    contactId: number | null,
    locationName: string,
    recipientName: string,
    recipientPhone: string,
    messageContent: string,
    status: 'pending' | 'sent' | 'failed' = 'pending',
    errorMessage?: string
  ) => {
    if (!db || !user) return;
    await db.runAsync(
      `INSERT INTO message_logs 
        (user_id, location_id, contact_id, location_name, recipient_name, recipient_phone, message_content, status, error_message) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.uid, locationId, contactId, locationName, recipientName, recipientPhone, messageContent, status, errorMessage || null]
    );
    await fetchLogs(50, false);
  }, [db, user, fetchLogs]);

  const updateLogStatus = useCallback(async (
    id: number,
    status: 'sent' | 'failed',
    errorMessage?: string
  ) => {
    if (!db) return;
    await db.runAsync(
      'UPDATE message_logs SET status = ?, error_message = ? WHERE id = ?',
      [status, errorMessage || null, id]
    );
    await fetchLogs(50, false);
  }, [db, fetchLogs]);

  useEffect(() => {
    if (isReady) {
      fetchLogs();
    }
  }, [isReady, fetchLogs]);

  return {
    logs,
    loading,
    fetchLogs,
    addLog,
    updateLogStatus,
  };
}
