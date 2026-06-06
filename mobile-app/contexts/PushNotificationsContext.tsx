import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import {
  observeNotificationResponses,
  PushRegistrationState,
  registerForPushNotifications,
  sendTestNotification,
} from '../lib/notifications';

type PushContextValue = PushRegistrationState & {
  refreshRegistration: () => Promise<void>;
  sendTest: () => Promise<void>;
};

const PushNotificationsContext = createContext<PushContextValue | null>(null);

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const role = profile?.role ?? null;

  const [state, setState] = useState<PushRegistrationState>({
    loading: false,
    permission: 'unknown',
    expoPushToken: null,
    error: null,
  });

  const refreshRegistration = useCallback(async () => {
    if (!userId) {
      setState({ loading: false, permission: 'unknown', expoPushToken: null, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const token = await registerForPushNotifications(userId);
      const permissions = await Notifications.getPermissionsAsync();
      setState({
        loading: false,
        permission: permissions.status,
        expoPushToken: token,
        error: null,
      });
    } catch (e) {
      const permissions = await Notifications.getPermissionsAsync().catch(() => null);
      setState({
        loading: false,
        permission: permissions?.status ?? 'unknown',
        expoPushToken: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [userId]);

  useEffect(() => {
    refreshRegistration();
  }, [refreshRegistration]);

  useEffect(() => {
    const subscription = observeNotificationResponses(role);
    return () => subscription.remove();
  }, [role]);

  const sendTest = useCallback(async () => {
    await sendTestNotification();
  }, []);

  return (
    <PushNotificationsContext.Provider value={{ ...state, refreshRegistration, sendTest }}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications() {
  const ctx = useContext(PushNotificationsContext);
  if (!ctx) {
    throw new Error('usePushNotifications must be used inside PushNotificationsProvider');
  }
  return ctx;
}
