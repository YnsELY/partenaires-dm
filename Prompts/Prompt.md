partie agent screen avec (c), partie admin screen avec (a) et les autres screen partie client 
Les Partenaires DM — Prompt Maître pour Claude Code
Application mobile de suivi d'interventions de nettoyage chantier.
3 rôles distincts et étanches : Admin · Agent · Client
Stack cible : React Native (Expo) + Supabase (auth, DB, storage) + Expo Router

0. CONTEXTE GLOBAL & RÈGLES ABSOLUES
Tu vas développer une application mobile complète appelée "Les Partenaires DM".
Il s'agit d'un outil de pilotage opérationnel pour une entreprise de nettoyage
de chantiers BTP. L'app comporte 3 interfaces séparées selon le rôle de
l'utilisateur connecté.

RÈGLES NON NÉGOCIABLES :
- Séparation stricte des données par rôle via Row Level Security (RLS) Supabase
- Un client ne voit que SES chantiers, SES photos, SES interventions
- Un agent ne voit que les chantiers qui lui sont ASSIGNÉS
- Les données internes (agents présents, durée, notes) ne sont JAMAIS visibles côté client
- Les commentaires d'évaluation client sont visibles uniquement par l'admin
- Les médias sont supprimés automatiquement après 60 jours côté client
- Toute l'interface est en FRANÇAIS

PALETTE COULEURS (extraite des designs) :
- Primary : #1A3A6B (bleu marine foncé)
- Secondary : #2563EB (bleu vif)
- Accent rouge (incidents) : #DC2626
- Accent vert (OK) : #16A34A
- Fond global : #F0F4F8
- Cartes : #FFFFFF
- Texte principal : #1E293B
- Texte secondaire : #64748B

TYPOGRAPHIE :
- Titres : Inter Bold
- Corps : Inter Regular
- Taille base : 14sp, titres 20-28sp

NAVIGATION :
- Admin : Tab bar 5 items (Home, Photos, Planning, Messages, Reports)
  + stack interne depuis dashboard
- Agent : Tab bar 5 items (Home, Photos, Planning, Messages, Reports)
- Client : Tab bar 5 items (Home, Photos, Planning, Messages, Reports)
- Routing post-login basé sur user.role ('admin' | 'agent' | 'client')
1. ARCHITECTURE BASE DE DONNÉES (Supabase)
-- Crée ces tables dans cet ordre exact

-- USERS (géré par Supabase Auth + table profiles)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  role TEXT CHECK (role IN ('admin', 'agent', 'client')) NOT NULL,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  magic_link_token TEXT UNIQUE,   -- pour connexion client par lien unique
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTS (entreprises clientes)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  contract_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEAMS
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,            -- ex: "Équipe A"
  zone TEXT,                     -- ex: "Zone Industrielle Nord"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TEAM_MEMBERS (agents dans une équipe)
CREATE TABLE team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, agent_id)
);

-- SITES (chantiers)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  service_type TEXT,
  description TEXT,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENT_SITE_ACCESS (quels profils client voient quels sites)
CREATE TABLE client_site_access (
  client_profile_id UUID REFERENCES profiles(id),
  site_id UUID REFERENCES sites(id),
  PRIMARY KEY (client_profile_id, site_id)
);

-- CHECKLISTS (tâches configurées par l'admin pour un site)
CREATE TABLE checklist_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  zone TEXT,                     -- "Hall d'accueil", "Bureaux", etc.
  order_index INT DEFAULT 0
);

-- INTERVENTIONS
CREATE TABLE interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id) NOT NULL,
  agent_id UUID REFERENCES profiles(id),
  team_id UUID REFERENCES teams(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  validated_at TIMESTAMPTZ,
  status TEXT CHECK (status IN (
    'scheduled','in_progress','pending_validation','validated','rejected'
  )) DEFAULT 'scheduled',
  agent_notes TEXT,              -- notes internes agent, jamais visibles client
  admin_summary TEXT,            -- résumé admin affiché au client
  global_result TEXT CHECK (global_result IN ('ok','to_improve')),
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CHECKLIST_RESULTS (résultats de checklist par intervention)
CREATE TABLE checklist_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  task_id UUID REFERENCES checklist_tasks(id),
  is_done BOOLEAN DEFAULT false,
  zone TEXT
);

