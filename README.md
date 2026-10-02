<p align="center">
  <img src="plume.svg" width="88" alt="Icône de Plume">
</p>

<h1 align="center">Plume</h1>

<p align="center">
  Un lecteur et éditeur de fichiers Markdown (<code>.md</code>) pour Windows, pensé pour la lecture.
</p>

<p align="center">
  <a href="https://github.com/myrvmsr/plume/releases/latest/download/Plume-Setup.exe"><b>Télécharger Plume pour Windows</b></a><br>
  <sub>Windows 10 et 11, 64 bits · environ 100 Mo · gratuit</sub>
</p>

<p align="center">
  <img src="captures/lecture.png" alt="Plume affichant un document Markdown" width="860">
</p>

## Fonctionnalités

### Un affichage soigné

- Une typographie pensée pour la lecture : titres bien hiérarchisés, listes, citations, tableaux, images et liens.
- **Code** coloré dans près de 200 langages, avec un bouton **Copier**.
- **Formules mathématiques** (`$…$` et `$$…$$`).
- **Diagrammes** Mermaid (organigrammes, séquences, Gantt…), aux couleurs du thème.
- **Encadrés** `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` et `[!CAUTION]`.
- **Listes de tâches cliquables** : cocher une case met le fichier à jour.
- Notes de bas de page, sections repliables, métadonnées YAML présentées dans une fiche « Propriétés », adresses web transformées en liens.

### Une lecture confortable

- **Sommaire** cliquable qui suit votre lecture, à gauche ou à droite.
- **Recherche** dans le document, sans tenir compte des accents : « ete » trouve « été ».
- **Taille du texte** (aussi avec <kbd>Ctrl</kbd> + molette), **largeur de lecture** et plein écran.
- **Rechargement automatique** : quand un autre programme (un assistant IA comme Claude, un éditeur…) modifie le fichier, l'affichage suit tout seul. Si vous avez des modifications non enregistrées, Plume vous demande quoi faire au lieu de les écraser.
- **Liens** : les liens web s'ouvrent dans le navigateur, un lien vers un autre `.md` l'ouvre dans Plume, et les ancres mènent à la bonne section.
- **Export PDF** et **impression**, toujours sur fond blanc.

### Écrire et modifier

- **Mode Édition** (<kbd>Ctrl</kbd>+<kbd>E</kbd>) : le texte source, coloré, à côté de l'aperçu mis à jour en direct, avec un défilement synchronisé. L'aperçu peut se masquer pour ne garder que le texte.
- **Mise en forme au clavier** : gras, italique, barré, code, lien, ainsi que rechercher et remplacer.
- **Correcteur orthographique** (facultatif) et point orange sur l'onglet tant que le document n'est pas enregistré. Plume demande confirmation avant de fermer un document modifié.

<p align="center">
  <img src="captures/edition.png" alt="Mode Édition : le texte source à gauche, l'aperçu à droite" width="860">
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
- À la réouverture, Plume retrouve vos espaces et leurs onglets comme vous les avez laissés (désactivable).

### Le thème à votre goût

- **Mode clair, sombre ou automatique** (il suit alors Windows).
- **Couleur d'accentuation** : huit couleurs proposées, ou n'importe quelle autre.
- **Couleur de fond et couleur du texte**, réglées séparément pour le mode clair et le mode sombre. Toute l'interface s'accorde à vos couleurs, et Plume prévient si le texte devient difficile à lire.
- **Quatre polices** (Sérif, Sans, Système, Mono), taille du texte et largeur de lecture.

<p align="center">
  <img src="captures/apparence.png" alt="Paramètres d'apparence avec un thème bleu personnalisé" width="860">
</p>

### Des raccourcis clavier personnalisables

- Chaque action a un raccourci modifiable : cliquez dessus, tapez la nouvelle combinaison, c'est enregistré. Une action peut avoir plusieurs raccourcis.
- Une combinaison ne peut servir qu'à une seule action : si elle est déjà prise, Plume le signale et propose de la réattribuer. Les raccourcis de Windows (copier, coller, annuler…) restent protégés.
- Les claviers AZERTY sont pris en charge.

### Bien intégré à Windows

- Ouvrez vos `.md` d'un double-clic, en les glissant dans la fenêtre ou depuis les **fichiers récents** de l'écran d'accueil.
- Une seule fenêtre : un fichier ouvert depuis l'Explorateur s'ajoute en onglet.
- Copier le texte Markdown ou le chemin du fichier, afficher le fichier dans l'Explorateur.
- Fonctionne **hors ligne** : les polices et les outils d'affichage sont intégrés.

## Installation

1. Téléchargez **Plume-Setup.exe** avec le lien en haut de la page. Si le navigateur demande confirmation, choisissez **Conserver**.
2. Lancez le fichier. Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**, puis **Exécuter quand même** : cet avertissement apparaît parce que Plume n'est pas signé numériquement.
3. Plume s'installe en quelques secondes, sans droits administrateur, puis s'ouvre.

> [!NOTE]
> Si le **Contrôle intelligent des applications** de Windows 11 est activé sur votre PC, Windows bloque Plume sans proposer de passer outre. Plume ne peut pas être utilisé sur ces PC pour le moment.

### Ouvrir les fichiers `.md` d'un double-clic

Clic droit sur un fichier `.md` › **Ouvrir avec** › **Choisir une autre application** › **Plume** › **Toujours**.

### Mettre à jour

Téléchargez et lancez la nouvelle version : elle remplace l'ancienne et garde vos réglages.

### Désinstaller

**Paramètres** de Windows › **Applications** › **Applications installées** › **Plume** › **Désinstaller**.

## Raccourcis par défaut

| Action | Raccourci |
| --- | --- |
| Ouvrir un fichier / nouveau document | <kbd>Ctrl</kbd>+<kbd>O</kbd> / <kbd>Ctrl</kbd>+<kbd>N</kbd> |
| Enregistrer | <kbd>Ctrl</kbd>+<kbd>S</kbd> |
| Lecture / édition | <kbd>Ctrl</kbd>+<kbd>E</kbd> |
| Afficher ou masquer l'aperçu (édition) | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>P</kbd> |
| Rechercher | <kbd>Ctrl</kbd>+<kbd>F</kbd> |
| Sommaire | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>O</kbd> |
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

<sub>Plume intègre des logiciels libres (Electron, markdown-it, KaTeX, Mermaid, CodeMirror, highlight.js…) et les polices Source Serif 4, Inter et JetBrains Mono. Leurs licences sont reproduites dans <code>THIRD-PARTY-NOTICES.txt</code>, dans le dossier d'installation de Plume.</sub>
