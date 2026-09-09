import type { Character } from './types';

export const CHARACTERS: Character[] = [
  // Histoire
  { id: 'alexandre-le-grand', name: 'Alexandre le Grand', theme: 'histoire', tags: ['conquerant', 'antiquite', 'militaire', 'empire', 'stratege'] },
  { id: 'genghis-khan', name: 'Genghis Khan', theme: 'histoire', tags: ['conquerant', 'moyen-age', 'militaire', 'empire', 'stratege'] },
  { id: 'napoleon', name: 'Napoléon Bonaparte', theme: 'histoire', tags: ['conquerant', 'epoque-moderne', 'militaire', 'empire', 'stratege'] },
  { id: 'jules-cesar', name: 'Jules César', theme: 'histoire', tags: ['conquerant', 'antiquite', 'militaire', 'empire', 'politique'] },
  { id: 'cleopatre', name: 'Cléopâtre', theme: 'histoire', tags: ['antiquite', 'politique', 'egypte', 'diplomate', 'controverse'] },
  { id: 'leonard-de-vinci', name: 'Léonard de Vinci', theme: 'histoire', tags: ['renaissance', 'art', 'science', 'inventeur', 'visionnaire'] },
  { id: 'einstein', name: 'Albert Einstein', theme: 'histoire', tags: ['science', 'xxe-siecle', 'physique', 'visionnaire', 'pacifiste'] },
  { id: 'marie-curie', name: 'Marie Curie', theme: 'histoire', tags: ['science', 'xxe-siecle', 'physique', 'chimie', 'pionniere'] },
  { id: 'gandhi', name: 'Gandhi', theme: 'histoire', tags: ['xxe-siecle', 'politique', 'pacifiste', 'activiste', 'philosophe'] },
  { id: 'mlk', name: 'Martin Luther King', theme: 'histoire', tags: ['xxe-siecle', 'politique', 'pacifiste', 'activiste', 'orateur'] },
  { id: 'colomb', name: 'Christophe Colomb', theme: 'histoire', tags: ['explorateur', 'renaissance', 'navigateur', 'controverse', 'decouverte'] },
  { id: 'marco-polo', name: 'Marco Polo', theme: 'histoire', tags: ['explorateur', 'moyen-age', 'navigateur', 'commercant', 'decouverte'] },

  // Anime -- 20 series, 2-3 characters each
  // One Piece
  { id: 'zoro', name: 'Roronoa Zoro', theme: 'anime', series: 'one-piece', tags: ['epeiste', 'pirate', 'shonen', 'determine', 'force-brute'] },
  { id: 'luffy', name: 'Monkey D. Luffy', theme: 'anime', series: 'one-piece', tags: ['pirate', 'shonen', 'hot-blooded', 'determine', 'protagoniste'] },
  // Naruto
  { id: 'sasuke', name: 'Sasuke Uchiha', theme: 'anime', series: 'naruto', tags: ['ninja', 'shonen', 'vengeance', 'determine', 'rival'] },
  { id: 'naruto', name: 'Naruto Uzumaki', theme: 'anime', series: 'naruto', tags: ['ninja', 'shonen', 'determine', 'hot-blooded', 'protagoniste'] },
  { id: 'itachi', name: 'Itachi Uchiha', theme: 'anime', series: 'naruto', tags: ['ninja', 'shonen', 'stratege', 'sacrifice', 'calme'] },
  // Dragon Ball
  { id: 'goku', name: 'Goku', theme: 'anime', series: 'dragon-ball', tags: ['combattant-corps-a-corps', 'shonen', 'hot-blooded', 'force-brute', 'protagoniste'] },
  { id: 'vegeta', name: 'Vegeta', theme: 'anime', series: 'dragon-ball', tags: ['combattant-corps-a-corps', 'shonen', 'rival', 'force-brute', 'orgueilleux'] },
  // Death Note
  { id: 'light', name: 'Light Yagami', theme: 'anime', series: 'death-note', tags: ['stratege', 'seinen', 'antagoniste', 'manipulateur', 'genie'] },
  { id: 'l', name: 'L', theme: 'anime', series: 'death-note', tags: ['stratege', 'seinen', 'genie', 'detective', 'calme'] },
  // L'Attaque des Titans
  { id: 'levi', name: 'Levi Ackerman', theme: 'anime', series: 'attack-on-titan', tags: ['epeiste', 'seinen', 'force-brute', 'calme', 'capitaine'] },
  { id: 'erwin', name: 'Erwin Smith', theme: 'anime', series: 'attack-on-titan', tags: ['seinen', 'stratege', 'capitaine', 'sacrifice', 'visionnaire'] },
  { id: 'eren-yeager', name: 'Eren Yeager', theme: 'anime', series: 'attack-on-titan', tags: ['seinen', 'hot-blooded', 'transformation', 'vengeance', 'protagoniste'] },
  // Fullmetal Alchemist
  { id: 'edward-elric', name: 'Edward Elric', theme: 'anime', series: 'fullmetal-alchemist', tags: ['alchimiste', 'shonen', 'determine', 'hot-blooded', 'protagoniste'] },
  { id: 'alphonse-elric', name: 'Alphonse Elric', theme: 'anime', series: 'fullmetal-alchemist', tags: ['alchimiste', 'shonen', 'loyal', 'sacrifice', 'protagoniste'] },
  // My Hero Academia
  { id: 'deku', name: 'Izuku Midoriya', theme: 'anime', series: 'my-hero-academia', tags: ['super-pouvoir', 'shonen', 'determine', 'protagoniste', 'courageux'] },
  { id: 'bakugo', name: 'Katsuki Bakugo', theme: 'anime', series: 'my-hero-academia', tags: ['super-pouvoir', 'shonen', 'hot-blooded', 'rival', 'orgueilleux'] },
  { id: 'all-might', name: 'All Might', theme: 'anime', series: 'my-hero-academia', tags: ['super-pouvoir', 'shonen', 'mentor', 'force-brute', 'sacrifice'] },
  // Demon Slayer
  { id: 'tanjiro', name: 'Tanjiro Kamado', theme: 'anime', series: 'demon-slayer', tags: ['epeiste', 'shonen', 'determine', 'protagoniste', 'loyal'] },
  { id: 'nezuko', name: 'Nezuko Kamado', theme: 'anime', series: 'demon-slayer', tags: ['transformation', 'shonen', 'loyal', 'sacrifice', 'protecteur'] },
  { id: 'zenitsu', name: 'Zenitsu Agatsuma', theme: 'anime', series: 'demon-slayer', tags: ['epeiste', 'shonen', 'peureux', 'comique', 'loyal'] },
  // Jujutsu Kaisen
  { id: 'yuji-itadori', name: 'Yuji Itadori', theme: 'anime', series: 'jujutsu-kaisen', tags: ['exorciste', 'shonen', 'determine', 'protagoniste', 'sacrifice'] },
  { id: 'gojo', name: 'Satoru Gojo', theme: 'anime', series: 'jujutsu-kaisen', tags: ['exorciste', 'shonen', 'genie', 'mentor', 'sarcastique'] },
  { id: 'megumi', name: 'Megumi Fushiguro', theme: 'anime', series: 'jujutsu-kaisen', tags: ['exorciste', 'shonen', 'calme', 'stratege', 'loyal'] },
  // Bleach
  { id: 'ichigo', name: 'Ichigo Kurosaki', theme: 'anime', series: 'bleach', tags: ['epeiste', 'shonen', 'hot-blooded', 'protagoniste', 'determine'] },
  { id: 'rukia', name: 'Rukia Kuchiki', theme: 'anime', series: 'bleach', tags: ['epeiste', 'shonen', 'calme', 'mentor', 'loyal'] },
  // Hunter x Hunter
  { id: 'gon', name: 'Gon Freecss', theme: 'anime', series: 'hunter-x-hunter', tags: ['chasseur', 'shonen', 'naif', 'protagoniste', 'determine'] },
  { id: 'killua', name: 'Killua Zoldyck', theme: 'anime', series: 'hunter-x-hunter', tags: ['chasseur', 'shonen', 'assassin', 'loyal', 'genie'] },
  // One Punch Man
  { id: 'saitama', name: 'Saitama', theme: 'anime', series: 'one-punch-man', tags: ['combattant-corps-a-corps', 'seinen', 'blase', 'force-brute', 'comique'] },
  { id: 'genos', name: 'Genos', theme: 'anime', series: 'one-punch-man', tags: ['cyborg', 'seinen', 'loyal', 'determine', 'disciple'] },
  // Sword Art Online
  { id: 'kirito', name: 'Kirito', theme: 'anime', series: 'sword-art-online', tags: ['epeiste', 'isekai', 'genie', 'protagoniste', 'calme'] },
  { id: 'asuna', name: 'Asuna', theme: 'anime', series: 'sword-art-online', tags: ['epeiste', 'isekai', 'determine', 'stratege', 'loyal'] },
  // Tokyo Ghoul
  { id: 'kaneki', name: 'Ken Kaneki', theme: 'anime', series: 'tokyo-ghoul', tags: ['transformation', 'seinen', 'sombre', 'protagoniste', 'sacrifice'] },
  { id: 'touka', name: 'Touka Kirishima', theme: 'anime', series: 'tokyo-ghoul', tags: ['transformation', 'seinen', 'determine', 'loyal', 'combattant-corps-a-corps'] },
  // Cowboy Bebop
  { id: 'spike-spiegel', name: 'Spike Spiegel', theme: 'anime', series: 'cowboy-bebop', tags: ['chasseur-de-primes', 'seinen', 'sarcastique', 'passe-sombre', 'calme'] },
  { id: 'faye-valentine', name: 'Faye Valentine', theme: 'anime', series: 'cowboy-bebop', tags: ['chasseur-de-primes', 'seinen', 'sarcastique', 'independante', 'mysterieux'] },
  // Neon Genesis Evangelion
  { id: 'shinji', name: 'Shinji Ikari', theme: 'anime', series: 'evangelion', tags: ['pilote-robot', 'mecha', 'timide', 'protagoniste', 'traumatise'] },
  { id: 'rei-ayanami', name: 'Rei Ayanami', theme: 'anime', series: 'evangelion', tags: ['pilote-robot', 'mecha', 'calme', 'mysterieux', 'loyal'] },
  // Pokémon
  { id: 'ash-ketchum', name: 'Ash Ketchum', theme: 'anime', series: 'pokemon', tags: ['dresseur', 'enfance', 'determine', 'protagoniste', 'hot-blooded'] },
  { id: 'pikachu', name: 'Pikachu', theme: 'anime', series: 'pokemon', tags: ['enfance', 'loyal', 'mascotte', 'super-pouvoir', 'attachant'] },
  // Spy x Family
  { id: 'loid-forger', name: 'Loid Forger', theme: 'anime', series: 'spy-x-family', tags: ['agent-secret', 'seinen', 'stratege', 'calme', 'famille'] },
  { id: 'anya-forger', name: 'Anya Forger', theme: 'anime', series: 'spy-x-family', tags: ['enfance', 'seinen', 'comique', 'super-pouvoir', 'famille'] },
  // Chainsaw Man
  { id: 'denji', name: 'Denji', theme: 'anime', series: 'chainsaw-man', tags: ['transformation', 'seinen', 'naif', 'protagoniste', 'impulsif'] },
  { id: 'power', name: 'Power', theme: 'anime', series: 'chainsaw-man', tags: ['transformation', 'seinen', 'comique', 'orgueilleux', 'loyal'] },
  // Code Geass
  { id: 'lelouch', name: 'Lelouch Lamperouge', theme: 'anime', series: 'code-geass', tags: ['stratege', 'mecha', 'genie', 'antagoniste', 'masque'] },
  { id: 'suzaku', name: 'Suzaku Kururugi', theme: 'anime', series: 'code-geass', tags: ['pilote-robot', 'mecha', 'loyal', 'rival', 'idealiste'] },

  // Films
  { id: 'luke-skywalker', name: 'Luke Skywalker', theme: 'films', tags: ['chevalier', 'science-fiction', 'heros', 'mentor-guide', 'epeiste'] },
  { id: 'dark-vador', name: 'Dark Vador', theme: 'films', tags: ['science-fiction', 'antagoniste', 'guerrier', 'masque', 'redemption'] },
  { id: 'iron-man', name: 'Tony Stark', theme: 'films', tags: ['super-heros', 'science-fiction', 'genie', 'riche', 'sarcastique'] },
  { id: 'batman', name: 'Bruce Wayne', theme: 'films', tags: ['super-heros', 'riche', 'vigilante', 'sombre', 'genie'] },
  { id: 'indiana-jones', name: 'Indiana Jones', theme: 'films', tags: ['aventurier', 'archeologue', 'action', 'charismatique', 'annees-30'] },
  { id: 'james-bond', name: 'James Bond', theme: 'films', tags: ['espion', 'action', 'charismatique', 'epoque-moderne', 'seducteur'] },
  { id: 'forrest-gump', name: 'Forrest Gump', theme: 'films', tags: ['drame', 'naif', 'heros-ordinaire', 'americana', 'attachant'] },
  { id: 'rocky', name: 'Rocky Balboa', theme: 'films', tags: ['drame', 'boxeur', 'heros-ordinaire', 'determine', 'americana'] },
  { id: 'gandalf', name: 'Gandalf', theme: 'films', tags: ['mage', 'fantasy', 'mentor', 'sage', 'epique'] },
  { id: 'dumbledore', name: 'Dumbledore', theme: 'films', tags: ['mage', 'fantasy', 'mentor', 'sage', 'mysterieux'] },
  { id: 'jack-sparrow', name: 'Jack Sparrow', theme: 'films', tags: ['pirate', 'aventurier', 'action', 'excentrique', 'charismatique'] },
  { id: 'katniss', name: 'Katniss Everdeen', theme: 'films', tags: ['heros-ordinaire', 'action', 'determine', 'dystopie', 'archere'] },
];
