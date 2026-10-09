# Tester Folio avant une nouvelle version

Le workflow [Build and verify Folio](.github/workflows/build.yml) s’exécute à chaque push sur `main`, à chaque pull request vers `main`, pour les tags `v*` et à la demande. Il vérifie Windows x64 et Linux x64 sur Ubuntu 24.04.

## Ce qui est testé

Les tests utilisent les sources puis **les applications issues des installateurs**. Construire un paquet ne suffit pas à le valider.

| Série | Vérification |
| --- | --- |
| Tests de logique | Chemins, liens Markdown, raccourcis, politique de distribution et refus des preuves de test incomplètes |
| Traductions | Toutes les clés utilisées sont présentes dans les sept langues |
| 16 scénarios de l’interface | Clics, clavier, éditeur réel et fichiers réellement enregistrés |
| Quatre scénarios dans chaque paquet | Rendu, fichiers, enregistrement automatique, renommage d’un dossier racine, surveillance et PDF |
| Installation | Installation silencieuse Windows, installation du DEB avec `apt`, validation du lanceur Linux, exécution directe de l’AppImage |
| Fichiers à publier | Version, commit testé et empreinte SHA-256 de chaque installateur |

Les 16 scénarios de l’interface couvrent :

1. Markdown hors ligne : titres, tableaux, code, formules et diagrammes.
2. Édition, aperçu en direct et enregistrement automatique.
3. Création d’un document et enregistrement dans un vrai fichier.
4. Protection des modifications non enregistrées à la fermeture d’un onglet.
5. Cases à cocher et liens vers un autre document Markdown.
6. Recherche sans accents et navigation dans le sommaire.
7. Changement, fermeture et réouverture d’onglets, et onglets verticaux.
8. Création d’espaces de travail et déplacement d’un onglet entre espaces.
9. Thème, police, couleur et changement des sept langues.
10. Plusieurs dossiers, création et renommage, noms invalides et doublons.
11. Modifications externes et protection d’un document en conflit.
12. Restauration des réglages, espaces, dossiers et onglets après redémarrage.
13. Export d’un véritable PDF et copie d’un bloc de code.
14. Suppression puis réapparition d’un fichier ouvert.
15. Personnalisation des raccourcis et détection des conflits.
16. Affichage de Markdown contenant du HTML dangereux sans exécuter ses scripts.

Chaque scénario démarre une nouvelle instance de Folio avec ses propres fichiers et réglages dans `.folio-checks/`. Les notes et le profil habituel du propriétaire ne sont pas utilisés. Les boîtes de dialogue natives et le presse-papiers reçoivent des réponses contrôlées ; l’interface de Folio, ses opérations sur les fichiers, la surveillance et la production du PDF fonctionnent réellement. L’installation et le démarrage des paquets sont vérifiés séparément sur le système concerné.

## Lancer les vérifications sur ce PC

Après `npm ci` :

```powershell
npm test
npm run check-locales
npm run test:e2e
npm run test:smoke
```

Les deux dernières commandes compilent l’interface avant de lancer les tests. Sur une machine Linux sans écran, les lancer avec `xvfb-run -a`.

Pour tester une application installée construite depuis les sources actuelles :

```powershell
node scripts/smoke.mjs "--executable=C:\chemin\Folio.exe" --label=installed
node scripts/test-e2e.mjs "--executable=C:\chemin\Folio.exe" --label=installed
```

Dans la CI Linux, les mêmes commandes sont exécutées avec `/opt/Folio/folio` et le label `deb`, puis avec `release/Folio-Linux-x64.AppImage` et le label `appimage`. Le sandbox n’est pas désactivé par ces tests.

Pour la version depuis les sources sous Linux, le workflow attribue à `node_modules/electron/dist/chrome-sandbox` le propriétaire `root` et le mode `4755` requis par Electron. Cette préparation concerne le moteur de développement sur la machine CI ; les applications installées sont testées avec les permissions données par leur installateur.

## Rapports et publication

Le workflow exécute les 16 scénarios deux fois sous Windows (sources et application installée), et trois fois sous Linux (sources, DEB et AppImage), soit **80 exécutions de scénarios de l’interface**. Les tests de logique et les traductions doivent passer sur les deux machines. Tous les contrôles des quatre scénarios dans chaque paquet doivent également réussir.

Les rapports JSON, JUnit et HTML, les captures, les traces et les journaux sont conservés 14 jours dans les artefacts du workflow. Le rapport HTML permet d’ouvrir une trace pour examiner les actions et l’état de l’interface. Les tests utilisent uniquement leurs fichiers et profils isolés. Les rapports locaux restent dans `.folio-checks/` et ce dossier est ignoré par Git.

Les installateurs vérifiés portent un rapport `QUALITY.json`. `scripts/prepare-release.mjs` vérifie ce rapport et les étapes réussies des deux tâches natives. `scripts/publish-release.mjs` effectue à nouveau ces contrôles avant de créer ou publier un brouillon et relit les empreintes des fichiers locaux.

Les scripts refusent un test manquant, échoué, ignoré ou réussi seulement après une nouvelle tentative, un résultat appartenant à une autre version ou à un autre commit, et un installateur modifié après les tests. Une ancienne exécution verte sans ces nouvelles preuves ne peut pas servir à une nouvelle publication. Les tests ciblés de `tests/quality-gate.test.mjs` vérifient aussi ces refus.

Les scripts de récupération et de publication des releases sont réservés à la maintenance. Ils utilisent encore le dépôt de construction privé `folio-build` et nécessitent les accès GitHub du mainteneur. Ils ne sont pas nécessaires pour compiler Folio ou contribuer au code. Une exécution des tests ne publie pas automatiquement une release publique.

## Comprendre une tâche rouge

Le rouge dans GitHub Actions signifie qu’une étape de **cette exécution** a échoué. Ouvrir la tâche puis la première étape rouge pour consulter son erreur. Dans le checkout de maintenance, on peut aussi lancer :

```powershell
node scripts/ci-status.mjs <identifiant> --logs
```

Le bouton **Re-run jobs** reprend le commit de l’exécution d’origine, même si des corrections ont été poussées depuis. Pour tester les derniers changements, ouvrir **Actions → Build and verify Folio → Run workflow**, choisir **main**, puis lancer une nouvelle exécution. Le champ `sha` affiché par `ci-status.mjs` indique le code effectivement testé. Voir la [documentation GitHub sur les relances](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

Le scénario de renommage attend le message de refus d’un doublon avant de saisir un autre nom. Il ralentit volontairement une recherche du fichier existant, en conservant le véritable résultat du disque, pour vérifier cette attente aussi lorsque les opérations prennent du temps.

Le contrôle de sauvegarde automatique dans les paquets retient le minuteur créé par la frappe, vérifie son délai de 1 000 ms et son remplacement après une seconde frappe, puis déclenche son véritable callback. L’éditeur, les autres minuteurs, les appels IPC et les écritures sur disque restent réels. Cela évite de supposer qu’une attente de 400 ms se termine avant une seconde sur une machine CI chargée.

Le paquet DEB utilise le nom stable `Folio-Linux-x64.deb`. Le workflow et les scripts de publication attendent ce même nom.

Les scénarios utilisent [Playwright pour Electron](https://playwright.dev/docs/api/class-electron). Leur liste obligatoire se trouve dans `tests/e2e/scenarios.mjs`, leurs actions dans `tests/e2e/app.spec.mjs` et la validation des preuves dans `scripts/quality-gate.mjs`.