-- MEDIA (photos uploadées par l'agent)
CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  type TEXT CHECK (type IN ('before','after','anomaly')),
  zone TEXT,
  is_validated BOOLEAN DEFAULT false,   -- admin valide avant publication client
  taken_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,               -- NOW() + 60 days, calculé à l'insert
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INCIDENTS
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id),
  site_id UUID REFERENCES sites(id),
  reported_by UUID REFERENCES profiles(id),
  reporter_role TEXT CHECK (reporter_role IN ('agent','client')),
  zone TEXT,
  description TEXT,
  photo_url TEXT,
  status TEXT CHECK (status IN ('open','in_progress','resolved')) DEFAULT 'open',
  admin_notes TEXT,                     -- jamais visible client
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVALUATIONS (avis clients)
CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID REFERENCES interventions(id) UNIQUE,
  client_profile_id UUID REFERENCES profiles(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  satisfaction TEXT CHECK (satisfaction IN ('satisfied','to_improve')),
  comment TEXT,                         -- visible UNIQUEMENT admin
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MESSAGES
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  sender_id UUID REFERENCES profiles(id),
  content TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
2. AUTHENTIFICATION & ROUTING
Implémente 3 flux de connexion distincts selon le rôle :

FLUX ADMIN :
- Email + mot de passe via supabase.auth.signInWithPassword()
- Après login, vérifier profiles.role === 'admin'
- Rediriger vers /admin/(tabs)/home

FLUX AGENT :
- Email + mot de passe via supabase.auth.signInWithPassword()
- Après login, vérifier profiles.role === 'agent'
- Rediriger vers /agent/(tabs)/home

FLUX CLIENT (screen 1 / 1C / 1A partagé) :
- OPTION A : Bouton "ACCÉDER AVEC MON LIEN"
  → Lire le token dans l'URL (deep link : partenairesdm://auth?token=XXX)
  → Appeler une Edge Function Supabase qui valide le magic_link_token
  → Créer une session pour ce client
- OPTION B : Bouton "CONNEXION PAR CODE SMS"
  → Saisie du numéro de téléphone
  → supabase.auth.signInWithOtp({ phone })
  → Saisie du code OTP reçu
  → Après validation, vérifier profiles.role et router

Structure des routes Expo Router :
app/
  index.tsx                    ← écran login commun
  auth/
    magic-link.tsx             ← gestion deep link token
    sms-otp.tsx                ← saisie OTP
  admin/
    (tabs)/
      home.tsx                 ← 2A dashboard
      photos.tsx
      planning.tsx             ← 3A planning du jour
      messages.tsx
      reports.tsx
    clients/
      index.tsx                ← 4A portefeuille clients
      [id].tsx
      new.tsx                  ← formulaire ajout client
    chantiers/
      index.tsx
      new.tsx                  ← 5A nouvelle fiche chantier
      [id].tsx                 ← 3C fiche chantier admin
    teams/
      index.tsx                ← 4Abis gestion équipes
    interventions/
      [id].tsx                 ← 2Abis validation intervention
  agent/
    (tabs)/
      home.tsx
      photos.tsx
      planning.tsx             ← 2C planning agent
      messages.tsx
      reports.tsx
    mission/
      [id].tsx                 ← 4C checklist mission
    chantier/
      [id].tsx                 ← 3C fiche chantier (vue agent)
  client/
    (tabs)/
      home.tsx                 ← screen 2
      photos.tsx               ← screen 4
      planning.tsx
      messages.tsx
      reports.tsx              ← screen 5
    intervention/
      [id].tsx                 ← screen 3
    incident/
      new.tsx                  ← screen 3bis
3. SCREENS ADMIN
SCREEN 1A — Connexion Admin
Fichier : app/index.tsx (écran commun à tous les rôles)

Design (référence image 1a.png) :
- Fond blanc pur
- Logo Les Partenaires DM centré en haut (cercle bleu avec icône)
- Titre "Bienvenue" en Inter Bold 32sp, couleur #1A3A6B
- Sous-titre "Accédez à votre espace chantier en toute sécurité." en gris centré
- Bouton primaire plein : "ACCÉDER AVEC MON LIEN" (#1A3A6B, icône chaîne)
- Séparateur "ou"
- Bouton secondaire outline : "CONNEXION PAR CODE SMS" (icône message)
- En dessous (non visible sur le design mais à implémenter) :
  un lien discret "Connexion administrateur / agent" qui ouvre une
  bottom sheet avec email + mot de passe

Logique :
- Détecter si l'app est ouverte via deep link avec token → auto-redirect vers auth/magic-link
- Le bouton SMS ouvre auth/sms-otp.tsx
- Après authentification réussie, lire profiles.role et router vers
  le bon stack (/admin, /agent, /client)
SCREEN 2A — Tableau de bord Admin
Fichier : app/admin/(tabs)/home.tsx

Design (référence image 2a.png) :
- Header : avatar admin (rond, coin gauche), titre "Les Partenaires DM" centré,
  icône cloche (notifications) à droite
- Titre section : "Tableau de bord — Admin" + sous-titre "Vue d'ensemble opérationnelle"

WIDGET 1 — Statut Global (carte blanche, coin arrondi 12px) :
  - Label "STATUT GLOBAL" en petites caps bleu clair
  - Chiffre large "24" + texte "Chantiers actifs"
  - Icône grille en haut à droite

WIDGET 2 — Ressources (carte fond #1A3A6B) :
  - Label "RESSOURCES" en blanc petites caps
  - Chiffre "12" + texte "Agents déployés"
  - Icône équipe en haut à droite

WIDGET 3 — Période (carte blanche) :
  - Label "PÉRIODE"
  - Chiffre "156" + texte "Interventions ce mois"
  - Icône checklist

SECTION "Interventions à valider" :
  - Titre + bouton "Tout voir" (lien vers liste complète)
  - Liste de cards : avatar agent | nom agent | site client | badge "EN ATTENTE" (rouge)
  - Tap sur une card → navigation vers /admin/interventions/[id] (screen 2Abis)

SECTION "Incidents ouverts" :
  - Titre + badge compteur rouge
  - Card incident : icône warning rouge | titre incident | site + durée | bouton "Gérer"
  - Barre rouge à gauche de la card (accent visuel)

SECTION "Interventions à venir" :
  - Titre + bouton "Tout voir"
  - Liste : heure (format HH:MM + "AUJOURD'HUI") | site | agent assigné | icône info
  - Tap sur info → bottom sheet récapitulative de l'intervention

Données (queries Supabase) :
  - COUNT sites WHERE is_active = true
  - COUNT profiles WHERE role = 'agent'
  - COUNT interventions WHERE EXTRACT(MONTH) = current month
  - interventions WHERE status = 'pending_validation' ORDER BY submitted_at DESC
  - incidents WHERE status = 'open'
  - interventions WHERE status = 'scheduled' AND scheduled_at >= NOW() ORDER BY scheduled_at ASC LIMIT 5

Tab bar bas : Home (actif) | Photos | Planning | Messages | Reports
SCREEN 2Abis — Validation d'une Intervention
Fichier : app/admin/interventions/[id].tsx

Design (référence image 2abis.png) :
- Header : flèche retour + titre "Validation Intervention" + avatar admin
- Badge statut en haut : "EN ATTENTE DE VALIDATION" (fond rose/saumon)

CARTE INFO SITE :
  - Label "SITE CLIENT" en petites caps gris
  - Nom du site en grand bleu : "Tour Alpha"
  - Icône grille à droite (lien vers fiche chantier)
  - "AGENT RESPONSABLE" | "DATE & HEURE" sur deux colonnes
  - Valeurs : nom agent | date heure format "24 Oct. 2023 • 14:30"

SECTION "Révision du contrôle" :
  - Card checklist : icône check vert | "Checklist Complétée 12/12" | sous-texte

SECTION "Preuves photographiques" :
  - Grille 3 colonnes de miniatures photos
  - Miniature avec icône caméra+ si slot vide
  - Tap → plein écran

SECTION "Notes de l'agent" :
  - Encadré avec citation en italique (notes internes de l'agent)
  - ⚠️ Rappel dans le code : ce champ n'est JAMAIS exposé à l'API client

SECTION "Document de Synthèse" (card fond bleu foncé) :
  - Icône PDF | "Rapport d'intervention PDF"
  - Bouton "Générer et uploader le rapport" → appel Edge Function génération PDF
    (inclure : site, agent, date, checklist results, photos validées, résumé admin)

BOUTON BAS : "Valider et Envoyer au Client" (#1A3A6B, plein largeur)
  - Action : UPDATE interventions SET status='validated', validated_at=NOW()
  - Déclenche notification push au client (Expo Notifications)
  - Déclenche publication des photos is_validated=true côté client

Ajouter aussi un bouton secondaire "Rejeter" qui ouvre une modal
avec textarea pour indiquer la raison → status='rejected'
SCREEN 3A — Planning du Jour (Admin)
Fichier : app/admin/(tabs)/planning.tsx

Design (référence image 3a.png) :
- Header hamburger menu | titre "Les Partenaires DM" | avatar admin
- Titre : "AUJOURD'HUI" (label) + "Planning du Jour" (h1)

SÉLECTEUR DE JOURS (scroll horizontal) :
  - 4 jours visibles : LUN 13 | MAR 14 (sélectionné, fond #1A3A6B) | MER 15 | JEU 16
  - Scroll gauche/droite pour naviguer les jours
  - Tap sur un jour → recharge la liste des interventions pour ce jour

LISTE INTERVENTIONS (timeline verticale) :
  - Chaque item : heure à gauche (ex: "08:00") | card à droite
  - Card contient :
    - Nom du site (bold)
    - Badge statut : "À VENIR" (gris) | "EN COURS" (bleu avec point animé) | "TERMINÉ"
    - Icône bâtiment + nom du responsable client
    - Avatar agent + description courte de la prestation
  - Tap sur une card → bottom sheet ou modal avec :
    - Récap complet de l'intervention (site, client, agent, heure, type prestation)
    - Bouton "Voir la fiche complète"

FAB bouton + (bleu foncé, coin bas droit) → /admin/chantiers/new pour créer une intervention

Tab bar : CLIENTS | CHANTIERS | PLANNING (actif)

Données :
  - interventions JOIN sites JOIN profiles (agent)
    WHERE DATE(scheduled_at) = selected_date
    ORDER BY scheduled_at ASC
SCREEN 4A — Portefeuille Clients
Fichier : app/admin/clients/index.tsx

Design (référence image 4a.png) :
- Header hamburger + "Les Partenaires DM" + avatar
- Titre "Mes Clients" + sous-titre

CARD PERFORMANCE (carte blanche, fond légèrement coloré en haut) :
  - Badge "PERFORMANCE HEBDOMADAIRE"
  - Titre "Expansion du Portefeuille" (bleu)
  - Texte résumé dynamique (nb nouveaux clients ce mois, % activité)
  - Icône graphique barres en arrière-plan (décoratif)

CARD STAT GLOBALE (fond #1A3A6B) :
  - Chiffre grand blanc : nombre total de sites actifs
  - Label "SITES ACTIFS" en petites caps

LISTE DES CLIENTS :
  - Pour chaque client :
    - Logo client (carré arrondi, fallback initiales colorées)
    - Nom du client (bold)
    - Type de contrat (ex: "Contrat de Maintenance Annuel")
    - "[N] SITES" label + icône œil (voir) + icône kebab (options)
  - Tap icône œil → /admin/clients/[id] (détail client)
  - Tap kebab → bottom sheet : Modifier | Désactiver | Supprimer

FAB bouton + → /admin/clients/new (formulaire ajout client)
  Formulaire à créer (screen non fourni, tu l'inventes) :
  - Nom de l'entreprise (requis)
  - Type de contrat (select)
  - Logo (upload optionnel)
  - Contact principal (nom + email + téléphone)
  - Bouton "Créer le client"

Tab bar : CLIENTS (actif) | CHANTIERS | PLANNING
SCREEN 4Abis — Gestion des Équipes
Fichier : app/admin/teams/index.tsx

Design (référence image 4abis.png) :
- Header : "Les Partenaires DM" | icône cloche | avatar "AP" (initiales)
- Titre "Gestion des Équipes" + sous-titre

SECTION "Ajouter un Agent" (carte blanche) :
  - Icône personne+ | Titre "Ajouter un Agent"
  - Champ NOM COMPLET (placeholder "Jean Dupont")
  - Champ TÉLÉPHONE (placeholder "+33 6 00 00 00 00")
  - Champ EMAIL PROFESSIONNEL (placeholder "j.dupont@partenaires-dm.fr")
  - Select "Assigner à une Équipe" (liste des équipes existantes)
  - Bouton "Créer l'Agent" (#1A3A6B) :
    → supabase.auth.admin.createUser() avec role='agent' dans profiles
    → Envoi email d'invitation automatique

SECTION "Liste des Équipes" :
  - Badge compteur "4 ACTIVES"
  - Pour chaque équipe :
    - Icône spécifique à l'équipe
    - Nom équipe (bold) + zone géographique
    - Toggle actif/inactif
    - Badge nombre d'agents (+5 pour overflow)
    - Nombre en grand à droite
  - Bouton "Créer une Équipe" (outline, icône équipe+) :
    → Modal : nom équipe + zone + sélection agents (multi-select depuis la liste agents)

Tab bar : HOME | AGENTS | TEAMS (actif) | TASKS
SCREEN 5A — Nouvelle Fiche Chantier
Fichier : app/admin/chantiers/new.tsx

Design (référence image 5a.png) :
- Header hamburger + "Les Partenaires DM" + avatar
- Titre "Nouvelle Fiche Chantier" + sous-titre

ÉTAPE 1 — Informations Générales (badge numéroté "1" bleu) :
  - NOM DU SITE : TextInput (placeholder "ex: Résidence Les Glycines")
  - CLIENT : Select dropdown (liste des clients depuis table clients)
  - AGENT RESPONSABLE : Input avec icône personne (ouvre bottom sheet sélection agent/équipe)
  - ADRESSE DU SITE : TextInput avec icône pin géo
  - PHOTO DU SITE : Zone upload dashed (tap → ImagePicker Expo)
    → Upload vers Supabase Storage bucket 'sites'
    → Stocker l'URL dans sites.photo_url
  - DESCRIPTION DU SITE : TextArea multiline

ÉTAPE 2 — Checklist des Tâches (badge numéroté "2") :
  - Bouton "+ Ajouter une tâche" :
    → Ajoute une ligne avec TextInput pour saisir la tâche
    → Champ optionnel "Zone" (ex: "Hall d'accueil")
  - Liste des tâches ajoutées avec checkbox (pour l'aperçu) + icône supprimer
  - Ces tâches sont sauvegardées dans checklist_tasks liées au site
  - Elles se répercutent AUTOMATIQUEMENT dans la checklist de l'agent (4C)

BOUTON "Créer la fiche chantier" (#1A3A6B, plein largeur) :
  - INSERT dans sites + checklist_tasks
  - Naviguer vers /admin/chantiers/[id]

Lien "Annuler" (texte simple) sous le bouton

Tab bar : CLIENTS | CHANTIERS (actif) | PLANNING
4. SCREENS AGENT
SCREEN 1C — Connexion Agent
Fichier : app/index.tsx (identique screen 1A)

Même écran de connexion que l'admin.
L'agent utilise le flux email + mot de passe (bottom sheet cachée).
Après login, détection role='agent' → redirect /agent/(tabs)/home
SCREEN 2C — Planning des Interventions (Agent)
Fichier : app/agent/(tabs)/planning.tsx

Design (référence image 2c.png) :
- Header : avatar agent (rond) | "Les Partenaires DM" | icône cloche
- Titre "Planning de mes interventions" + sous-titre mois en cours

CALENDRIER MENSUEL :
  - Vue calendrier classique (grille LUN→DIM)
  - Jours avec intervention : point bleu sous la date
  - Jour aujourd'hui : cercle plein bleu #1A3A6B
  - Flèches < > pour naviguer entre mois
  - Tap sur un jour → filtre la liste dessous

SECTION "À venir (Aujourd'hui)" :
  - Cards intervention à venir :
    - Date courte (ex: "MAR 7 NOV")
    - Nom du site (bold)
    - Description courte
    - Badge heure (ex: "08:00 - 12:00") fond bleu clair
    - Bordure gauche bleue sur la card
  - Tap sur la card → /agent/mission/[id] (screen 4C)

SECTION "Interventions passées" :
  - Liste compacte : icône check gris | date | nom site | statut "Terminé"

Données :
  - interventions WHERE agent_id = auth.uid() OR team_id IN (mes équipes)
    AND status IN ('scheduled','in_progress','validated')
    ORDER BY scheduled_at DESC

Tab bar : HOME | PHOTOS | PLANNING (actif) | MESSAGES | REPORTS
SCREEN 3C — Fiche Chantier (Vue Agent)
Fichier : app/agent/chantier/[id].tsx

Design (référence image 3c.png) :
- Header : flèche retour | "Fiche Chantier" | icône cloche
- Grande image du site en haut (arrondie, ratio 16:9)
  → avec icône caméra en overlay coin droit (pour mettre à jour la photo)
  → Nom du site en overlay blanc sur l'image

INFORMATIONS SITE (carte blanche) :
  - ADRESSE : icône pin + adresse complète
  - CLIENT : icône bâtiment + nom client
  - AGENT RESPONSABLE : icône personne + nom agent
  - TYPE DE PRESTATION : icône nettoyage + description

DESCRIPTION DU SITE (card séparée) :
  - Label "DESCRIPTION DU SITE" en petites caps
  - Texte complet de description (scrollable)

SECTION "Interventions récentes" :
  - Titre bleu + liste
  - Chaque item : icône calendrier | date | équipe | badge statut (OK vert / À AMÉLIORER orange)

⚠️ Dans la vue agent :
- PAS de section prix, PAS de notes internes d'autres agents
- PAS d'accès aux évaluations clients

Tab bar : HOME (actif) | PHOTOS | PLANNING | MESSAGES | REPORTS
SCREEN 4C — Mission en cours (Checklist Agent)
Fichier : app/agent/mission/[id].tsx

Design (référence image 4c.png) :
- Header : "Les Partenaires DM" | icône cloche
- Titre "Ma mission — [Nom du chantier]"
- Sous-titre : "Veuillez documenter chaque zone et signaler toute anomalie."

POUR CHAQUE ZONE (générée depuis checklist_tasks.zone) :
  Afficher un bloc vertical :

  Titre de zone : "Zone 1 : Hall d'Accueil"

  PHOTOS AVANT/APRÈS :
    - Deux emplacements côte à côte (tap → ImagePicker)
    - Badge "AVANT" (rouge/sombre) sur la gauche
    - Badge "APRÈS" (bleu) sur la droite
    - Après capture : miniature de la photo avec possibilité de recapturer
    - Upload vers Supabase Storage bucket 'media' avec metadata :
      {intervention_id, zone, type: 'before'|'after', taken_at: NOW()}
    - INSERT dans table media avec expires_at = NOW() + INTERVAL '60 days'
    - is_validated = false jusqu'à validation admin

  CHECKLIST TÂCHES (pour cette zone) :
    - Chaque tâche : checkbox + label
    - Tap checkbox → UPDATE checklist_results SET is_done = true

SECTION "Signalement d'Anomalie" (en bas, après toutes les zones) :
  - Toggle switch "Signalement d'Anomalie" (⚠️ rouge)
  - Si activé, révèle :
    - Label "DESCRIPTION DE L'ANOMALIE" + Textarea
    - Zone upload photo anomalie
  - INSERT dans incidents avec reporter_role='agent'

NOTE INTERNE (champ texte simple) :
  - Label "Note interne (visible admin uniquement)"
  - UPDATE interventions SET agent_notes = valeur
  - Ce champ n'est JAMAIS retourné par les queries côté client

BOUTON "SOUMETTRE L'INTERVENTION" (#1A3A6B, plein largeur) :
  - Validation : au moins 1 photo par zone + toutes les tâches cochées ou justifiées
  - UPDATE interventions SET status='pending_validation', submitted_at=NOW()
  - Notification push à l'admin
  - Retour vers planning agent

Tab bar : HOME | PHOTOS | PLANNING | MESSAGES | REPORTS (actif)
5. SCREENS CLIENT
SCREEN 1 — Connexion Client
Fichier : app/index.tsx (même screen partagé)

Design (référence image 1.png) : identique aux autres rôles.
Le client utilise exclusivement :
- Le lien unique (magic_link_token)
- Le code SMS (OTP)
Il n'a pas accès à la connexion email/mot de passe.
SCREEN 2 — Accueil Client
Fichier : app/client/(tabs)/home.tsx

Design (référence image 2.png) :
- Header : icône app (petit) | avatar client | icône cloche
- Salutation : "Bonjour," + Prénom Nom du client (bold, bleu)

SECTION "Chantiers en cours" + bouton "Voir tout" :
  - Scroll horizontal de cards chantiers :
    CARD CHANTIER :
    - Badge statut : "EN COURS" (bleu) | "INTERVENTION PRÉVUE" (gris)
    - Nom du chantier (bold)
    - Description courte
    - Progress : "65% terminé" ou "Planifié" avec date
    - Étoiles notation (vides ou remplies selon dernière évaluation)
  - Tap sur une card → /client/chantier/[id] (fiche simplifiée)

SECTION "Dernière intervention" :
  - Grande card avec :
    - Image miniature (première photo validée) avec badge "3 photos"
    - Date : ex "12 Oct 2023" | Badge "CONFORMITÉ 100%" (vert)
    - Nom du site (bold)
    - Description de la prestation
    - Bouton "VOIR LE RAPPORT" (#1A3A6B) → /client/intervention/[id]
    - Bouton "SIGNALER UN PROBLÈME" (texte bleu) → /client/incident/new

SECTION "Historique récent (7 jours)" :
  - Liste : date courte | nom site | badge statut (TERMINÉ / OK)
  - Tap sur chaque ligne → /client/intervention/[id] (même screen 3)
  - Lien "Voir tout l'historique" en bas

⚠️ Règles RLS : ne retourner que les sites liés à ce client via client_site_access
⚠️ Photos : ne retourner que les media WHERE is_validated = true AND expires_at > NOW()

Tab bar : HOME (actif) | PHOTOS | PLANNING | MESSAGES | REPORTS
SCREEN 3 — Détail d'une Intervention (Client)
Fichier : app/client/intervention/[id].tsx

Design (référence image 3.png) :
- Header : date de l'intervention (ex: "12 Avril 2024") | icône cloche
- Badge DM (initiales entreprise) à gauche

SECTION "Résumé de l'intervention" (carte) :
  - Label "STATUT GLOBAL" en petites caps
  - Badge "Intervention OK" (vert, icône check) ou "À améliorer" (orange)
  - Icône PDF en haut à droite → ouvre le PDF directement (URL signée Supabase)
  - Texte du résumé admin (interventions.admin_summary)
    ⚠️ JAMAIS afficher agent_notes ici

SECTION "Photos validées" :
  - Grille 2x2 de miniatures avec label zone (Accueil, Salle B, Couloir)
  - Badge "+2 photos" si plus de 4 photos
  - Tap sur la grille → /client/(tabs)/photos (screen 4) avec filtre sur cette intervention

BOUTON "Signaler un problème" (rouge, plein largeur) :
  → /client/incident/new avec pre-fill de l'intervention_id

SECTION "Votre évaluation" :
  - 5 étoiles interactives (tap pour noter)
  - Boutons "Satisfait" | "À améliorer" (toggle)
  - Textarea "Commentaire optionnel..." (200 char max)
  - Bouton "Envoyer mon avis" :
    → UPSERT dans evaluations
    ⚠️ Le commentaire va en DB mais n'est JAMAIS retourné dans les requêtes client
    ⚠️ Seul l'admin peut lire les commentaires

Tab bar : HOME | PHOTOS | PLANNING (actif) | MESSAGES | REPORTS
SCREEN 3bis — Signaler un Problème (Client)
Fichier : app/client/incident/new.tsx

Design (référence image 3bis.png) :
- Header : flèche retour | "Signaler un problème" | icône cloche
- Texte intro explicatif

ZONE CONCERNÉE :
  - Select dropdown "Sélectionner une zone"
  - Options générées depuis les zones du site concerné (checklist_tasks.zone DISTINCT)

PREUVE VISUELLE (Optionnel) :
  - Zone upload dashed avec icône caméra+
  - "Ajouter une photo ou glisser-déposer"
  - "PNG, JPG, GIF jusqu'à 10MB"
  - Tap → ImagePicker Expo → Upload Supabase Storage

DESCRIPTION DE L'INCIDENT :
  - Textarea : "Décrivez la nature du problème (ex: Tâche sur la moquette...)"
  - Multiline, 300 char max

BOUTON "Envoyer le signalement" (#1A3A6B) :
  - INSERT dans incidents :
    { site_id, reported_by: auth.uid(), reporter_role: 'client',
      zone, description, photo_url, status: 'open' }
  - Notification push à l'admin
  - Toast de confirmation + retour écran précédent

Tab bar : HOME | PHOTOS | PLANNING | MESSAGES (actif) | REPORTS
SCREEN 4 — Galerie Photos Horodatées (Client)
Fichier : app/client/(tabs)/photos.tsx

Design (référence image 4.png) :
- Header : "Photos — [Nom du site]" + sous-titre "Galerie d'intervention du [date]"

FILTRES PAR ZONE (tabs horizontaux scrollables) :
  - "BUREAUX" | "RÉFECTOIRE" | "SANITAIRES" | etc.
  - Généré dynamiquement depuis les zones du site
  - Tab actif : fond #1A3A6B, texte blanc
  - Tab inactif : fond gris clair, texte foncé

POUR CHAQUE ZONE SÉLECTIONNÉE :
  - Titre de sous-zone : ex "Bureau Open Space A" + badge "VALIDÉ" (gris)
  - Photo AVANT :
    - Badge rouge "AVANT" en overlay coin haut gauche
    - Horodatage bas gauche : "08:15 AM"
  - Photo APRÈS :
    - Badge bleu "APRÈS" en overlay coin haut droit
    - Horodatage bas gauche : "09:30 AM"
  - Chaque photo est cliquable → visionneuse plein écran avec swipe

⚠️ Query : media WHERE intervention_id IN (mes interventions)
  AND is_validated = true
  AND expires_at > NOW()
  AND zone = selected_zone
  ORDER BY taken_at ASC

Tab bar : HOME | PHOTOS (actif) | PLANNING | MESSAGES | REPORTS
SCREEN 5 — Mes Rapports (Client)
Fichier : app/client/(tabs)/reports.tsx

Design (référence image 5.png) :
- Header : avatar client | "Les Partenaires DM" | icône cloche
- Titre "Mes rapports" + sous-titre

BARRE DE RECHERCHE + FILTRES :
  - Input "Rechercher un rapport." avec icône loupe
  - Bouton "FILTRES" → bottom sheet : par date, par site

LISTE DES RAPPORTS (cards) :
  - Pour chaque rapport :
    - Icône PDF rouge à gauche
    - Badge date en haut à droite (ex: "12 Oct 2023")
    - Titre du rapport (ex: "Rapport Mensuel — Siège Social")
    - Nom du site/ville
    - Bouton "TÉLÉCHARGER" (outline bleu, icône download)
      → Ouvre URL signée Supabase du PDF (getSignedUrl)
      → Ou partage via expo-sharing

⚠️ Query : interventions WHERE site_id IN (mes sites client)
  AND status = 'validated'
  AND pdf_url IS NOT NULL
  ORDER BY validated_at DESC

⚠️ Les rapports restent accessibles indéfiniment (contrairement aux photos)
  C'est uniquement les PHOTOS qui expirent après 60 jours

Tab bar : HOME | PHOTOS | PLANNING | MESSAGES | REPORTS (actif)
6. SERVICES & LOGIQUE TRANSVERSALE
Génération PDF (Edge Function Supabase)
Créer une Edge Function : supabase/functions/generate-report/index.ts

Paramètres reçus : { intervention_id }

La fonction doit :
1. Récupérer toutes les données de l'intervention (site, agent, date, checklist, photos)
2. Générer un PDF propre avec :
   - Logo Les Partenaires DM
   - Informations du site et du client
   - Date et heure d'intervention
   - Résumé admin (admin_summary) — PAS les notes agent
   - Grille photos avant/après par zone (uniquement is_validated=true)
   - Statut global de la checklist (terminé/partiel)
3. Uploader le PDF dans Supabase Storage bucket 'reports'
4. UPDATE interventions SET pdf_url = [url signée permanente]
5. Retourner { pdf_url }

Utiliser la lib 'pdf-lib' ou '@react-pdf/renderer' selon l'environnement.
Notifications Push (Expo)
Configurer expo-notifications.

Triggers à implémenter :
- Agent soumet une intervention → notif push à l'admin : "Intervention en attente de validation"
- Admin valide une intervention → notif push au client : "Votre rapport est disponible"
- Client signale un incident → notif push à l'admin : "Nouvel incident signalé"
- Intervention planifiée J-1 → notif push à l'agent : "Rappel : intervention demain à [heure]"

Stocker les tokens Expo dans une table push_tokens :
  { profile_id, expo_push_token, created_at }
Suppression automatique médias (Cron Supabase)
Créer un Cron Job Supabase (pg_cron) :
  SELECT cron.schedule(
    'delete-expired-media',
    '0 3 * * *',          -- tous les jours à 3h du matin
    $$
      DELETE FROM media WHERE expires_at < NOW();
      -- Ajouter aussi suppression du fichier dans Storage via Edge Function
    $$
  );

L'expiration s'applique uniquement à la visibilité client.
Les données internes (checklist results, notes) restent en DB.
Liens Magiques Client (Admin)
Dans /admin/clients/[id].tsx, ajouter un bouton "Générer un lien d'accès" :
- Génère un token UUID aléatoire
- UPDATE profiles SET magic_link_token = token WHERE id = client_profile_id
- Construit l'URL : partenairesdm://auth?token=[token]
- Copie dans le presse-papier + option de partage (SMS, email)

Dans /app/auth/magic-link.tsx :
- Récupère le token depuis les query params du deep link
- Appelle une Edge Function qui valide le token et retourne une session
- Redirige vers /client/(tabs)/home
7. COMPOSANTS RÉUTILISABLES À CRÉER
components/
  ui/
    Badge.tsx           ← Badge statut (EN ATTENTE, OK, À AMÉLIORER, etc.)
    StatCard.tsx        ← Widget stat du dashboard (chiffre + label + icône)
    InterventionCard.tsx ← Card intervention (timeline admin, liste agent)
    PhotoGrid.tsx       ← Grille photos avant/après avec horodatage
    ChecklistItem.tsx   ← Item checklist avec checkbox + label
    ClientCard.tsx      ← Card client avec logo, nom, nb sites
    TabBar.tsx          ← Tab bar commune (5 items)
    Avatar.tsx          ← Avatar rond avec fallback initiales colorées
    RapportCard.tsx     ← Card rapport PDF avec bouton télécharger
  layout/
    ScreenHeader.tsx    ← Header avec titre centré, icônes latérales
    SectionHeader.tsx   ← Titre de section + bouton "Tout voir"
8. ORDRE DE DÉVELOPPEMENT RECOMMANDÉ
PHASE 1 — Infrastructure
  1. Init projet Expo + Expo Router
  2. Configurer Supabase (créer les tables, RLS policies, buckets Storage)
  3. Créer le système d'auth (3 flux : email, magic link, SMS OTP)
  4. Routing post-login selon rôle

PHASE 2 — Admin core
  5. Screen 2A (dashboard) avec données réelles
  6. Screen 4A (clients) + formulaire ajout
  7. Screen 4Abis (équipes + agents)
  8. Screen 5A (nouvelle fiche chantier + checklist)
  9. Screen 3A (planning du jour)
  10. Screen 2Abis (validation intervention)

PHASE 3 — Agent core
  11. Screen 2C (planning agent)
  12. Screen 3C (fiche chantier vue agent)
  13. Screen 4C (checklist + upload photos)

PHASE 4 — Client
  14. Screen 2 (accueil client)
  15. Screen 3 (détail intervention + évaluation)
  16. Screen 3bis (signaler un problème)
  17. Screen 4 (galerie photos)
  18. Screen 5 (mes rapports)

PHASE 5 — Services
  19. Edge Function génération PDF
  20. Notifications push
  21. Cron suppression médias 60 jours
  22. Génération liens magiques client
9. CHECKLIST SÉCURITÉ & DONNÉES
Avant de livrer, vérifier chaque point :

☐ RLS activé sur TOUTES les tables Supabase
☐ Un client ne peut jamais lire : agent_notes, checklist_results détaillés,
  profiles d'agents, durées d'intervention, évaluations d'autres clients
☐ Un agent ne peut lire que les interventions WHERE agent_id = auth.uid()
  OR team_id IN (SELECT team_id FROM team_members WHERE agent_id = auth.uid())
☐ is_validated = false → photo non retournée par les queries client
☐ expires_at < NOW() → photo non retournée (filtre appliqué côté query, pas côté UI)
☐ Les commentaires d'évaluation ne sont retournés que si auth.uid() est admin
☐ Les liens magiques sont à usage unique (option) ou révocables par l'admin
☐ Les buckets Storage Supabase ont des policies restrictives par rôle