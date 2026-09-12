'use client';
import { useEffect, useState } from 'react';
import styles from './RulesButton.module.css';

interface RulesButtonProps {
  /** Shifts the button down so it doesn't overlap a room code badge already sitting top-right. */
  stacked?: boolean;
}

/** Self-contained "Règles" button + modal, dropped as-is into any screen -- explains the whole
 * game from scratch, since settings only expose controls, not how to play. */
export function RulesButton({ stacked = false }: RulesButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={`${styles.button}${stacked ? ` ${styles.buttonStacked}` : ''}`}
        onClick={() => setIsOpen(true)}
      >
        Règles
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <div
            className={styles.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rules-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Fermer"
            >
              ✕
            </button>

            <span className="eyebrow">Dossier</span>
            <h2 id="rules-title">Règles du jeu</h2>

            <div className={styles.body}>
              <p>
                Undercover est un jeu de bluff et de déduction. Chaque joueur reçoit un rôle secret
                et un mot (un personnage ou une note, selon le mode) associé à ce rôle. Les Civils,
                majoritaires, doivent démasquer les imposteurs en donnant des indices sur leur mot à
                tour de rôle et en votant contre les joueurs suspects, avant que les imposteurs ne
                prennent le dessus.
              </p>

              <h3>Les rôles</h3>
              <ul>
                <li>
                  <span className={styles.roleCivil}>Civil</span> — reçoit un mot. La plupart des
                  joueurs sont des Civils et partagent tous le même mot. Ils gagnent quand tous les
                  Undercover et le Mr. White ont été éliminés.
                </li>
                <li>
                  <span className={styles.roleUndercover}>Undercover</span> (1, ou 2 à partir de 7
                  joueurs) — reçoit un mot différent de celui des Civils, mais volontairement proche
                  pour semer le doute. Il doit se fondre dans la masse en donnant des indices assez
                  vagues pour ne pas se faire repérer. L&apos;Undercover (et le Mr. White à ses
                  côtés) gagnent dès qu&apos;ils sont aussi nombreux, ou plus, que les Civils encore
                  en vie.
                </li>
                <li>
                  <span className={styles.roleMrwhite}>Mr. White</span> (optionnel, activable par
                  l&apos;hôte à partir de 5 joueurs) — ne reçoit aucun mot du tout. Il doit deviner
                  de quoi parlent les autres rien qu&apos;en écoutant leurs indices, et bluffer en
                  donnant des indices crédibles sans rien savoir. S&apos;il est démasqué et éliminé,
                  il a une dernière chance : deviner le mot exact des Civils. S&apos;il trouve, il
                  gagne la partie sur-le-champ, quel que soit l&apos;état du reste de la partie.
                </li>
              </ul>

              <h3>Déroulement d&apos;une manche</h3>
              <ol>
                <li>
                  Chaque joueur vivant donne, à tour de rôle, un indice en rapport avec son mot
                  secret, sans jamais le dire lui-même (le détail de ce qu&apos;est cet indice
                  dépend du mode — voir « Les deux modes de jeu » ci-dessous). Cela se répète sur
                  plusieurs passes (réglées par l&apos;hôte) avant chaque vote.
                </li>
                <li>
                  Une fois les indices donnés, tout le monde vote pour le joueur qu&apos;il soupçonne
                  d&apos;être un imposteur, ou choisit de s&apos;abstenir.
                </li>
                <li>
                  Le joueur ayant reçu le plus de voix est éliminé et son rôle peut être révélé (si
                  l&apos;hôte l&apos;a activé). En cas d&apos;égalité, un vote de départage a lieu
                  entre les joueurs à égalité ; si l&apos;égalité persiste, personne n&apos;est
                  éliminé ce tour-ci.
                </li>
                <li>
                  La partie s&apos;arrête dès qu&apos;un camp remplit sa condition de victoire (voir
                  plus bas) ; sinon, une nouvelle manche recommence.
                </li>
              </ol>
              <p>
                Rater son tour d&apos;indice (temps écoulé) ne fait pas perdre directement : ça
                compte comme une voix « fantôme » contre soi au prochain vote.
              </p>

              <h3>Les deux modes de jeu</h3>
              <ul>
                <li>
                  <strong>Classique</strong> — le mot est un personnage (anime, films, etc., selon
                  les thèmes choisis par l&apos;hôte). Les Civils ont tous le même personnage,
                  l&apos;Undercover en a un autre plus ou moins proche selon le réglage de
                  similarité. Il n&apos;y a pas de thème imposé : les indices portent directement sur
                  le personnage (son univers, ses traits, son histoire...), sans jamais le nommer.
                </li>
                <li>
                  <strong>Note</strong> — le mot est une note entre 0 et 20. Les Civils partagent la
                  même note, l&apos;Undercover a une note différente, avec un écart réglé par
                  l&apos;hôte. Avant chaque manche, un joueur tiré au sort propose un thème libre
                  (ex. « La puissance d&apos;un épéiste de One Piece ») qui sert de repère commun :
                  les indices doivent situer votre note sur ce thème, sans jamais donner le chiffre.
                </li>
              </ul>

              <h3>Le vote</h3>
              <p>
                Le vote se fait à la pluralité : le joueur le plus voté est éliminé, pas besoin de
                majorité absolue. On peut s&apos;abstenir. En cas d&apos;égalité entre plusieurs
                joueurs, un second vote a lieu entre eux uniquement pour départager.
              </p>

              <h3>Fin de partie</h3>
              <ul>
                <li>Les Civils gagnent dès qu&apos;il ne reste plus aucun Undercover ni Mr. White en vie.</li>
                <li>
                  Les Undercover (avec le Mr. White s&apos;il est encore en vie) gagnent dès
                  qu&apos;ils sont au moins aussi nombreux que les Civils encore en vie.
                </li>
                <li>
                  Le Mr. White peut aussi gagner seul, à l&apos;instant où il est éliminé, en
                  devinant correctement le mot exact des Civils.
                </li>
              </ul>

              <h3>Réglages de l&apos;hôte</h3>
              <p>
                L&apos;hôte peut ajuster : les thèmes et catégories de personnages (mode Classique),
                la similarité du mot de l&apos;Undercover, l&apos;écart de notes (mode Note),
                l&apos;activation du Mr. White, la révélation ou non du rôle d&apos;un joueur
                éliminé, ainsi que les temps d&apos;indice, de vote et le nombre de passes
                d&apos;indices avant chaque vote.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
