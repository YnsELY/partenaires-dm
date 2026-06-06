import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushData = Record<string, unknown>;

export type PushPayload = {
  eventType: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  recipientUserIds: string[];
  title: string;
  body: string;
  data?: PushData;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

export async function sendNotificationEvent(
  admin: SupabaseClient,
  payload: PushPayload
): Promise<{ ok: boolean; eventId?: string; status: string; sent: number }> {
  const recipients = Array.from(new Set(payload.recipientUserIds.filter(Boolean)));
  const baseData = {
    ...(payload.data ?? {}),
    eventType: payload.eventType,
    entityType: payload.entityType ?? null,
    entityId: payload.entityId ?? null,
  };

  if (recipients.length === 0) {
    const eventId = await insertEvent(admin, payload, recipients, 'no_tokens', [], null, baseData);
    return { ok: true, eventId, status: 'no_tokens', sent: 0 };
  }

  const { data: tokenRows, error: tokenErr } = await admin
    .from('push_tokens')
    .select('id, user_id, expo_push_token')
    .in('user_id', recipients)
    .eq('is_active', true);

  if (tokenErr) {
    const eventId = await insertEvent(
      admin,
      payload,
      recipients,
      'error',
      [],
      tokenErr.message,
      baseData
    );
    return { ok: false, eventId, status: 'error', sent: 0 };
  }

  const tokens = ((tokenRows ?? []) as PushTokenRow[]).filter((row) =>
    isExpoPushToken(row.expo_push_token)
  );

  if (tokens.length === 0) {
    const eventId = await insertEvent(admin, payload, recipients, 'no_tokens', [], null, baseData);
    return { ok: true, eventId, status: 'no_tokens', sent: 0 };
  }

  const tickets: Array<ExpoTicket & { token_id?: string; user_id?: string }> = [];
  let hardError: string | null = null;

  for (const chunk of chunkArray(tokens, 100)) {
    const messages = chunk.map((row) => ({
      to: row.expo_push_token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: baseData,
      channelId: 'default',
      priority: 'high',
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      const json = await res.json().catch(() => ({}));
      const expoTickets = Array.isArray(json?.data) ? json.data : [];

      for (let i = 0; i < chunk.length; i++) {
        const ticket = (expoTickets[i] ?? {
          status: 'error',
          message: json?.errors?.[0]?.message ?? `Expo push HTTP ${res.status}`,
        }) as ExpoTicket;
        tickets.push({
          ...ticket,
          token_id: chunk[i].id,
          user_id: chunk[i].user_id,
        });
      }

      if (!res.ok && !hardError) {
        hardError = json?.errors?.[0]?.message ?? `Expo push HTTP ${res.status}`;
      }
    } catch (e) {
      hardError = e instanceof Error ? e.message : String(e);
      for (const row of chunk) {
        tickets.push({
          status: 'error',
          message: hardError,
          token_id: row.id,
          user_id: row.user_id,
        });
      }
    }
  }

  const deadTokenIds = tickets
    .filter((ticket) => ticket.details?.error === 'DeviceNotRegistered' && ticket.token_id)
    .map((ticket) => ticket.token_id as string);
  if (deadTokenIds.length > 0) {
    await admin
      .from('push_tokens')
      .update({ is_active: false, disabled_at: new Date().toISOString() })
      .in('id', deadTokenIds);
  }

  const hasErrors = tickets.some((ticket) => ticket.status === 'error');
  const status = hasErrors ? 'partial_error' : 'sent';
  const eventId = await insertEvent(
    admin,
    payload,
    recipients,
    status,
    tickets,
    hardError,
    baseData
  );

  return {
    ok: !hasErrors,
    eventId,
    status,
    sent: tickets.filter((ticket) => ticket.status === 'ok').length,
  };
}

async function insertEvent(
  admin: SupabaseClient,
  payload: PushPayload,
  recipients: string[],
  status: string,
  tickets: unknown[],
  error: string | null,
  data: PushData
): Promise<string | undefined> {
  const { data: inserted } = await admin
    .from('notification_events')
    .insert({
      event_type: payload.eventType,
      actor_id: payload.actorId ?? null,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      recipient_user_ids: recipients,
      title: payload.title,
      body: payload.body,
      data,
      status,
      recipient_count: recipients.length,
      ticket_count: tickets.length,
      tickets: tickets.length > 0 ? tickets : null,
      error,
      sent_at: status === 'sent' || status === 'partial_error' ? new Date().toISOString() : null,
    })
    .select('id')
    .maybeSingle();
  return (inserted as { id?: string } | null)?.id;
}

export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
