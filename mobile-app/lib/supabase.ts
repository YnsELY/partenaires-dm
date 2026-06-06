import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Affiche un avertissement clair pendant le dev plutôt qu'un crash silencieux
  // ailleurs dans le code.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY manquant. ' +
      'Crée un fichier mobile-app/.env (voir .env.example).'
  );
}

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : (SecureStoreAdapter as any),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export type Role = 'admin' | 'agent' | 'client';

export type AppConfig = {
  id: boolean;
  min_supported_version: string;
  ios_app_url: string | null;
  android_app_url: string | null;
  update_message: string | null;
  updated_at: string;
};

export type Profile = {
  id: string;
  role: Role;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  client_id: string | null;
  created_at: string;
};

export type Intervention = {
  id: string;
  site_id: string;
  agent_id: string | null;
  team_id: string | null;
  scheduled_at: string;
  started_at: string | null;
  submitted_at: string | null;
  validated_at: string | null;
  status:
    | 'scheduled'
    | 'in_progress'
    | 'pending_validation'
    | 'validated'
    | 'rejected';
  agent_notes: string | null;
  admin_summary: string | null;
  admin_details: string | null;
  admin_notes: string | null;
  global_result: 'ok' | 'to_improve' | null;
  pdf_url: string | null;
  created_at: string;
};

export type Site = {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  service_type: string | null;
  description: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type Frequency = 'H' | 'M' | 'A' | 'OnDemand';

export type ChecklistTask = {
  id: string;
  site_id: string;
  intervention_id: string | null;
  label: string;
  zone: string | null;
  order_index: number;
  frequency: Frequency | null;
  frequency_count: number | null;
  catalog_service_id: string | null;
};

export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  order_index: number;
  created_at: string;
};

export type CatalogService = {
  id: string;
  category_id: string;
  label: string;
  frequency: Frequency | null;
  frequency_count: number;
  note: string | null;
  order_index: number;
  created_at: string;
};

export type ChecklistResult = {
  id: string;
  intervention_id: string;
  task_id: string;
  is_done: boolean;
  zone: string | null;
};

export type Media = {
  id: string;
  intervention_id: string;
  incident_id: string | null;
  url: string;
  type: 'before' | 'after' | 'anomaly';
  zone: string | null;
  is_validated: boolean;
  taken_at: string;
  expires_at: string;
  created_at: string;
};

export type Client = {
  id: string;
  name: string;
  logo_url: string | null;
  contract_type: string | null;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  zone: string | null;
  is_active: boolean;
  created_at: string;
};

export type TeamMember = {
  team_id: string;
  agent_id: string;
};

export type InterventionAgent = {
  intervention_id: string;
  agent_id: string;
  created_at: string;
};

export type SiteAgent = {
  site_id: string;
  agent_id: string;
  created_at: string;
};

export type IncidentStatus =
  | 'open'
  | 'assigned'
  | 'in_progress'
  | 'pending_validation'
  | 'resolved'
  | 'closed';

export type Incident = {
  id: string;
  intervention_id: string | null;
  site_id: string;
  reported_by: string;
  reporter_role: 'agent' | 'client';
  zone: string | null;
  description: string | null;
  photo_url: string | null;
  status: IncidentStatus;
  admin_notes: string | null;
  assigned_agent_id: string | null;
  agent_resolution_notes: string | null;
  closed_at: string | null;
  created_at: string;
};

export type ClientSiteAccess = {
  client_profile_id: string;
  site_id: string;
  created_at: string;
};

export type Evaluation = {
  id: string;
  intervention_id: string;
  client_profile_id: string;
  rating: number | null;
  satisfaction: 'satisfied' | 'to_improve' | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type PushToken = {
  id: string;
  user_id: string;
  expo_push_token: string;
  device_id: string | null;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  device_name: string | null;
  app_version: string | null;
  is_active: boolean;
  last_seen_at: string;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEvent = {
  id: string;
  event_type: string;
  actor_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  recipient_user_ids: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: 'created' | 'sent' | 'partial_error' | 'no_tokens' | 'error';
  recipient_count: number;
  ticket_count: number;
  tickets: unknown | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  admin_id: string;
  /** L'un de `agent_id` ou `client_id` est défini ; jamais les deux (CHECK XOR). */
  agent_id: string | null;
  client_id: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};
