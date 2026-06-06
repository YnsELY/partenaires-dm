import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { supabase, Intervention, Role } from './supabase';

const DEVICE_ID_KEY = 'push_device_id';
const REMINDERS_KEY = 'agent_intervention_reminders';
const CLIENT_REMINDERS_KEY = 'client_intervention_reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistrationState = {
  loading: boolean;
  permission: Notifications.PermissionStatus | 'unknown';
  expoPushToken: string | null;
  error: string | null;
};

type ReminderStore = Record<string, { notificationId: string; scheduledAt: string }>;

export async function registerForPushNotifications(userId: string): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Les notifications push mobiles ne sont pas disponibles sur web.');
  }
  if (!Device.isDevice) {
    throw new Error('Un appareil physique est requis pour les notifications push.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notifications',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00236f',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error("Permission refusée pour les notifications.");
  }

  const projectId =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error('Project ID EAS introuvable. Lance une development build EAS.');
  }

  const expoPushToken = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;

  const deviceId = await getOrCreateDeviceId();
  const appVersion = Constants.expoConfig?.version ?? null;
  const deviceName = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || null;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: expoPushToken,
      device_id: deviceId,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
      device_name: deviceName,
      app_version: appVersion,
      is_active: true,
      disabled_at: null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,expo_push_token' }
  );
  if (error) throw new Error(error.message);

  return expoPushToken;
}

export async function deactivatePushToken(userId: string | null, expoPushToken?: string | null) {
  if (!userId) return;
  let query = supabase
    .from('push_tokens')
    .update({ is_active: false, disabled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);
  if (expoPushToken) query = query.eq('expo_push_token', expoPushToken);
  await query;
}

export async function dispatchNotification(type: string, entityId?: string, extra?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('dispatch-notification', {
    body: { type, entity_id: entityId, extra },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data;
}

export function notifyEvent(type: string, entityId?: string, extra?: Record<string, unknown>) {
  dispatchNotification(type, entityId, extra).catch((e) => {
    console.warn('[notifications] dispatch failed', type, e?.message ?? e);
  });
}

export async function sendTestNotification() {
  return dispatchNotification('test');
}

export function observeNotificationResponses(role: Role | null) {
  const routeFromLastResponse = () => {
    const response = Notifications.getLastNotificationResponse();
    if (response) openNotificationResponse(response, role);
  };
  routeFromLastResponse();
  return Notifications.addNotificationResponseReceivedListener((response) => {
    openNotificationResponse(response, role);
  });
}

/**
 * Planifie des rappels locaux 1h avant chaque intervention « scheduled » à
 * venir, et nettoie ceux qui ne sont plus d'actualité. Mutualisé entre l'agent
 * et le client (clés de stockage et libellés distincts).
 */
async function syncInterventionReminders(
  interventions: Intervention[],
  opts: { storeKey: string; title: string; body: string; screen: string }
) {
  if (Platform.OS === 'web') return;
  const now = Date.now();
  const nextStore: ReminderStore = {};
  const existing = await readReminderStore(opts.storeKey);
  const eligible = interventions.filter((iv) => iv.status === 'scheduled');
  const eligibleIds = new Set(eligible.map((iv) => iv.id));

  for (const [interventionId, reminder] of Object.entries(existing)) {
    if (!eligibleIds.has(interventionId)) {
      await Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => undefined);
    }
  }

  for (const iv of eligible) {
    const reminderAt = new Date(iv.scheduled_at).getTime() - 60 * 60 * 1000;
    if (reminderAt <= now) continue;

    const existingReminder = existing[iv.id];
    if (existingReminder?.scheduledAt === iv.scheduled_at) {
      nextStore[iv.id] = existingReminder;
      continue;
    }
    if (existingReminder) {
      await Notifications.cancelScheduledNotificationAsync(existingReminder.notificationId).catch(() => undefined);
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        data: { screen: opts.screen, interventionId: iv.id, eventType: 'intervention_reminder' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(reminderAt),
        channelId: 'default',
      },
    });
    nextStore[iv.id] = { notificationId, scheduledAt: iv.scheduled_at };
  }

  await SecureStore.setItemAsync(opts.storeKey, JSON.stringify(nextStore));
}

export async function syncAgentInterventionReminders(interventions: Intervention[]) {
  return syncInterventionReminders(interventions, {
    storeKey: REMINDERS_KEY,
    title: 'Intervention à venir',
    body: 'Votre intervention commence dans 1 heure.',
    screen: 'agent_mission',
  });
}

export async function syncClientInterventionReminders(interventions: Intervention[]) {
  return syncInterventionReminders(interventions, {
    storeKey: CLIENT_REMINDERS_KEY,
    title: 'Intervention prévue',
    body: 'Une intervention est prévue sur votre site dans 1 heure.',
    screen: 'client_intervention',
  });
}

function openNotificationResponse(
  response: Notifications.NotificationResponse,
  role: Role | null
) {
  const data = response.notification.request.content.data;
  const href = hrefForNotificationData(data, role);
  if (href) router.push(href as any);
}

function hrefForNotificationData(data: Record<string, unknown>, role: Role | null): string | null {
  const screen = typeof data.screen === 'string' ? data.screen : null;
  const interventionId = typeof data.interventionId === 'string' ? data.interventionId : null;
  const incidentId = typeof data.incidentId === 'string' ? data.incidentId : null;
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null;
  const siteId = typeof data.siteId === 'string' ? data.siteId : null;

  if (screen === 'admin_home' && role === 'admin') return '/(admin)/(tabs)/home';
  if (screen === 'agent_home' && role === 'agent') return '/(agent)/(tabs)/home';
  if (screen === 'client_home' && role === 'client') return '/(client)/(tabs)/home';

  if (screen === 'admin_planning' && role === 'admin') return '/(admin)/(tabs)/planning';

  if (screen === 'agent_mission' && role === 'agent' && interventionId) {
    return `/(agent)/mission/${interventionId}`;
  }
  if (screen === 'admin_validation' && role === 'admin' && interventionId) {
    return `/(admin)/validation?intervention_id=${interventionId}`;
  }
  if (screen === 'client_intervention' && role === 'client' && interventionId) {
    return `/(client)/intervention/${interventionId}`;
  }

  if ((screen === 'admin_incident' || screen === 'incident_detail') && role === 'admin' && incidentId) {
    return `/(admin)/incident/${incidentId}`;
  }
  if ((screen === 'agent_incident' || screen === 'incident_detail') && role === 'agent' && incidentId) {
    return `/(agent)/incident/${incidentId}`;
  }
  if ((screen === 'client_incident' || screen === 'incident_detail') && role === 'client' && incidentId) {
    return `/(client)/incident/${incidentId}`;
  }

  if (screen === 'conversation' && conversationId) {
    if (role === 'admin') return `/(admin)/conversation/${conversationId}`;
    if (role === 'agent') return `/(agent)/conversation/${conversationId}`;
    if (role === 'client') return `/(client)/conversation/${conversationId}`;
  }

  if (screen === 'client_site' && role === 'client' && siteId) {
    return `/(client)/chantier/${siteId}`;
  }

  return null;
}

async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

async function readReminderStore(storeKey: string): Promise<ReminderStore> {
  const raw = await SecureStore.getItemAsync(storeKey).catch(() => null);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ReminderStore;
  } catch {
    return {};
  }
}
