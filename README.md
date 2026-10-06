<p align="center">
  <img src="folio.svg" width="88" alt="Icône de Folio">
</p>

<h1 align="center">Folio</h1>

<p align="center">
  Un lecteur et éditeur de fichiers Markdown (<code>.md</code>) pour Windows et Linux, pensé pour la lecture.
</p>

<p align="center">
  <b>Gratuit · fonctionne hors ligne</b><br>
  <sub>Français · English · Español · Deutsch · Nederlands · Italiano · Português</sub>
</p>

| Votre ordinateur | Télécharger |
| --- | --- |
| Windows 10 ou 11, 64 bits | [Installateur Windows](https://github.com/myrvmsr/folio/releases/latest/download/Folio-Setup.exe) |
| Ubuntu / Debian, 64 bits | [Paquet Linux .deb](https://github.com/myrvmsr/folio/releases/latest/download/Folio-Linux-x64.deb) |
| Autres distributions Linux, 64 bits | [Version portable AppImage](https://github.com/myrvmsr/folio/releases/latest/download/Folio-Linux-x64.AppImage) |

Les fichiers [SHA256SUMS.txt](https://github.com/myrvmsr/folio/releases/latest/download/SHA256SUMS.txt) permettent de vérifier l’intégrité des téléchargements.

<p align="center">
  <img src="captures/lecture.png" alt="Folio affichant un document Markdown" width="860">
</p>

## Nouveau dans la version 1.3

- **Folio arrive sur Linux.** Un paquet `.deb` pour Ubuntu / Debian et une version portable `.AppImage`.
- Ouverture des fichiers depuis les gestionnaires de fichiers Linux et gestion des chemins propre à chaque système.
- Les installateurs sont vérifiés sur Windows et Ubuntu avant publication : démarrage, affichage Markdown, édition, enregistrement automatique, opérations sur les dossiers et création de PDF.

## Nouveau dans la version 1.2

- **Plume devient Folio.** Installez simplement Folio : l'ancienne version de Plume est retirée automatiquement, et vos réglages, espaces et dossiers sont conservés.

## Nouveau dans la version 1.1

- **Panneau Dossiers** : ajoutez vos dossiers de notes et retrouvez vos documents en arbre. Vous pouvez créer, renommer, ranger par glisser-déposer et mettre à la corbeille sans quitter Folio.
- **Enregistrement automatique**, activé par défaut : vos modifications sont enregistrées une seconde après la dernière frappe, comme dans VS Code.
- **Sept langues** : français, anglais, espagnol, allemand, néerlandais, italien et portugais.
- **Bouton Copier** sur tous les blocs de code, aussi en mode Édition.

Déjà installé ? Voir [Mettre à jour](#mettre-à-jour).

## Fonctionnalités

### Un affichage soigné

- Une typographie pensée pour la lecture : titres bien hiérarchisés, listes, citations, tableaux, images et liens.
- **Code** coloré dans près de 200 langages. Un bouton **Copier** sur chaque bloc copie tout le code d'un clic, sans rien sélectionner. Il reste à portée de main pendant qu'on fait défiler un long bloc.
- **Formules mathématiques** (`$…$` et `$$…$$`).
- **Diagrammes** Mermaid (organigrammes, séquences, Gantt…), aux couleurs du thème.
- **Encadrés** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` et `[!CAUTION]`.
- **Listes de tâches cliquables** : cocher une case met le fichier à jour.
- Notes de bas de page, sections repliables, métadonnées YAML présentées dans une fiche « Propriétés », adresses web transformées en liens.

### Une lecture confortable

- **Sommaire** cliquable qui suit votre lecture, à gauche ou à droite.
- **Recherche** dans le document, sans tenir compte des accents : « ete » trouve « été ».
- **Taille du texte** (aussi avec <kbd>Ctrl</kbd> + molette), **largeur de lecture** et plein écran.
- **Rechargement automatique** : quand un autre programme (un assistant IA comme Claude, un éditeur…) modifie le fichier, l'affichage suit tout seul. Si vous avez des modifications non enregistrées, Folio vous demande quoi faire au lieu de les écraser.
- **Liens** : les liens web s'ouvrent dans le navigateur, un lien vers un autre `.md` l'ouvre dans Folio, et les ancres mènent à la bonne section.
- **Export PDF** et **impression**, toujours sur fond blanc.

### Écrire et modifier

- **Mode Édition** (<kbd>Ctrl</kbd>+<kbd>E</kbd>) : le texte source, coloré, à côté de l'aperçu mis à jour en direct, avec un défilement synchronisé. L'aperçu peut se masquer pour ne garder que le texte. Les blocs de code y ont aussi leur bouton **Copier**.
- **Enregistrement automatique** : par défaut, une seconde après la dernière frappe. On peut aussi choisir toutes les *N* minutes, au changement d'onglet ou de fenêtre, ou le désactiver.
- **Mise en forme au clavier** : gras, italique, barré, code, lien, ainsi que rechercher et remplacer.
- **Correcteur orthographique** (facultatif) et point orange sur l'onglet tant que le document n'est pas enregistré. Si l'enregistrement automatique est désactivé, Folio demande confirmation avant de fermer un document modifié.

<p align="center">
  <img src="captures/edition.png" alt="Mode Édition : le texte source à gauche, l'aperçu à droite" width="860">
</p>

### Vos dossiers, rangés comme sur votre disque

- Le bouton en forme de dossier, à côté du logo, ouvre le **panneau Dossiers**. Ajoutez-y un ou plusieurs dossiers : leurs sous-dossiers et leurs documents Markdown s'affichent en arbre, et un clic ouvre un document.
- **Créez** un document ou un sous-dossier depuis les boutons qui apparaissent au survol d'un dossier ; le nom se tape directement dans l'arbre.
- **Renommez** (<kbd>F2</kbd>), **rangez** un fichier en le glissant sur un autre dossier, ou **mettez-le à la corbeille** (<kbd>Suppr</kbd>), récupérable dans la corbeille du système. Les onglets ouverts suivent le mouvement.
- Le panneau se met à jour tout seul quand un autre programme ajoute ou supprime des fichiers. Les dossiers cachés (`.git`, `.obsidian`…) n'y apparaissent pas.

<p align="center">
  <img src="captures/dossiers.png" alt="Le panneau Dossiers : un arbre de notes à gauche, le document ouvert à droite" width="860">
</p>

### Onglets horizontaux ou verticaux

- Plusieurs documents ouverts en **onglets** : on passe de l'un à l'autre au clavier, on rouvre un onglet fermé par erreur, on ferme tous les autres d'un clic droit.
- Les onglets se placent **en haut de la fenêtre**, comme dans un navigateur, ou **dans un panneau vertical** à gauche, comme dans Brave. Ce panneau a trois états :
  - **déplié** : le nom de chaque document ; glissez son bord pour l'élargir ;
  - **réduit** : une fine colonne d'icônes qui se déplie au survol de la souris, sans déplacer le texte ;
  - **masqué** : plus rien n'est affiché, et le panneau ressort dès que la souris touche le bord gauche de la fenêtre. Un bouton dans le panneau le masque, et un raccourci le masque ou le réaffiche.

<table>
  <tr>
    <td align="center"><img src="captures/onglets-verticaux.png" alt="Panneau d'onglets vertical déplié"><br><sub>Panneau déplié</sub></td>
    <td align="center"><img src="captures/onglets-reduits.png" alt="Panneau d'onglets vertical réduit à une colonne d'icônes"><br><sub>Panneau réduit</sub></td>
  </tr>
</table>

### Des espaces pour ranger vos onglets

- Créez autant d'**espaces** que vous voulez (« Travail », « Perso », « Projet »…), chacun avec **son nom et sa couleur** et ses propres onglets.
- Passez d'un espace à l'autre d'un clic sur sa pastille ou au clavier.
- Rangez un onglet dans un autre espace d'un clic droit, ou en le glissant sur la pastille de l'espace.
- Renommez, recolorez ou supprimez un espace à tout moment.
- À la réouverture, Folio retrouve vos espaces et leurs onglets comme vous les avez laissés (désactivable).

### Le thème à votre goût

- **Mode clair, sombre ou automatique** (il suit alors le système).
- **Couleur d'accentuation** : huit couleurs proposées, ou n'importe quelle autre.
- **Couleur de fond et couleur du texte**, réglées séparément pour le mode clair et le mode sombre. Toute l'interface s'accorde à vos couleurs, et Folio prévient si le texte devient difficile à lire.
- **Quatre polices** (Sérif, Sans, Système, Mono), taille du texte et largeur de lecture.

<p align="center">
  <img src="captures/apparence.png" alt="Paramètres d'apparence avec un thème bleu personnalisé" width="860">
</p>

### En sept langues

- Folio parle **français, anglais, espagnol, allemand, néerlandais, italien et portugais**. Par défaut, il suit la langue du système.
- Changement immédiat dans **Paramètres › Langue** : menus, boutons, messages, noms des touches et correcteur orthographique.

### Des raccourcis clavier personnalisables

- Chaque action a un raccourci modifiable : cliquez dessus, tapez la nouvelle combinaison, c'est enregistré. Une action peut avoir plusieurs raccourcis.
- Une combinaison ne peut servir qu'à une seule action : si elle est déjà prise, Folio le signale et propose de la réattribuer. Les raccourcis du système (copier, coller, annuler…) restent protégés.
- Les claviers AZERTY sont pris en charge.

### Vos fichiers sur chaque système

- Ouvrez vos `.md` d'un double-clic, en les glissant dans la fenêtre, depuis le **panneau Dossiers** ou depuis les **fichiers récents** de l'écran d'accueil.
- Une seule fenêtre : un fichier ouvert depuis le gestionnaire de fichiers s'ajoute en onglet.
- Copier le texte Markdown ou le chemin du fichier, afficher le fichier dans le gestionnaire de fichiers.
- Fonctionne **hors ligne** : les polices et les outils d'affichage sont intégrés.

## Installation

### Windows

1. Téléchargez **Folio-Setup.exe** avec le lien en haut de la page. Si le navigateur demande confirmation, choisissez **Conserver**.
2. Lancez le fichier. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**, puis **Exécuter quand même** : cet avertissement apparaît parce que Folio n'est pas signé numériquement.
3. Folio s'installe en quelques secondes, sans droits administrateur, puis s'ouvre.

> [!NOTE]
> Si le **Contrôle intelligent des applications** de Windows 11 est activé sur votre PC, Windows bloque Folio sans proposer de passer outre. Folio ne peut pas être utilisé sur ces PC pour le moment.

### Ouvrir les fichiers `.md` d'un double-clic

Clic droit sur un fichier `.md` › **Ouvrir avec** › **Choisir une autre application** › **Folio** › **Toujours**.

### Linux

**Ubuntu / Debian :** téléchargez le fichier `.deb`, puis ouvrez-le avec votre gestionnaire de logiciels. Vous pouvez aussi l’installer depuis son dossier avec :

```bash
sudo apt install ./Folio-Linux-x64.deb
```

**Version portable :** téléchargez l’AppImage, autorisez son exécution dans les propriétés du fichier, puis ouvrez-le. Depuis son dossier :

```bash
chmod +x Folio-Linux-x64.AppImage
./Folio-Linux-x64.AppImage
```

Si votre environnement empêche le montage d’une AppImage, utilisez le mode d’extraction du lanceur :

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./Folio-Linux-x64.AppImage
```

Les versions Linux sont destinées aux ordinateurs **x64** et sont vérifiées sous **Ubuntu 24.04**. Pour associer les `.md` à Folio, utilisez **Ouvrir avec** dans votre gestionnaire de fichiers ; le paquet `.deb` ajoute Folio au menu des applications.

### Mettre à jour

Folio ne se met pas à jour tout seul. Pour passer à la dernière version :

1. **Fermez Folio.**
2. Téléchargez la version correspondant à votre système avec les liens en haut de la page.
3. Sur Windows, lancez l’installateur. Sur Linux, installez le nouveau `.deb` ou remplacez votre AppImage.

Inutile de désinstaller l'ancienne version : la nouvelle la remplace et garde vos réglages, vos espaces et vos dossiers. Votre version s'affiche dans le menu **⋯** › **À propos de Folio**.

### Désinstaller

- **Windows :** **Paramètres › Applications › Applications installées › Folio › Désinstaller**.
- **Linux .deb :** désinstallez Folio avec votre gestionnaire de logiciels ou `sudo apt remove folio-markdown`.
- **Linux AppImage :** supprimez le fichier AppImage.

## Raccourcis par défaut

Le tableau utilise les touches Windows / Linux.

| Action | Raccourci |
| --- | --- |
| Ouvrir un fichier / nouveau document | <kbd>Ctrl</kbd>+<kbd>O</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd> |
| Enregistrer | <kbd>Ctrl</kbd>+<kbd>S</kbd> |
| Lecture / édition | <kbd>Ctrl</kbd>+<kbd>E</kbd> |
| Afficher ou masquer l'aperçu (édition) | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>P</kbd> |
| Rechercher | <kbd>Ctrl</kbd>+<kbd>F</kbd> |
| Sommaire | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>O</kbd> |
| Panneau Dossiers | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>D</kbd> |
| Onglet suivant / onglet n° 1 à 9 | <kbd>Ctrl</kbd>+<kbd>Tab</kbd> / <kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd> |
| Rouvrir l'onglet fermé | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>T</kbd> |
| Panneau vertical : déplier ou réduire | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>B</kbd> |
| Panneau vertical : masquer ou afficher | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>M</kbd> |
| Espace suivant / précédent | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Pg suiv.</kbd> / <kbd>Pg préc.</kbd> |
| Exporter en PDF / imprimer | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>E</kbd> / <kbd>Ctrl</kbd>+<kbd>P</kbd> |
| Plein écran | <kbd>F11</kbd> |
| Paramètres | <kbd>Ctrl</kbd>+<kbd>,</kbd> |
| Tous les raccourcis, modifiables | <kbd>F1</kbd> |

---

<sub>Folio intègre des logiciels libres (Electron, markdown-it, KaTeX, Mermaid, CodeMirror, highlight.js…) et les polices Source Serif 4, Inter et JetBrains Mono. Leurs licences sont reproduites dans <code>THIRD-PARTY-NOTICES.txt</code>, dans le dossier d'installation de Folio.</sub>
