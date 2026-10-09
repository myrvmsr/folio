# Utiliser Folio

Folio est un lecteur et éditeur Markdown pour Windows et Linux. Voici les réglages et les gestes utiles au quotidien.

## Utilisation

- **Ouvrir** : double-clic sur un `.md`, <kbd>Ctrl</kbd>+<kbd>O</kbd>, ou glisser-déposer dans la fenêtre. Chaque fichier s'ouvre dans un onglet.
- **Lecture / Édition** : <kbd>Ctrl</kbd>+<kbd>E</kbd>. L'édition affiche le texte source à côté de l'aperçu, mis à jour en direct ; <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>P</kbd> masque ou affiche l'aperçu.
- **Copier du code** : chaque bloc de code a un bouton **Copier**, en lecture comme en édition. En lecture, il reste en haut de l'écran pendant qu'on fait défiler un long bloc.
- **Enregistrement automatique** : activé par défaut, comme dans VS Code. Voir ci-dessous.
- **Rechargement automatique** : quand un autre programme (Claude, un éditeur…) modifie un fichier ouvert, l'affichage se met à jour tout seul. Si vous avez des modifications non enregistrées, Folio vous demande quoi faire au lieu d'écraser votre travail.
- **Cases à cocher** : cliquer sur une case d'une liste de tâches modifie le fichier.
- **Sommaire** : panneau latéral (<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>O</kbd>), à gauche ou à droite, qui suit votre lecture.
- **Recherche** : <kbd>Ctrl</kbd>+<kbd>F</kbd>, sans tenir compte des accents (« ete » trouve « été »).
- **Export** : PDF (<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>E</kbd>) et impression (<kbd>Ctrl</kbd>+<kbd>P</kbd>), toujours sur fond blanc.

Le fichier [`exemples/Bienvenue dans Folio.md`](../exemples/Bienvenue%20dans%20Folio.md) montre tout ce que Folio sait afficher.

### Panneau Dossiers

Le bouton en forme de dossier, à côté du logo (ou <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>D</kbd>), affiche le panneau **Dossiers**. On y ajoute un ou plusieurs dossiers : bouton **+** du panneau, **Ouvrir un dossier** sur l'écran d'accueil ou dans le menu **⋯**, ou glisser un dossier dans la fenêtre. Leurs sous-dossiers et leurs documents Markdown s'affichent en arbre.

- **Un clic** sur un document l'ouvre ; un clic sur un dossier le déplie ou le replie.
- **Au survol d'un dossier** : deux boutons pour créer un document ou un sous-dossier. Le nom se tape directement dans l'arbre (<kbd>Entrée</kbd> pour valider, <kbd>Échap</kbd> pour annuler). Le nouveau document s'ouvre en mode édition.
- **Clic droit** : renommer (<kbd>F2</kbd>), afficher dans l'Explorateur, copier le chemin, mettre à la corbeille (<kbd>Suppr</kbd>). Sur un dossier ajouté au panneau : actualiser ou le retirer du panneau. Le retirer ne supprime rien.
- **Ranger** : glissez un document ou un dossier sur un autre dossier pour l'y déplacer. Un dossier fermé s'ouvre si l'on reste un instant dessus.
- Les onglets ouverts suivent les renommages et les déplacements. Mettre un fichier à la corbeille ferme son onglet s'il n'a pas de modifications.
- Le panneau se met à jour quand un autre programme crée, renomme ou supprime des fichiers. Les fichiers et dossiers cachés (`.git`, `.obsidian`…) n'apparaissent pas.
- Par défaut, seuls les documents Markdown (et `.txt`) sont listés. **Paramètres › Comportement › Afficher tous les fichiers** montre aussi les autres (images, PDF…), qui s'ouvrent avec leur application habituelle.

### Enregistrement automatique

**Paramètres › Comportement › Enregistrement automatique** propose quatre réglages :

| Réglage | Effet |
| --- | --- |
| **Après chaque modification** (par défaut) | Le fichier est enregistré une seconde après la dernière frappe. |
| **À intervalle régulier** | Tous les fichiers modifiés sont enregistrés toutes les *N* minutes (5 par défaut, de 1 à 120). |
| **En changeant d'onglet ou de fenêtre** | Le document est enregistré quand on passe à un autre onglet ou à une autre application. |
| **Désactivé** | Uniquement avec <kbd>Ctrl</kbd>+<kbd>S</kbd>, comme avant. |

Tant que l'enregistrement automatique est actif, fermer un onglet ou Folio enregistre les fichiers modifiés au lieu de poser la question. Un **nouveau document** doit d'abord être enregistré une fois (<kbd>Ctrl</kbd>+<kbd>S</kbd>) pour lui choisir un nom et un dossier. Si un autre programme a modifié le fichier entre-temps, Folio n'écrase rien et affiche le bandeau habituel.

### Langues

**Paramètres › Langue** : français, English, español, Deutsch, Nederlands, italiano, português. Par défaut, Folio suit la langue de Windows et prend l'anglais si celle-ci n'est pas disponible. Le changement est immédiat : menus, boutons, messages, boîtes de dialogue, noms des touches dans les raccourcis (« Strg+Umschalt » en allemand…) et correcteur orthographique.

### Onglets verticaux et espaces

- **Onglets verticaux** : menu **⋯** › **Onglets verticaux**, ou **Paramètres › Onglets et espaces**. Le panneau de gauche a trois états :
  - **déplié** : les onglets avec leur nom (bord droit du panneau : glisser pour l'élargir) ;
  - **réduit** : une fine colonne d'icônes, qui se déplie au survol de la souris sans déplacer le texte ;
  - **masqué** : rien n'est affiché, le panneau apparaît quand la souris touche le bord gauche de la fenêtre.

  <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>B</kbd> passe de déplié à réduit et inversement. Pour **masquer** le panneau : le bouton en forme d'œil barré dans son en-tête, ou <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>M</kbd>. Le même raccourci le réaffiche tel qu'il était (déplié ou réduit). Une fois masqué, il ressort aussi dès que la souris touche le bord gauche de la fenêtre.
- **Espaces** : un espace regroupe des onglets sous un nom et une couleur (« Travail », « Perso »…). On change d'espace avec les pastilles en bas du panneau (ou <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Pg suiv.</kbd> / <kbd>Pg préc.</kbd>). Pour déplacer un onglet : clic droit › **Déplacer vers un espace**, ou glisser l'onglet sur une pastille. Clic droit sur une pastille : renommer, changer la couleur, supprimer.
- **Session** : à la réouverture, Folio retrouve vos espaces et leurs onglets (désactivable dans les paramètres). Les fichiers ne sont lus qu'au moment où vous ouvrez leur onglet.

### Raccourcis clavier personnalisables

<kbd>F1</kbd> ouvre **Paramètres › Raccourcis clavier**. Cliquez sur un raccourci puis tapez la nouvelle combinaison (<kbd>Échap</kbd> pour annuler, <kbd>Retour arrière</kbd> pour le supprimer), ou sur **+** pour en ajouter un. Une combinaison ne peut servir qu'à une seule action : si elle est déjà prise, Folio propose de la réattribuer. Les combinaisons du système (copier, coller, annuler…) sont protégées.

### Apparence

**Paramètres › Apparence** : mode automatique, clair ou sombre ; couleur d'accentuation (huit couleurs proposées ou n'importe quelle autre) ; arrière-plan et avant-plan (texte), réglés séparément pour le mode clair et le mode sombre ; police, taille et largeur du texte. Toutes les nuances de l'interface sont calculées à partir de ces couleurs, et Folio prévient si le contraste devient trop faible.
