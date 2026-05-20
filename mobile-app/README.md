# Les Partenaires DM — Application mobile

Application mobile React Native + TypeScript + **Expo SDK 54** + Expo Router 6, branchée
sur Supabase pour les flux **Agent** et **Admin**. Login/inscription email + mot de passe
avec sélecteur de rôle (Admin / Agent / Client).

> **État actuel** :
> - **Agent** : auth, missions, checklist, photos avant/après, soumission. ✅
> - **Admin** : dashboard stats, gestion clients/sites/agents/équipes, planification
>   d'interventions, validation/rejet (photo par photo), gestion incidents. ✅
> - **Client** : home + sites accessibles, photos validées par zone (60j),
>   détail intervention + évaluation, signalement d'incident, rapports. ✅

---

## 1. Prérequis

- Node.js 20 LTS
- App **Expo Go** sur ton smartphone (mêmes Wi-Fi que le PC)
- Un projet **Supabase** (gratuit) — https://supabase.com/dashboard
- (Optionnel) **Supabase CLI** pour `supabase db push` / `supabase functions deploy`

---

## 2. Installation

```powershell
cd mobile-app
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
npx expo install --check
```

Si `expo install --check` propose des bumps, accepte avec `Y`.

---

## 3. Configuration Supabase

### 3.1 Variables d'environnement
Copie le fichier d'exemple et remplis-le :

```powershell
Copy-Item .env.example .env
```

Renseigne `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY`
depuis **Supabase Dashboard → Project Settings → API**.

### 3.2 Migrations SQL

Sept migrations dans [`supabase/migrations/`](../supabase/migrations/), à appliquer dans l'ordre :

1. `0001_init_agent.sql` — tables `profiles`, `clients`, `teams`, `team_members`,
   `sites`, `checklist_tasks`, `interventions`, `checklist_results`, `media`, `incidents`.
2. `0002_rls_agent.sql` — RLS et policies **Agent** (lecture des sites/interventions
   assignés, écriture sur ses checklist_results et media, etc.).
3. `0003_storage_media.sql` — bucket privé `media` + policies pour que chaque agent
   ne touche qu'à ses propres fichiers (`agent/{uid}/...`).
4. `0004_admin_rls.sql` — helper `is_admin()` + policies **Admin** sur toutes les tables
   (CRUD sur clients/sites/teams/interventions, SELECT sur checklist_results,
   UPDATE sur media.is_validated, etc.).
5. `0005_admin_storage.sql` — policies Storage admin (peut voir et supprimer toutes
   les photos du bucket `media`).
6. `0006_init_client.sql` — tables `client_site_access` (liaison profil client ↔ sites)
   et `evaluations` (avis clients) + helper `client_site_ids()`.
7. `0007_rls_client.sql` — policies **Client** : lecture des sites listés dans
   `client_site_access`, des interventions `validated`, des médias validés non expirés,
   insertion/lecture de ses propres incidents et évaluations.

#### Application via Supabase CLI
```powershell
supabase link --project-ref <ton-project-ref>
supabase db push
```

#### Ou manuellement
Ouvre **Supabase Dashboard → SQL Editor** et colle le contenu des trois fichiers
dans l'ordre.

### 3.3 Edge Functions

Quatre fonctions dans [`supabase/functions/`](../supabase/functions/) :

- `signup-with-role` — crée un user `auth.users` + profile avec rôle.
  Appelée depuis le formulaire d'inscription (`verify_jwt = false`).
- `submit-intervention` — passe une intervention en `pending_validation` après
  vérification (auth user = agent_id, photos before/after par zone, ≥ 1
  checklist_results). Appelée par l'agent (`verify_jwt = true`).
- `admin-create-agent` — l'admin saisit un mot de passe temporaire ; la fonction
  crée auth.user + profile avec `role='agent'` et l'ajoute optionnellement à
  une équipe. `verify_jwt = true` + check rôle admin.
- `validate-intervention` — valide ou rejette une intervention. En validation :
  passe `is_validated=true` sur les photos cochées par l'admin, false sur les
  autres, écrit `admin_summary` et `global_result`. En rejet : statut `rejected`
  + `admin_notes` (raison). `verify_jwt = true` + check rôle admin.

Déploie-les :
```powershell
supabase functions deploy signup-with-role
supabase functions deploy submit-intervention
supabase functions deploy admin-create-agent
supabase functions deploy validate-intervention
```

