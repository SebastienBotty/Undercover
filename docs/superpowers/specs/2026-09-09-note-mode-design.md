# Undercover — Mode Note (v1) — Design

Sous-projet 2/2 du jeu Undercover. Réutilise l'intégralité du socle du
mode classique (salle, connexion/reconnexion, ordre de tour, vote
caché, élimination, timer, fin de partie, rejouer) — seule la nature
de ce qui est révélé en privé et la façon dont un tour d'indices
démarre changent.

## Contexte

Au lieu de recevoir un personnage, chaque joueur reçoit une **note**
(un nombre entre 0 et 20, choisi par l'hôte). Avant chaque manche, un
joueur vivant tiré au hasard doit annoncer un **thème** libre (ex.
« La puissance d'un épéiste de One Piece »). Chaque joueur donne
ensuite, à tour de rôle, un indice en texte libre — typiquement le nom
d'un personnage dont la note (sur ce thème) se rapproche de sa propre
note. Les Civils et les Undercover reçoivent chacun une note
différente choisie explicitement par l'hôte (pas de calcul de
proximité automatique comme en mode classique), et doivent deviner qui
a une note différente de la majorité à travers ces indices.

## Décision d'architecture

Le mode Note **étend** la classe `GameRoom` existante plutôt que de
dupliquer le socle commun ou d'introduire une couche d'abstraction par
mode : `RoomSettings.mode: 'classic' | 'note'` pilote quelques
branches ciblées dans `GameRoom.ts`, une nouvelle phase
(`THEME_SELECT`), et des champs optionnels sur `RoomState`/`Player`.
Tout le reste (connexion, reconnexion, vote, élimination, timer, fin
de partie, rejouer) est réutilisé sans modification. Une couche de
stratégie par mode serait prématurée pour seulement 2 modes (YAGNI) ;
un DO séparé dupliquerait tout le socle commun pour rien.

## Rôles et notes

- **Civils** : reçoivent `settings.civilNote`.
- **Undercover** : reçoivent `settings.undercoverNote`.
- **Mr. White** (optionnel) : ne reçoit aucune note (`note: null`,
  symétrique à `character: null` en mode classique). S'il est
  éliminé, il a une tentative pour deviner la note exacte des Civils ;
  s'il devine juste, il gagne seul.
- `civilNote` et `undercoverNote` sont tirés **au hasard** par le
  serveur au lancement de la partie (`generateDistinctNotes`), jamais
  choisis par l'hôte — contrairement à une première itération de ce
  document qui envisageait une saisie manuelle, corrigée après coup.
  `civilNote` est tiré uniformément dans [0, 20] ; `undercoverNote` est
  ensuite tiré uniformément parmi les valeurs de [0, 20] dont l'écart
  avec `civilNote` est compris entre `MIN_NOTE_GAP` (2) et
  `MAX_NOTE_GAP` (6) inclus — cet ensemble n'est jamais vide, même aux
  extrêmes (`civilNote` à 0 ou 20). Les deux notes sont donc toujours
  différentes, et leur écart reste à la fois assez grand pour rester
  déductible et assez petit pour rester comparable via les indices
  donnés en jeu. Les deux valeurs restent exposées dans
  `room.settings` (donc visibles dans chaque snapshot) une fois la
  partie lancée, pour affichage éventuel côté client.

Conditions de victoire : identiques au mode classique (majorité de
Civils vivants élimine tous les Undercover/Mr. White ; Undercover
gagnent si leur nombre ≥ nombre de Civils vivants ; Mr. White gagne
seul s'il devine juste après élimination).

## Machine à états

Nouvelle phase **`THEME_SELECT`**, insérée avant chaque tour d'indices
(uniquement si `settings.mode === 'note'`) :

```
LOBBY → ROLE_REVEAL
  → [ THEME_SELECT (un joueur vivant tiré au hasard écrit un thème
        libre, visible de tous dès soumission ; même timer que le
        tour d'indices — voir "Timer" ci-dessous)
      → CLUE_ROUND (indices en texte libre, comme le mode classique,
        aucune validation serveur du contenu)
      → (répété CLUE_ROUNDS_PER_VOTE fois → VOTE, comme le mode
        classique)
      → ELIMINATION
      → vérification des conditions de victoire
      → si personne ne gagne, retour à THEME_SELECT ]
  → END
```

- Le tirage **initial** du joueur désigné pour le thème, au début de
  chaque manche, est **aléatoire et uniforme parmi les joueurs
  vivants** (répétitions possibles d'une manche à l'autre).
- **Timer et absence de soumission** : si le joueur désigné ne
  soumet pas de thème dans le délai (réglage hôte partagé avec le
  timer d'indices — voir plus bas), **aucune élimination** : la main
  passe au **joueur suivant dans l'ordre de tour** vivant
  (`nextAliveIndex`, déjà utilisé pour l'avancement des indices), et
  son timer redémarre à zéro. Ce report peut se répéter en cascade si
  plusieurs joueurs de suite laissent expirer leur tour.
- Conséquence importante : `THEME_SELECT` n'interagit **jamais** avec
  la logique d'élimination ou `nextOddRound()`. Seul un timeout
  pendant `CLUE_ROUND` (ou un vote) peut éliminer quelqu'un, exactement
  comme en mode classique. `room.round` n'avance que quand une manche
  va à son terme (tour d'indices complet) ou après un vote — inchangé
  par rapport au mode classique.
- Après une `ELIMINATION` sans vainqueur : le mode classique repart
  directement en `CLUE_ROUND` ; le mode Note repart en `THEME_SELECT`
  (nouveau tirage aléatoire du joueur désigné pour la manche
  suivante).

## Timer

Les réglages `clueTimerEnabled` / `clueTimerSeconds` (déjà en place
pour le mode classique) sont **partagés entre les deux modes** et
s'appliquent identiquement :
- en mode classique, au tour d'indices de chaque joueur (comportement
  actuel, inchangé) ;
- en mode Note, à la fois à `THEME_SELECT` (temps laissé au joueur
  désigné pour écrire le thème) et à `CLUE_ROUND` (comportement
  actuel, inchangé).

`RoomState.turnDeadline` (déjà existant) est réutilisé tel quel pour
les deux phases — un seul délai actif à la fois, cohérent avec le
fonctionnement actuel d'une alarme Durable Object par salle.

## Modèle de données

**`RoomSettings`** — nouveaux champs :
```ts
mode: 'classic' | 'note'; // défaut 'classic'
civilNote?: number;       // ignoré en entrée, généré au hasard par le serveur au START_GAME
undercoverNote?: number;  // ignoré en entrée, généré au hasard par le serveur au START_GAME
```
Les champs `themes` / `similarityLevel` / `animeSeries` restent
présents dans le type mais sont ignorés par le serveur quand
`mode === 'note'`.

**`RoomState`** — nouveaux champs :
```ts
themeSetterId: string | null; // joueur désigné pour la manche en cours (THEME_SELECT)
currentTheme: string | null;  // thème en cours pour la manche affichée
themes: { round: number; playerId: string; text: string }[]; // historique, un par manche
```

**`Player`** — nouveau champ :
```ts
note: number | null; // rempli uniquement en mode Note, symétrique à `character`
```
Règles de révélation identiques à `character` dans `buildSnapshot` :
chaque joueur voit sa propre note en permanence ; les autres ne la
voient que si le joueur est éliminé ou en phase `END`.

## Protocole WebSocket

**Nouveau message client → serveur** :
- `SUBMIT_THEME { text: string }` — rejeté (`WRONG_PHASE`) si la phase
  n'est pas `THEME_SELECT`, ou (`NOT_YOUR_TURN`) si l'auteur n'est pas
  `room.themeSetterId`.

Aucun autre nouveau message : `START_GAME`, `SUBMIT_CLUE`,
`SUBMIT_VOTE`, `MR_WHITE_GUESS`, `RESTART_GAME` sont réutilisés tels
quels. `MR_WHITE_GUESS { guess }` reste une chaîne de caractères dans
les deux modes ; c'est le serveur qui interprète différemment selon
`room.settings.mode` (comparaison de texte en classique, comparaison
numérique exacte en Note via une nouvelle fonction pure
`checkMrWhiteNoteGuess`, séparée de l'actuelle `checkMrWhiteGuess`
pour ne rien changer au mode classique).

`ROOM_STATE` (broadcast existant) inclut désormais `themeSetterId`,
`currentTheme`, `themes`, et le champ `note` par joueur (masqué selon
les mêmes règles que `character`).

## Écrans front-end

- **`LobbyScreen`** : sélecteur de mode (Classique / Note) en haut des
  réglages hôte. Panneau conditionnel selon le mode : thèmes /
  similarité / filtre animes (Classique) ou un simple texte informatif
  précisant que les notes sont attribuées au hasard entre 0 et 20
  (Note) — aucun contrôle hôte sur les valeurs. Mr. White et Timer
  restent communs aux deux modes, affichés sous le panneau spécifique
  au mode.
- **`RoleRevealScreen`** / **`RoleBanner`** : variante Note affichant
  « Ta note : N/20 » à la place du nom de personnage, avec le même
  code couleur par rôle (rouge si Undercover). Mr. White ne voit
  aucune note (comme aujourd'hui sans personnage).
- **Nouveau `ThemeSelectScreen`** (phase `THEME_SELECT`) : réutilise
  `RoundRecapTable` pour l'historique déjà écoulé ; si c'est le tour
  du joueur courant, un champ texte + bouton d'envoi pour soumettre le
  thème ; sinon « En attente du thème de {joueur}... ». Countdown
  visible, réutilisant le même traitement visuel que celui de
  `ClueRoundScreen`.
- **`RoundRecapTable`** : chaque colonne « Manche N » affiche en
  sous-titre le thème de cette manche quand `themes` en contient un
  pour ce round ; sans effet en mode classique (pas d'entrée dans
  `themes`).
- **`EliminationScreen`** : le champ de guess Mr. White devient un
  champ numérique (0-20) en mode Note, au lieu du champ texte libre du
  mode classique.
- **`EndScreen`** : révèle `civilNote` / `undercoverNote` au lieu des
  personnages, en mode Note.

## Erreurs & robustesse

- `civilNote` / `undercoverNote` toujours générés distincts par
  construction (`generateDistinctNotes` retire tant que les deux
  valeurs sont égales) — pas de validation d'entrée côté hôte
  nécessaire, contrairement à une première itération de ce document.
- `SUBMIT_THEME` hors phase ou hors-tour : erreurs typées existantes
  (`WRONG_PHASE`, `NOT_YOUR_TURN`), renvoyées uniquement au client
  fautif. `SUBMIT_THEME` avec un texte vide ou uniquement des espaces :
  erreur typée `EMPTY_THEME`, la salle reste en `THEME_SELECT` en
  attente du même joueur (un thème vide bloquerait toute la manche
  pour tout le monde, contrairement à un indice vide qui ne coûte qu'à
  son auteur).
- `SUBMIT_CLUE` / `SUBMIT_THEME` : le texte est tronqué à 200
  caractères côté serveur avant stockage, pour éviter une croissance
  non bornée de l'état persisté de la salle.
- Reconnexion : `themeSetterId`, `currentTheme`, `themes` font partie
  du `RoomState` persisté et du snapshot ; une reconnexion en pleine
  phase `THEME_SELECT` retrouve l'état exact sans perturbation, comme
  le reste aujourd'hui.
- `scheduleClueTimeout` supprime explicitement toute alarme Durable
  Object en attente (`deleteAlarm`) quand `clueTimerEnabled` est faux,
  pour éviter qu'une alarme héritée d'une phase précédente (ex. la
  fenêtre de 60s laissée à Mr. White pour deviner) ne survive et se
  déclenche plus tard sur une phase qui n'en a plus besoin.

## Tests

- **Unitaires (pure logic)** : `checkMrWhiteNoteGuess` (nouvelle
  fonction, à côté de `checkMrWhiteGuess` existante, sans le
  modifier) ; clamp des notes hôte (même fonction `resolveClueTimerSeconds`-like,
  probablement dans `game/clueRound.ts` ou un nouveau petit module
  `game/notes.ts` si la cohabitation avec les helpers de tour devient
  trop chargée).
- **Flux serveur** (`GameRoom.flow.test.ts`) : partie complète en mode
  Note (indices texte libre, vote, élimination) ; thème non soumis à
  temps → passage au joueur suivant sans élimination (cascade sur
  plusieurs joueurs) ; victoire et défaite de Mr. White sur guess
  numérique ; notes toujours distinctes et dans [0, 20] quelle que
  soit la partie ; thème vide rejeté ; texte tronqué à 200 caractères ;
  aucune alarme périmée ne survit quand le timer est désactivé.
- **Front** : bascule de mode dans `LobbyScreen` (panneaux
  conditionnels) ; `ThemeSelectScreen` (mon tour / tour d'un autre /
  countdown) ; champ numérique dans `EliminationScreen` ; révélation
  des notes dans `EndScreen` ; sous-titre thème dans
  `RoundRecapTable`.

## Hors périmètre (v1)

- Pas de dataset de personnages/notes à construire : le thème et le
  « personnage qui correspond » restent en texte libre, jugés par les
  joueurs eux-mêmes ; aucune validation serveur du contenu des
  indices ou des thèmes.
- Pas de garde-fou contre un cycle infini de report de thème si tous
  les joueurs vivants laissent systématiquement expirer leur tour
  (cas pathologique jugé hors périmètre pour le MVP).
