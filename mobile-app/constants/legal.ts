// Contenu légal de l'application « Les Partenaires DM ».
// Structuré en blocs pour un rendu typographique propre dans l'app
// (écran app/legal.tsx).

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'li'; text: string };

export type LegalDocumentId = 'mentions' | 'cgu' | 'confidentialite';

export type LegalDocument = {
  id: LegalDocumentId;
  shortLabel: string;
  title: string;
  updated: string;
  blocks: LegalBlock[];
};

export const LEGAL_UPDATED = '2 juin 2026';

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    id: 'mentions',
    shortLabel: 'Mentions légales',
    title: 'Mentions Légales',
    updated: LEGAL_UPDATED,
    blocks: [
      {
        type: 'p',
        text:
          "Conformément aux dispositions des articles 6-III et 19 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), il est porté à la connaissance des utilisateurs du site les présentes mentions légales.",
      },
      { type: 'h2', text: "1. Éditeur du site et de l'application" },
      {
        type: 'p',
        text:
          "Le présent site ainsi que l'application mobile « Les Partenaires DM » sont édités par :",
      },
      { type: 'li', text: 'Dénomination sociale : LES PARTENAIRES DM' },
      { type: 'li', text: 'Forme juridique : Société à responsabilité limitée (SARL)' },
      { type: 'li', text: 'Capital social : 1 000 €' },
      { type: 'li', text: 'Siège social : 83 avenue Charles de Gaulle, 92200 Neuilly-sur-Seine, France' },
      { type: 'li', text: 'SIREN : 933 226 102' },
      { type: 'li', text: 'SIRET (siège) : 933 226 102 00020' },
      { type: 'li', text: 'R.C.S. : Nanterre 933 226 102' },
      { type: 'li', text: 'Numéro de TVA intracommunautaire : FR07 933 226 102' },
      { type: 'li', text: 'Code APE/NAF : 81.21Z — Nettoyage courant des bâtiments' },
      { type: 'li', text: 'Directeur de la publication : Omar Dahmani, gérant' },
      { type: 'li', text: 'Adresse e-mail : contact@partenairesmultiservices.fr' },
      { type: 'h2', text: '2. Hébergement du site' },
      {
        type: 'p',
        text:
          'Le présent site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — vercel.com.',
      },
      {
        type: 'p',
        text:
          "Les données applicatives générées dans le cadre du service (photos d'interventions, rapports, comptes utilisateurs) sont hébergées sur des infrastructures situées au sein de l'Union européenne, conformément à notre politique de confidentialité.",
      },
      { type: 'h2', text: '3. Propriété intellectuelle' },
      {
        type: 'p',
        text:
          "L'ensemble des éléments composant le site et l'application (textes, visuels, logo, charte graphique, interface, code source, marques et bases de données) est protégé par la législation française et internationale relative à la propriété intellectuelle. Toute reproduction, représentation, modification ou exploitation, totale ou partielle, sans l'autorisation écrite préalable de l'éditeur, est interdite et susceptible de constituer une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la propriété intellectuelle.",
      },
      { type: 'h2', text: '4. Données personnelles' },
      {
        type: 'p',
        text:
          "Le traitement des données à caractère personnel collectées via le site et l'application est détaillé dans notre politique de confidentialité. Conformément au Règlement (UE) 2016/679 (RGPD) et à la loi « Informatique et Libertés » du 6 janvier 1978 modifiée, vous disposez de droits que vous pouvez exercer à l'adresse contact@partenairesmultiservices.fr ou via la page de suppression des données.",
      },
      { type: 'h2', text: '5. Cookies' },
      {
        type: 'p',
        text:
          "Le site peut déposer des cookies strictement nécessaires à son fonctionnement ainsi que, le cas échéant, des cookies de mesure d'audience. Vous pouvez configurer votre navigateur pour les refuser. Pour plus d'informations, consultez notre politique de confidentialité.",
      },
      { type: 'h2', text: '6. Liens hypertextes' },
      {
        type: 'p',
        text:
          "Le site peut contenir des liens vers des sites tiers (notamment l'App Store et le Google Play Store). L'éditeur n'exerce aucun contrôle sur ces sites et décline toute responsabilité quant à leur contenu ou à l'usage qui pourrait en être fait.",
      },
      { type: 'h2', text: '7. Droit applicable' },
      {
        type: 'p',
        text:
          'Les présentes mentions légales sont régies par le droit français. Tout litige relatif à leur interprétation ou à leur exécution relève des tribunaux compétents.',
      },
    ],
  },
  {
    id: 'cgu',
    shortLabel: 'CGV / CGU',
    title: "Conditions Générales de Vente et d'Utilisation",
    updated: LEGAL_UPDATED,
    blocks: [
      {
        type: 'p',
        text:
          "Les présentes Conditions Générales de Vente et d'Utilisation (ci-après les « CGV/CGU ») régissent la fourniture des prestations de propreté et l'utilisation de l'application « Les Partenaires DM » (ci-après l'« Application ») par l'éditeur (ci-après le « Prestataire ») au profit de ses clients professionnels (ci-après le « Client »). Toute commande ou utilisation du service emporte acceptation pleine et entière des présentes.",
      },
      { type: 'h2', text: '1. Objet' },
      {
        type: 'p',
        text:
          "Les présentes CGV/CGU ont pour objet de définir les conditions dans lesquelles le Prestataire fournit, d'une part, ses prestations de nettoyage et d'entretien de locaux professionnels et, d'autre part, l'accès à l'Application permettant le suivi digitalisé de ces interventions.",
      },
      { type: 'h2', text: '2. Définitions' },
      { type: 'li', text: "Application : le logiciel mobile « Les Partenaires DM » et l'espace client associé." },
      { type: 'li', text: 'Client : toute personne morale ayant conclu un contrat de prestation avec le Prestataire.' },
      { type: 'li', text: "Utilisateur : toute personne autorisée par le Client à accéder à l'espace de suivi." },
      { type: 'li', text: "Prestation : l'ensemble des services de nettoyage et d'entretien commandés par le Client." },
      { type: 'h2', text: '3. Description des services' },
      {
        type: 'p',
        text:
          "Le Prestataire propose des prestations de nettoyage régulières ou ponctuelles, ainsi qu'une Application permettant la documentation photographique avant/après, la gestion des checklists, la génération de rapports PDF, le suivi du planning des passages et le signalement d'anomalies. L'accès à l'Application est inclus, sans surcoût, dans toute prestation souscrite auprès du Prestataire.",
      },
      { type: 'h2', text: '4. Devis et formation du contrat' },
      {
        type: 'p',
        text:
          'Chaque prestation fait l\'objet d\'un devis personnalisé établi après visite des locaux. Le contrat est formé à la signature du devis par le Client. Les conditions particulières figurant au devis (périmètre, fréquence, prix) prévalent sur les présentes en cas de contradiction.',
      },
      { type: 'h2', text: "5. Accès à l'Application et identifiants" },
      {
        type: 'p',
        text:
          "À la signature du contrat, le Prestataire transmet au Client un lien privé de connexion à son espace personnel. Le Client est responsable de la confidentialité de ses identifiants et de toute action réalisée depuis son compte. L'Application est disponible au téléchargement sur l'App Store (iOS) et le Google Play Store (Android).",
      },
      { type: 'h2', text: '6. Obligations du Client' },
      { type: 'li', text: "Permettre l'accès aux locaux dans les conditions convenues au devis ;" },
      { type: 'li', text: "Utiliser l'Application conformément à sa destination et à la réglementation en vigueur ;" },
      { type: 'li', text: "Ne pas porter atteinte à la sécurité ou à l'intégrité du service ;" },
      { type: 'li', text: "S'acquitter des sommes dues dans les délais convenus." },
      { type: 'h2', text: '7. Obligations du Prestataire' },
      {
        type: 'p',
        text:
          "Le Prestataire s'engage à exécuter les prestations avec soin et conformément aux règles de l'art, à mettre à disposition l'Application dans des conditions normales d'utilisation et à assurer la traçabilité des interventions. Le Prestataire est tenu d'une obligation de moyens.",
      },
      { type: 'h2', text: '8. Disponibilité et maintenance' },
      {
        type: 'p',
        text:
          "Le Prestataire s'efforce d'assurer la disponibilité de l'Application 24h/24 et 7j/7. Il se réserve la possibilité d'interrompre temporairement l'accès pour des opérations de maintenance ou de mise à jour. Sa responsabilité ne saurait être engagée en cas d'indisponibilité due à un cas de force majeure, au réseau Internet ou à un fait imputable au Client ou à un tiers.",
      },
      { type: 'h2', text: '9. Propriété intellectuelle' },
      {
        type: 'p',
        text:
          "L'Application et l'ensemble de ses composants demeurent la propriété exclusive du Prestataire. Le Client bénéficie d'un droit d'usage personnel, non exclusif et non cessible, limité à la durée du contrat. Les données et photos relatives aux interventions du Client lui restent acquises et peuvent être exportées sous forme de rapports.",
      },
      { type: 'h2', text: '10. Protection des données personnelles' },
      {
        type: 'p',
        text:
          "Le traitement des données est réalisé conformément au Règlement (UE) 2016/679 (RGPD). Les modalités sont détaillées dans la politique de confidentialité. Les données sont hébergées au sein de l'Union européenne.",
      },
      { type: 'h2', text: '11. Responsabilité' },
      {
        type: 'p',
        text:
          "La responsabilité du Prestataire est limitée aux dommages directs et prouvés. Elle ne saurait excéder le montant des sommes effectivement versées par le Client au titre des trois (3) derniers mois précédant le fait générateur. Sont exclus les dommages indirects (perte d'exploitation, de chiffre d'affaires ou de données).",
      },
      { type: 'h2', text: '12. Durée, résiliation et confidentialité' },
      {
        type: 'p',
        text:
          "Le contrat prend effet à la signature du devis pour la durée qui y est indiquée. En cas de manquement grave d'une partie non régularisé dans un délai de trente (30) jours après mise en demeure, l'autre partie peut résilier le contrat de plein droit. Chaque partie s'engage à préserver la confidentialité des informations échangées dans le cadre de leur relation.",
      },
      { type: 'h2', text: '13. Force majeure' },
      {
        type: 'p',
        text:
          "Aucune des parties ne pourra être tenue responsable d'un manquement à ses obligations résultant d'un cas de force majeure au sens de l'article 1218 du Code civil.",
      },
      { type: 'h2', text: '14. Droit applicable et litiges' },
      {
        type: 'p',
        text:
          "Les présentes CGV/CGU sont soumises au droit français. En cas de litige, les parties s'efforceront de rechercher une solution amiable. À défaut d'accord, le litige sera porté devant les tribunaux compétents du ressort du siège social du Prestataire (Nanterre).",
      },
    ],
  },
  {
    id: 'confidentialite',
    shortLabel: 'Confidentialité',
    title: 'Politique de Confidentialité',
    updated: LEGAL_UPDATED,
    blocks: [
      {
        type: 'p',
        text:
          "La présente politique de confidentialité décrit la manière dont vos données à caractère personnel sont collectées et traitées dans le cadre de l'utilisation du site et de l'application « Les Partenaires DM », conformément au Règlement (UE) 2016/679 (RGPD) et à la loi « Informatique et Libertés » du 6 janvier 1978 modifiée.",
      },
      { type: 'h2', text: '1. Responsable du traitement' },
      {
        type: 'p',
        text:
          "Le responsable du traitement est LES PARTENAIRES DM (SARL), dont le siège social est situé 83 avenue Charles de Gaulle, 92200 Neuilly-sur-Seine (SIREN 933 226 102). Les coordonnées complètes figurent dans les mentions légales. Pour toute question relative à vos données, vous pouvez écrire à contact@partenairesmultiservices.fr.",
      },
      { type: 'h2', text: '2. Données collectées' },
      {
        type: 'p',
        text: 'Nous collectons uniquement les données strictement nécessaires à la fourniture du service :',
      },
      { type: 'li', text: "Données d'identification : nom, prénom, fonction, société, adresse e-mail, numéro de téléphone professionnel ;" },
      { type: 'li', text: 'Données de connexion : identifiants de compte, journaux techniques, adresse IP ;' },
      { type: 'li', text: "Données d'intervention : photos avant/après horodatées, checklists, rapports, signalements d'anomalies, planning des passages." },
      { type: 'h2', text: '3. Finalités et bases légales' },
      { type: 'li', text: 'Exécution du contrat : gestion des prestations, suivi des interventions, reporting client et preuve de passage ;' },
      { type: 'li', text: "Intérêt légitime : sécurité du service, prévention de la fraude et amélioration de l'Application ;" },
      { type: 'li', text: 'Obligation légale : conservation des documents comptables et facturation ;' },
      { type: 'li', text: 'Consentement : le cas échéant, envoi de communications et dépôt de cookies non essentiels.' },
      { type: 'h2', text: '4. Destinataires des données' },
      {
        type: 'p',
        text:
          "Vos données sont destinées aux seuls services habilités de l'éditeur et, le cas échéant, à ses sous-traitants techniques (hébergement, maintenance) agissant sur instruction et dans le cadre d'accords conformes à l'article 28 du RGPD. Vos données et vos photos ne sont jamais vendues ni partagées à des tiers à des fins commerciales. Les accès sont strictement cloisonnés : aucun autre client ne peut consulter vos données.",
      },
      { type: 'h2', text: '5. Durée de conservation' },
      {
        type: 'p',
        text:
          "Les données sont conservées pour la durée de la relation contractuelle. À l'issue de celle-ci, elles sont archivées ou supprimées dans le respect des délais légaux de prescription applicables (notamment les obligations comptables et fiscales). Les données ne sont pas conservées au-delà de ce qui est nécessaire aux finalités décrites ci-dessus.",
      },
      { type: 'h2', text: '6. Hébergement et sécurité' },
      {
        type: 'p',
        text:
          "Les données applicatives sont hébergées sur des infrastructures sécurisées situées au sein de l'Union européenne. L'éditeur met en œuvre des mesures techniques et organisationnelles appropriées (chiffrement des échanges, contrôle des accès, sauvegardes) afin de préserver la sécurité, l'intégrité et la confidentialité de vos données. Aucun transfert n'est réalisé en dehors de l'Union européenne sans garanties adéquates.",
      },
      { type: 'h2', text: '7. Vos droits' },
      { type: 'p', text: 'Conformément au RGPD, vous disposez des droits suivants :' },
      { type: 'li', text: "Droit d'accès à vos données ;" },
      { type: 'li', text: 'Droit de rectification ;' },
      { type: 'li', text: "Droit à l'effacement (« droit à l'oubli ») ;" },
      { type: 'li', text: "Droit à la limitation et à l'opposition au traitement ;" },
      { type: 'li', text: 'Droit à la portabilité de vos données ;' },
      { type: 'li', text: 'Droit de définir des directives relatives au sort de vos données après votre décès.' },
      {
        type: 'p',
        text:
          "Vous pouvez exercer ces droits via la page de suppression des données ou par e-mail à contact@partenairesmultiservices.fr. Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr).",
      },
      { type: 'h2', text: '8. Cookies' },
      {
        type: 'p',
        text:
          "Le site utilise des cookies strictement nécessaires à son fonctionnement et, sous réserve de votre consentement, des cookies de mesure d'audience. Vous pouvez à tout moment paramétrer ou refuser les cookies via les réglages de votre navigateur.",
      },
      { type: 'h2', text: '9. Modification de la politique' },
      {
        type: 'p',
        text:
          "La présente politique peut être mise à jour à tout moment afin de refléter les évolutions légales ou techniques. La date de dernière mise à jour figure en tête de page. Nous vous invitons à la consulter régulièrement.",
      },
    ],
  },
];