⚠️ Vérifie dans **Supabase Dashboard → Edge Functions → Settings** que
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` et `SUPABASE_URL` sont bien
disponibles dans les secrets (Supabase les fournit automatiquement, mais
contrôle quand même).

---

## 4. Lancer l'app

```powershell
npm start
```

Scanner le QR code avec Expo Go.

---

## 5. Flux Admin — comment tester

1. **Inscription Admin** : depuis l'écran de login → onglet "Inscription" → choisis
   le rôle **Admin**, saisis tes infos, submit. Tu arrives sur le dashboard admin.
2. **Créer un client** : onglet *Clients* → bouton **+** en bas à droite → saisis
   le nom et le type de contrat → "Créer le client".
3. **Créer un chantier (site + checklist)** : depuis le dashboard, bouton "Nouveau
   chantier" → choisis le client, saisis nom + adresse + tâches de checklist (chaque
   ligne avec une zone : "Hall", "Bureaux", etc.) → "Créer la fiche".
4. **Créer un agent** : onglet *Équipes* → formulaire "Ajouter un Agent" → saisis
   les infos + un mot de passe temporaire → "Créer l'Agent". Le mot de passe
   s'affiche dans une popup, transmets-le à l'agent par un canal sûr.
5. **Créer une équipe** : onglet *Équipes* → "Créer une Équipe" → nom + zone +
   sélectionne les agents à y rattacher → "Créer".
6. **Planifier une intervention** : onglet *Planning* → bouton **+** → choisis le
   site, l'agent, la date (JJ/MM/AAAA) et l'heure (HH:MM) → "Créer l'intervention".
   Elle apparaît dans la timeline du jour.
7. **Test côté Agent** : déconnecte-toi, reconnecte-toi avec les credentials de
   l'agent. La home agent montre la mission. Coche la checklist, prends une photo
   avant/après par zone, soumets l'intervention.
8. **Validation côté Admin** : reconnecte-toi en admin. Le dashboard affiche
   "1 intervention à valider". Tap → écran Validation. **Coche les photos à publier**
   (toggle individuel sur chaque tile), saisis un résumé pour le client, "Valider"
   → modal "OK / À AMÉLIORER". Le statut passe à `validated`, et seules les photos
   cochées ont `is_validated=true`.
9. **Rejet** : sur une autre intervention pending, tap "Rejeter" → saisis une
   raison → "Confirmer". Le statut passe à `rejected` et la raison est stockée
   dans `admin_notes` (visible par l'agent dans son onglet Reports).
10. **Incidents** : si un agent a signalé une anomalie pendant la mission, elle
    apparaît dans la section "Incidents ouverts" du dashboard admin. Tap → change
    le statut (`open` → `in_progress` → `resolved`) + saisis des notes internes.

---

## 6. Flux Client — comment tester

1. **Inscription Client** : depuis l'écran de login → "Inscription" → choisis le
   rôle **Client**, saisis tes infos, submit. Tu arrives sur la home client vide
   ("Aucun site rattaché").
2. **Lui donner accès à un site** (côté admin / SQL) — un client n'a accès à un
   site qu'après que l'admin l'y a rattaché via la table `client_site_access` :
   ```sql
   -- Récupère l'uid du client et l'id d'un site existant
   select id, full_name from profiles where role = 'client';
   select id, name from sites;

   -- Lui donner accès
   insert into client_site_access (client_profile_id, site_id)
   values ('<UID_CLIENT>', '<ID_SITE>');
   ```
3. **Pull-to-refresh** sur la home : le site apparaît dans "Mes chantiers".
4. **Voir un rapport** : si l'admin a déjà validé une intervention sur ce site,
   elle apparaît dans "Dernière intervention" + "Historique récent". Tap →
   onglet *Planning* (= détail intervention) avec photos validées + résumé admin.
5. **Évaluation** : sur le détail intervention, choisis 1-5 étoiles, "Satisfait"
   ou "À améliorer", commentaire optionnel → "Envoyer mon avis". L'évaluation
   est upsertée (`UNIQUE (intervention_id, client_profile_id)`).
6. **Photos par zone** : onglet *Photos* → si plusieurs sites, choisis-en un en
   haut. Les zones définies dans la checklist apparaissent en tabs ; chaque zone
   affiche les paires avant/après horodatées.
7. **Signalement** : onglet *Messages* (ou bouton "Signaler" sur la home/détail)
   → choisis le site, optionnellement la zone (depuis les zones du site),
   description → "Envoyer le signalement". L'admin le voit dans son dashboard.
8. **Logout** : icône 🚪 en haut à droite de la home Client.

> ⚠️ Le client ne voit **jamais** les interventions non validées, les photos
> non validées par l'admin, les notes internes de l'agent, ni les commentaires
> d'évaluation des autres clients (RLS l'empêche).

---

## 7. Flux Agent — comment tester

1. **Inscription** : sur l'écran de login, bascule sur "Inscription", saisis nom,
   téléphone, email, mot de passe, et choisis le rôle **Agent**. Submit.
2. L'edge function crée le user + le profil. L'app redirige vers `/(agent)/(tabs)/home`.
3. **Home Agent vide** : tu verras l'empty state "Aucune intervention assignée".
4. **Créer une mission de test** depuis Supabase SQL Editor :
   ```sql
   -- Récupère ton uid (agent)
   select id, role, full_name from profiles where role = 'agent';

   -- Crée un client + site + checklist + intervention assignée
   with c as (insert into clients (name) values ('Client Demo') returning id),
        s as (insert into sites (client_id, name, address, service_type, description)
              select id, 'Site Demo', '1 rue Test, Paris', 'Nettoyage hebdo',
                     'Bureaux + sanitaires' from c returning id, client_id),
        t1 as (insert into checklist_tasks (site_id, label, zone, order_index)
               select id, 'Dépoussiérage', 'Bureaux', 1 from s returning id),
        t2 as (insert into checklist_tasks (site_id, label, zone, order_index)
               select id, 'Nettoyage sols', 'Bureaux', 2 from s returning id),
        t3 as (insert into checklist_tasks (site_id, label, zone, order_index)
               select id, 'Désinfection lavabos', 'Sanitaires', 1 from s returning id)
   insert into interventions (site_id, agent_id, scheduled_at, status)
   select s.id, '<TON_UID_AGENT>', now() + interval '2 hours', 'scheduled'
   from s;
   ```
5. **Pull-to-refresh** sur la home → la card mission apparaît dans "Aujourd'hui".
6. **Tap sur la card** → checklist par zone, photo avant/après par zone, signalement
   d'anomalie, bouton "Soumettre l'intervention".
7. **Soumission** → l'edge function vérifie les pré-requis (1 photo before + 1 after
   par zone, ≥ 1 case cochée). Si OK, status passe à `pending_validation`.
8. **Logout** : icône 🚪 en haut à droite de la home Agent.

---

## 8. Architecture

```
.
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_init_agent.sql
│   │   ├── 0002_rls_agent.sql
│   │   ├── 0003_storage_media.sql
│   │   ├── 0004_admin_rls.sql
│   │   ├── 0005_admin_storage.sql
│   │   ├── 0006_init_client.sql
│   │   └── 0007_rls_client.sql
│   └── functions/
│       ├── _shared/{cors.ts, auth.ts}
│       ├── signup-with-role/index.ts
│       ├── submit-intervention/index.ts
│       ├── admin-create-agent/index.ts
│       └── validate-intervention/index.ts
└── mobile-app/
    ├── app/
    │   ├── _layout.tsx               (AuthProvider racine)
    │   ├── index.tsx                 (login/signup avec sélecteur de rôle)
    │   ├── (agent)/
    │   │   ├── _layout.tsx           (guard rôle agent)
    │   │   ├── (tabs)/{home, photos, planning, messages, reports}.tsx
    │   │   ├── chantier/[id].tsx
    │   │   └── mission/[id].tsx
    │   ├── (admin)/
    │   │   ├── _layout.tsx           (guard rôle admin)
    │   │   ├── (tabs)/{home, clients, planning, teams, reports}.tsx
    │   │   ├── validation.tsx        (?intervention_id=...)
    │   │   ├── chantier-new.tsx
    │   │   ├── client-new.tsx
    │   │   ├── intervention-new.tsx
    │   │   └── incident/[id].tsx
    │   └── (client)/
    │       ├── _layout.tsx           (guard rôle client)
    │       └── (tabs)/{home, photos, intervention, incident, reports}.tsx
    ├── components/   (Header, Avatar, Card, Badge, PrimaryButton, ...)
    ├── constants/theme.ts
    ├── contexts/AuthContext.tsx
    ├── hooks/
    │   ├── useAgentInterventions.ts
    │   ├── useAdminStats.ts
    │   ├── useAdminClients.ts
    │   ├── useAdminSites.ts
    │   ├── useAdminAgents.ts
    │   ├── useAdminInterventions.ts
    │   ├── useAdminTeams.ts
    │   ├── useAdminIncidents.ts
    │   ├── useClientSites.ts
    │   ├── useClientInterventions.ts
    │   ├── useClientPhotos.ts
    │   └── useClientEvaluation.ts
    ├── lib/supabase.ts
    └── .env.example
```

---

## 9. Données fictives

Tous les écrans **Agent**, **Admin** et **Client** sont vides par défaut : tant
que la base ne contient pas de ligne adaptée à ton uid + ton rôle, tu vois des
empty states explicites. Aucun nom de site/agent/client fictif n'est codé en
dur dans la partie back-end.
