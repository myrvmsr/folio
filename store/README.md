# Publier Folio sur le Microsoft Store

Le Microsoft Store sera un second canal de distribution. Les installateurs Windows et Linux sur GitHub restent disponibles. Le Store installera Folio, proposera ses mises à jour et permettra sa désinstallation depuis Windows.

La construction MSIX est prête dans ce projet. Avant la réservation de l’application dans ton compte Microsoft, le package `Folio-Store-Preview-1.3.0-x64.msix` sert uniquement à valider la construction. Son identité fictive ne peut pas être déposée dans le Store.

Les captures de la fiche sont dans `store/listing/fr-FR/` et `store/listing/en-US/`. Ce sont des captures réelles de Folio à 1600 × 1000 pixels, avec des notes fictives. Pour les recréer après une modification : `npm run build`, puis `npm run screenshots:store`. Le logo de la fiche est `store/listing/ListingLogo.png` (300 × 300).

## 1. Créer le compte et réserver le nom

1. Commence sur [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com/) puis choisis **Get started for free**. La nouvelle inscription est gratuite. Utilise ton compte Microsoft et réalise toi-même la vérification d’identité demandée par Microsoft.
2. Choisis le type de compte qui correspond à ton activité : **Individual** pour un projet personnel non professionnel, ou **Company** pour une activité professionnelle. [Critères et parcours officiels](https://learn.microsoft.com/windows/apps/publish/partner-center/open-a-developer-account).
3. Dans le Centre des partenaires, ouvre **Apps & games**, crée un produit de type **MSIX or PWA app** et réserve **Folio**. Si ce nom est indisponible, réserve un autre nom adapté, par exemple **Folio Markdown**, et indique ce nom exact dans `displayName` ci-dessous.
4. Ouvre **Product management → Product identity**. Recopie les valeurs de **Package/Identity/Name**, **Package/Identity/Publisher** et **Package/Properties/PublisherDisplayName**. Elles sont attribuées par Microsoft ; le nom GitHub ou `com.folio.markdown` ne les remplace pas. [Documentation de l’identité](https://learn.microsoft.com/windows/apps/publish/view-app-identity-details).

Tu peux transmettre ces trois valeurs dans ce chat : elles ne sont pas des mots de passe. La connexion, les codes de vérification et les justificatifs d’identité restent chez Microsoft.

## 2. Construire le package associé à ton compte

Copie `store/identity.example.json` vers `store/identity.local.json`, puis remplace les valeurs par celles du Centre des partenaires. `displayName` doit correspondre au nom réservé. Ce fichier local est exclu de Git et du package.

```json
{
  "identityName": "VALEUR_DE_Package_Identity_Name",
  "publisher": "CN=IDENTIFIANT_FOURNI_PAR_MICROSOFT",
  "publisherDisplayName": "NOM_EDITEUR_FOURNI_PAR_MICROSOFT",
  "displayName": "Folio"
}
```

Depuis Windows, dans le dossier du projet :

```powershell
npm test
npm run check-locales
npm run dist:store
```

Le résultat est `release/store/Folio-Store-1.3.0-x64.msix`, avec un rapport `package-info.json`. La version du manifeste est `1.3.0.0` : la quatrième partie est réservée au Store. Le script refuse une identité absente ou les valeurs d’exemple. Pour construire avant l’inscription : `npm run dist:store:preview`.

La cible AppX d’electron-builder 26 produit le conteneur MSIX avec le manifeste de Folio, ses icônes, ses langues et les associations Markdown. Le package utilise Windows 10 version 2004 ou ultérieure, Windows 11 et une architecture x64.

Pour reconstruire dans GitHub Actions, ajoute la variable de dépôt **FOLIO_STORE_IDENTITY_JSON** contenant le même JSON, puis lance **Prepare Folio for Microsoft Store** et désactive l’option **preview**. Les fichiers apparaîtront dans l’artefact **folio-microsoft-store-x64**. Ce workflow prépare les fichiers ; il ne soumet pas automatiquement l’application.

Le workflow teste aussi une copie signée uniquement pour les tests : il l’installe dans sa machine Windows temporaire, la lance avec l’identité de package attribuée par Windows, vérifie lecture/rendu, fichiers, enregistrement automatique, renommages et export PDF, puis la désinstalle. Le certificat est ensuite retiré. La copie signée pour ces tests et les clés ne sont jamais publiées ; le MSIX à déposer reste inchangé. Ce test ne doit pas être exécuté sur ton PC personnel.

## 3. Vérifier avant soumission

La construction valide le manifeste avec MakeAppx et vérifie ensuite les fichiers, les icônes, les langues, les associations, la version et l’identité contenus dans l’archive. Cela ne remplace pas les tests d’installation ni la certification Microsoft.

Le MSIX à déposer n’est pas signé par nous : [Microsoft le signera après certification](https://learn.microsoft.com/windows/apps/publish/publish-your-app/msix/app-package-requirements). Pour des tests d’installation hors Store, il faut une copie signée avec un certificat de test approuvé uniquement sur un PC ou une machine virtuelle de test. Conserve le package de soumission original. Un certificat de test n’est pas destiné aux téléchargements GitHub.

Sur ce PC de test, exécute le [Windows App Certification Kit](https://learn.microsoft.com/windows/uwp/debug-test-perf/windows-app-certification-kit), puis vérifie :

- installation, ouverture depuis le menu Démarrer et désinstallation ;
- ouverture d’un fichier `.md` depuis **Ouvrir avec**, y compris un nom avec espaces et accents ;
- lecture, édition, enregistrement, dossiers, export PDF et restauration de session ;
- coexistence avec la version GitHub sans retrait de ses raccourcis ni de ses associations ;
- conservation des documents lors d’une désinstallation. Les réglages propres au package peuvent être retirés par Windows.

Après certification, installer la version effectivement distribuée depuis le Store sur un autre compte Windows reste la vérification finale.

## 4. Compléter la fiche et soumettre

Dans une nouvelle soumission :

1. **Pricing and availability** : Folio est actuellement gratuit et sans achats intégrés. Choisis les pays où tu souhaites le proposer.
2. **Properties** : catégorie **Productivity**, application de bureau, sans connexion à un compte nécessaire. Utilise la licence MIT du projet. Si le portail réclame un contact ou des informations légales sur l’éditeur, indique tes informations exactes.
3. **Age ratings** : réponds au questionnaire en fonction des fonctionnalités de Folio. L’application affiche les documents choisis par l’utilisateur et n’inclut ni réseau social ni boutique de contenu.
4. **Packages** : dépose le `.msix` du dossier `release/store/`, reconstruit avec ton identité Microsoft. Les fichiers **Preview** ne doivent pas être déposés.
5. **Store listings** : utilise les textes `store/listing/fr-FR.md` et `en-US.md`, le logo `ListingLogo.png` et les captures. Pour commencer avec ces deux fiches, retire les autres langues de fiche dans **Add/remove languages** ; cela ne retire pas les langues de l’interface de Folio. Tu peux compléter les autres fiches plus tard. Laisse le champ **What's new** vide pour cette première soumission.
6. **Privacy policy URL** : la politique est publiée à `https://github.com/myrvmsr/folio/blob/main/PRIVACY.md`. Sa copie source est `store/PRIVACY.md`. Vérifie son contenu et son accessibilité avant de soumettre.
7. **Notes for certification** : colle le texte de `store/listing/certification-notes.md`. Il explique la capacité `runFullTrust` et le parcours de test sans compte.
8. Vérifie le récapitulatif puis utilise **Submit to the Store**. Microsoft effectue la certification ; la préparation locale ne garantit ni l’acceptation ni une date de publication.

Une fois l’application publiée, la page **Product identity** donnera un lien `https://apps.microsoft.com/detail/IDENTIFIANT_STORE`. Ajoute ce lien aux téléchargements de la page GitHub. Les utilisateurs pourront alors cliquer sur **Installer** dans Microsoft Store. Le Store gérera les mises à jour de ce canal.

## Distribution sur GitHub

`npm run dist:win` construit toujours `release/Folio-Setup.exe`. Le MSIX envoyé au Store et cet EXE sont deux fichiers distincts. La signature fournie par Microsoft pour le Store ne signe pas l’EXE téléchargé sur GitHub : l’avertissement SmartScreen de cette distribution continuera tant qu’une signature reconnue et une réputation suffisante n’auront pas été établies.

Pour chaque future version, incrémente la version du projet, reconstruis et teste les canaux concernés, puis soumets le nouveau MSIX dans le Centre des partenaires. Les règles de publication Windows/Linux de GitHub restent celles de `scripts/release-policy.mjs`. La distribution Mac reste en attente.
