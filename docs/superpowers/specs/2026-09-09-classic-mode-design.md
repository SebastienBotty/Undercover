# Undercover — Mode Classique (v1) — Design

Sous-projet 1/2 du jeu Undercover. Le mode "Note" (variante décrite par
l'utilisateur : les joueurs reçoivent une note et doivent citer un
personnage qui la justifie selon un thème donné) fera l'objet d'un
second cycle spec → plan → implémentation une fois ce mode classique
livré et fonctionnel.

## Contexte

Jeu de déduction sociale multijoueur en ligne, inspiré d'Undercover /
Who is Undercover. Chaque joueur reçoit en privé un personnage (au
lieu d'un simple mot) ; la majorité (Civils) reçoit le même
personnage, une minorité (Undercover) reçoit un personnage différent
mais apparenté, et un rôle optionnel (Mr. White) ne reçoit rien du
tout. Les joueurs décrivent leur personnage à tour de rôle sans le
nommer, puis votent pour éliminer qui ils soupçonnent.

## Stack

- **Frontend** : Next.js (React), hébergé sur Vercel (gratuit).
- **Backend temps réel** : Cloudflare Workers + Durable Objects
  (WebSocket natif, une salle = un Durable Object). Choisi plutôt que
  Node.js/Express/Socket.IO sur Render pour éviter le cold-start
  (~30s) du free tier de Render — démarrage quasi instantané et
  vraiment gratuit dans les limites d'usage personnel.
- Pas de compte utilisateur : identification via un `clientId` généré
  et stocké en `localStorage`.

## Rôles

- **Civils** : reçoivent le personnage A.
- **Undercover** (1 ou plusieurs selon le nombre de joueurs) :
  reçoivent le personnage B, apparenté à A selon le niveau de
  similarité choisi par l'hôte.
- **Mr. White** (optionnel, activable par l'hôte) : ne reçoit aucun
  personnage. S'il est éliminé, il a une tentative pour deviner le
  personnage des Civils ; s'il devine juste, il gagne seul.

## Conditions de victoire

- **Civils** gagnent si tous les Undercover et Mr. White sont
  éliminés.
- **Undercover** gagne si le nombre d'Undercover encore en jeu ≥
  nombre de Civils encore en jeu.
- **Mr. White** gagne seul s'il est éliminé et devine correctement le
  personnage des Civils juste après son élimination.

## Machine à états (par manche)

```
LOBBY
  → RÉVÉLATION_RÔLE (privé, une fois par partie)
  → [ TOUR_INDICES (chaque joueur vivant écrit un indice, dans un
        ordre tiré au hasard une fois en début de partie et répété
        à l'identique à chaque manche — les joueurs éliminés sont
        sautés ; 60s max par joueur, sinon passage automatique avec
        indice vide)
      → VOTE (simultané, caché — révélé uniquement une fois que tous
        les joueurs vivants ont voté)
      → RÉVÉLATION_ÉLIMINATION (+ tentative Mr. White si concerné)
      → vérification des conditions de victoire
      → si personne ne gagne, retour à TOUR_INDICES ]
  → FIN_DE_PARTIE (vainqueur affiché, option "rejouer")
```

Le serveur (Durable Object) est l'unique source de vérité sur l'état
de la partie et sur la phase en cours.

## Sélection des personnages (Civil / Undercover)

Chaque personnage du jeu de données a la forme :

```json
{ "id": "...", "name": "...", "theme": "...", "tags": ["t1", "t2", "t3", "t4", "t5"] }
```

À la configuration de la partie (dans le lobby), l'hôte choisit :
- un ou plusieurs **thèmes** actifs (ex. anime, films, histoire...) ;
- un **niveau de similarité** parmi trois : `Aucun lien` (0 tag
  commun), `Proche` (1-2 tags communs), `Très proche` (3+ tags
  communs).

Au lancement d'une manche, le serveur :
1. filtre les personnages appartenant aux thèmes actifs ;
2. calcule le nombre de tags communs pour toutes les paires possibles
   dans ce pool ;
3. garde les paires dont le nombre de tags communs correspond au
   niveau demandé ;
4. si aucune paire ne correspond, assouplit automatiquement d'un cran
   (ex. `Très proche` → `Proche` → `Aucun lien`) et **prévient l'hôte**
   que le niveau a été assoupli faute de paires disponibles ;
5. tire une paire au hasard parmi celles qui correspondent au niveau
   retenu, puis assigne aléatoirement laquelle des deux va aux Civils
   et laquelle va aux Undercover.

Le jeu de données initial (thèmes + personnages + tags) est rédigé par
Claude dans le cadre de l'implémentation : quelques thèmes (ex. anime,
films connus, histoire) avec environ 15-20 personnages tagués chacun,
au format JSON, facilement extensible ensuite par l'utilisateur.

## Salle & joueurs

- Rejoindre une partie : code de salle à 4-6 caractères + pseudo, pas
  de compte.
- 3 à 10 joueurs par salle (minimum nécessaire pour garantir au moins
  un Civil de plus que le nombre d'Undercover + Mr. White ; maximum
  fixé par choix produit).
- Le rôle d'hôte ne migre pas si l'hôte se déconnecte : la partie
  continue normalement (le serveur est déjà la seule source de
  vérité, l'hôte ne fait que configurer la partie dans le lobby).

## Modèle d'état (Durable Object)

```
Room {
  code, hostId,
  phase: LOBBY | ROLE_REVEAL | CLUE_ROUND | VOTE | ELIMINATION | END,
  settings: { themes: string[], similarityLevel, mrWhiteEnabled },
  players: [{ id, clientId, name, role, character, alive, connected }],
  turnOrder: playerId[], currentTurnIndex,
  clues: [{ playerId, round, text }],
  votes: { [playerId]: targetPlayerId },
  round: number
}
```

## Protocole WebSocket

Messages client → serveur :
- `CREATE_ROOM`
- `JOIN_ROOM { code, name, clientId }`
- `START_GAME { settings }` (hôte uniquement)
- `SUBMIT_CLUE { text }` (rejeté si ce n'est pas le tour de l'auteur)
- `SUBMIT_VOTE { targetId }`
- `MR_WHITE_GUESS { text }` (uniquement juste après élimination de Mr.
  White)

Messages serveur → client :
- `ROOM_STATE` : snapshot broadcast à tous les clients de la salle à
  chaque changement d'état. Ne contient jamais le rôle/personnage des
  autres joueurs — chaque client ne reçoit son propre rôle/personnage
  que dans un message séparé qui lui est destiné en propre.
- Messages d'erreur typés, renvoyés uniquement au client fautif
  (hors-tour, salle pleine, code inconnu, pseudo dupliqué...), sans
  affecter les autres joueurs.

## Reconnexion

À la connexion WebSocket, le client envoie `{ roomCode, clientId }`.
Le Durable Object retrouve le joueur existant via `clientId`, le
repasse `connected: true`, et lui renvoie l'état complet de la salle
ainsi que sa carte privée (rôle/personnage). Si le joueur était en
plein tour d'indice, son timer de 60s continue de courir côté serveur
sans être remis à zéro par la reconnexion.

## Erreurs & robustesse

- Toute action hors-phase ou hors-tour est rejetée avec un message
  d'erreur typé, renvoyé uniquement au client concerné.
- Pas de nettoyage actif des salles abandonnées pour le MVP : géré
  naturellement par l'éviction des Durable Objects inactifs.

## Tests

- Tests unitaires côté serveur sur la logique pure : machine à états
  des manches, calcul des conditions de victoire, algorithme de
  sélection de paires par tags/similarité (y compris le cas
  d'assouplissement automatique).
- Pas de tests end-to-end automatisés pour le MVP ; validation
  manuelle multi-onglets en développement.

## Hors périmètre (v1)

- Mode "Note" (sous-projet 2, spec séparée).
- Comptes utilisateurs / persistance des parties entre sessions.
- Timer configurable, thèmes personnalisés par l'utilisateur au-delà
  du jeu de données initial, migration de l'hôte, tests end-to-end
  automatisés.
