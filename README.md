# Undercover

Un jeu de bluff et de déduction multijoueur, à jouer entre amis dans le navigateur. Donnez des indices, repérez les incohérences et votez pour démasquer les imposteurs avant qu’ils ne prennent le dessus.

Une partie accueille **3 à 10 joueurs**, sans création de compte : un pseudo et un code de salon suffisent.

## Le principe

Chaque joueur reçoit une information secrète et tente de comprendre qui partage la sienne.

| Rôle | Information reçue | Objectif |
| --- | --- | --- |
| Civil | Le même personnage ou la même note que les autres Civils | Éliminer tous les imposteurs |
| Undercover | Un personnage ou une note différente | Se fondre dans le groupe et atteindre la parité avec les Civils |
| Mr. White | Aucune information | Bluffer ; s’il est éliminé, deviner le personnage ou la note des Civils pour gagner seul |

Il y a un Undercover, puis deux à partir de 7 joueurs. Mr. White est optionnel et disponible à partir de 5 joueurs. Les imposteurs encore en vie gagnent lorsqu’ils sont au moins aussi nombreux que les Civils.

### Deux modes de jeu

- **Classique** : les indices portent sur un personnage secret, issu des thèmes **Anime**, **Films** ou **Histoire**. L’hôte choisit les catégories et le degré de similarité entre les personnages des deux camps.
- **Note** : chaque camp reçoit une note entre **0 et 20**, avec un écart configurable. Avant chaque manche, un joueur propose un thème libre ; chacun donne ensuite un exemple ou un indice qui correspond à sa note, sans la révéler.

### Déroulement d’une partie

1. Créez un salon et partagez son code à 5 caractères avec vos amis.
2. L’hôte choisit le mode et les réglages, puis lance la partie.
3. Chacun découvre son information secrète et donne des indices à tour de rôle.
4. Après le nombre de passes prévu, les joueurs votent contre un suspect ou s’abstiennent. Une égalité déclenche un vote de départage.
5. Les manches se poursuivent jusqu’à la victoire d’un camp. Mr. White dispose d’une dernière tentative lorsqu’il est éliminé.

Les règles détaillées sont accessibles depuis le bouton **Règles** dans l’interface.

## Fonctionnalités

- Salons privés par code et synchronisation en temps réel par WebSocket.
- Réglages de l’hôte : thèmes, sous-catégories, similarité, écart de notes et activation de Mr. White.
- Minuteurs d’indices et de vote configurables, avec 1 à 5 passes d’indices avant chaque vote.
- Vote avec abstention, départage et pénalité au prochain vote lorsqu’un tour d’indice expire.
- Révélation des rôles éliminés configurable et récapitulatif des indices.
- Reconnexion automatique, délai de grâce en cas de déconnexion pendant son tour et gestion des joueurs par l’hôte.
- Mémorisation locale du pseudo et des réglages de l’hôte.

## Stack technique

| Partie | Technologies |
| --- | --- |
| Interface | Next.js 16, React 19, TypeScript, CSS Modules |
| Serveur | Cloudflare Workers, Durable Objects, WebSocket, TypeScript |
| Tests | Vitest, Testing Library, environnement de test Cloudflare Workers |
| Développement | npm, Wrangler, Concurrently |

Le serveur gère les règles et l’état des parties. Chaque code de salon correspond à un Durable Object ; les clients reçoivent les mises à jour et les informations adaptées à leur joueur.

## Lancer le projet en local

### Prérequis

- Node.js **24 LTS** et npm.
- Un navigateur récent.

Les commandes suivantes s’exécutent depuis la racine du dépôt, sauf indication contraire. Les trois dossiers ont leurs propres dépendances ; l’installation à la racine ne remplace pas celles de `web/` et de `server/`.

### 1. Installer les dépendances

```sh
npm ci
npm ci --prefix web
npm ci --prefix server
```

### 2. Configurer l’adresse du serveur

Créez le fichier `web/.env.local` avec le contenu suivant, ou adaptez la variable si le fichier existe déjà :

```dotenv
NEXT_PUBLIC_SERVER_URL=http://localhost:8787
```

Cette URL HTTP sert aux appels API et à la connexion WebSocket, dont le protocole est déduit automatiquement. Le fichier `.env.local` est ignoré par Git.

### 3. Démarrer l’application

```sh
npm run dev
```

- Interface : [http://localhost:3000](http://localhost:3000).
- Serveur local Wrangler : [http://localhost:8787](http://localhost:8787).
- Vérification du serveur : [http://localhost:8787/health](http://localhost:8787/health), qui renvoie `OK`.

Vous pouvez aussi lancer les deux services séparément avec `npm run dev:web` et `npm run dev:server`, dans deux terminaux.

Pour simuler plusieurs joueurs sur une seule machine, utilisez des profils de navigateur distincts : l’identifiant du joueur est conservé dans le stockage local du navigateur.

## Vérifications

Depuis la racine :

```sh
npm run lint --prefix web
npm test --prefix web
npm run build --prefix web
```

Pour les tests du serveur, lancez Vitest depuis son dossier afin de charger la configuration Cloudflare :

```sh
cd server
npx vitest run
cd ..
```

Le script `npm test` du serveur est encore un placeholder ; utilisez la commande Vitest ci-dessus.

## Organisation du dépôt

```text
web/
  src/app/          Pages, styles globaux et métadonnées Next.js
  src/components/   Écrans et composants du jeu
  src/lib/          Connexion WebSocket et préférences locales
  test/             Tests de l’interface
server/
  src/worker.ts     Routes HTTP et accès aux salons WebSocket
  src/GameRoom.ts   Gestion des salons et du déroulement des parties
  src/game/        Rôles, tours, votes, notes et vues des joueurs
  src/characters/  Catalogue de personnages et sélection des paires
  test/            Tests du serveur et des règles
  wrangler.toml    Configuration Cloudflare et Durable Objects
docs/              Spécifications et plans de développement
```

## Déploiement

Le frontend se construit avec `npm run build --prefix web` et peut être hébergé sur une plateforme compatible Next.js. Le serveur est prévu pour Cloudflare Workers avec le binding Durable Object `GAME_ROOM` et la migration définis dans [`server/wrangler.toml`](server/wrangler.toml).

Pour un environnement distant, définissez `NEXT_PUBLIC_SERVER_URL` sur l’URL HTTPS publique du Worker **avant de construire le frontend**, puis reconstruisez-le si cette adresse change. La connexion WebSocket utilisera alors `wss://`.
