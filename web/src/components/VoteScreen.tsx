'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RoundRecapTable } from './RoundRecapTable';
import { VOTE_TIMER_DEFAULT_SECONDS } from '@/lib/hostSettings';
import styles from './VoteScreen.module.css';

type Role = 'civil' | 'undercover' | 'mrwhite';

interface Player {
  id: string;
  name: string;
  alive: boolean;
  role?: Role | null;
}

interface Clue {
  playerId: string;
  round: number;
  text: string;
}

interface ThemeEntry { round: number; text: string; }

interface VoteScreenProps {
  players: Player[];
  turnOrder: string[];
  clues: Clue[];
  round: number;
  themes?: ThemeEntry[];
  turnDeadline?: number | null;
  /** Total duration of the vote window in seconds, used to size the progress bar. */
  voteDurationSeconds?: number;
  /** How many alive players have already voted (a plain count, not who they voted for). */
  votedCount?: number;
  /** Unix ms timestamp when the vote auto-resolves early because everyone has voted, or null/undefined
   * while that isn't (yet, or anymore) the case. */
  allVotedDeadline?: number | null;
  /** Non-null only during a tie-breaking runoff: restricts who can be voted for to these ids. */
  voteCandidateIds?: string[] | null;
  /** Phantom votes accumulated by missing a clue timer, keyed by player id. */
  accusationVotes?: Record<string, number>;
  selfId: string;
  onVote: (targetId: string | null) => void;
  /** Cancels the viewer's own vote outright, going back to "hasn't voted" rather than abstaining. */
  onRetractVote: () => void;
}

const URGENT_THRESHOLD_SECONDS = 10;
// Placeholder digit for the all-voted notice while it's reserved-but-hidden, so the message's
// line height (and any wrap) stays identical once it actually appears -- matches the server's
// ALL_VOTED_GRACE_MS (server/src/game/voting.ts), which never counts higher than this.
const ALL_VOTED_GRACE_PLACEHOLDER_SECONDS = 3;

export function VoteScreen({
  players,
  turnOrder,
  clues,
  round,
  themes,
  turnDeadline,
  voteDurationSeconds = VOTE_TIMER_DEFAULT_SECONDS,
  votedCount,
  allVotedDeadline,
  voteCandidateIds,
  accusationVotes,
  selfId,
  onVote,
  onRetractVote,
}: VoteScreenProps) {
  const [votedForId, setVotedForId] = useState<string | null>(null);
  const [hasAbstained, setHasAbstained] = useState(false);
  // Computed synchronously from props (not started at null/1) so the progress bar's DOM node
  // already exists on the very first render -- otherwise the layout effect below runs once
  // against a still-null ref, its deps never change on the next render once the node appears,
  // and it never gets a second chance to wire up the transition, leaving the bar stuck full.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    turnDeadline ? Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000)) : null
  );
  const [progress, setProgress] = useState(() =>
    turnDeadline ? Math.max(0, Math.min(1, (turnDeadline - Date.now()) / (voteDurationSeconds * 1000))) : 1
  );
  const fillRef = useRef<HTMLDivElement | null>(null);
  const self = players.find((p) => p.id === selfId);
  const canVote = self?.alive ?? true;
  // An eliminated viewer gets no clickable targets at all -- the server already rejects their
  // vote with "Tu ne peux plus voter", but they shouldn't be able to attempt the click in the
  // first place. During a tie-breaking runoff, voteCandidateIds further narrows the field to
  // just the previously-tied leaders.
  const votableIds = canVote
    ? new Set(
        players
          .filter((p) => p.alive && p.id !== selfId && (!voteCandidateIds || voteCandidateIds.includes(p.id)))
          .map((p) => p.id)
      )
    : new Set<string>();
  const votedFor = players.find((p) => p.id === votedForId);
  const aliveCount = players.filter((p) => p.alive).length;
  const runoffCandidateNames = voteCandidateIds
    ?.map((id) => players.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const [graceSecondsLeft, setGraceSecondsLeft] = useState<number | null>(() =>
    allVotedDeadline ? Math.max(0, Math.ceil((allVotedDeadline - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!allVotedDeadline) {
      setGraceSecondsLeft(null);
      return;
    }
    const tick = () => setGraceSecondsLeft(Math.max(0, Math.ceil((allVotedDeadline - Date.now()) / 1000)));
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [allVotedDeadline]);

  useEffect(() => {
    if (!turnDeadline) {
      setSecondsLeft(null);
      setProgress(1);
      return;
    }
    const durationMs = voteDurationSeconds * 1000;
    const tick = () => {
      const remainingMs = turnDeadline - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
      setProgress(Math.max(0, Math.min(1, remainingMs / durationMs)));
    };
    tick();
    const intervalId = setInterval(tick, 250);
    return () => clearInterval(intervalId);
  }, [turnDeadline, voteDurationSeconds]);

  // Drives the bar's visible width with a single CSS transition spanning the whole remaining
  // time, instead of re-rendering its width every 250ms (the previous approach, which looked
  // stepped/jerky) -- the browser animates it smoothly on its own from here on.
  useLayoutEffect(() => {
    const el = fillRef.current;
    if (!turnDeadline || !el) return;
    const durationMs = voteDurationSeconds * 1000;
    const remainingMs = Math.max(0, turnDeadline - Date.now());
    const startFraction = Math.min(1, remainingMs / durationMs);
    el.style.transition = 'none';
    el.style.width = `${startFraction * 100}%`;
    void el.offsetWidth; // force a reflow so the jump above isn't itself animated
    el.style.transition = `width ${remainingMs}ms linear`;
    el.style.width = '0%';
  }, [turnDeadline, voteDurationSeconds]);

  function handleVote(targetId: string) {
    // Clicking your own already-selected target again deselects it entirely, rather than
    // re-sending the same vote.
    if (targetId === votedForId) {
      handleRetract();
      return;
    }
    setVotedForId(targetId);
    setHasAbstained(false);
    onVote(targetId);
  }

  function handleAbstain() {
    // Same toggle behavior as a candidate: clicking it again while already abstaining cancels it.
    if (hasAbstained) {
      handleRetract();
      return;
    }
    setVotedForId(null);
    setHasAbstained(true);
    onVote(null);
  }

  function handleRetract() {
    setVotedForId(null);
    setHasAbstained(false);
    onRetractVote();
  }

  return (
    <div>
      <div className={styles.header}>
        <span className="eyebrow">Vote</span>
        {secondsLeft !== null && (
          <div className={styles.timerGroup}>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label="Temps restant pour voter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div
                ref={fillRef}
                className={`${styles.progressFill}${secondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.progressFillUrgent}` : ''}`}
              />
            </div>
            <span className={`${styles.timer}${secondsLeft <= URGENT_THRESHOLD_SECONDS ? ` ${styles.timerUrgent}` : ''}`}>
              ⏱ {secondsLeft}s
            </span>
          </div>
        )}
      </div>
      <h2>Qui soupçonnes-tu ?</h2>
      {runoffCandidateNames && runoffCandidateNames.length > 0 && (
        <p className={styles.runoffNotice}>
          Égalité ! Vote de départage entre {runoffCandidateNames.join(', ')}.
        </p>
      )}
      {votedCount !== undefined && (
        <p className={styles.voteCount}>
          {votedCount} / {aliveCount} ont voté
        </p>
      )}
      <p
        className={`${styles.allVotedNotice}${graceSecondsLeft !== null ? ` ${styles.allVotedNoticeVisible}` : ''}`}
        aria-hidden={graceSecondsLeft === null}
      >
        Tout le monde a voté ! Fin du vote dans {graceSecondsLeft ?? ALL_VOTED_GRACE_PLACEHOLDER_SECONDS}s...
      </p>
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={round}
        votableIds={votableIds}
        selectedId={votedForId}
        onVote={handleVote}
        themes={themes}
        accusationVotes={accusationVotes}
      />
      {canVote && (
        <button
          onClick={handleAbstain}
          className={`btn btnGhost btnBlock ${styles.abstainButton} ${hasAbstained ? styles.abstainSelected : ''}`}
        >
          Ne pas voter{hasAbstained && ' ✓'}
        </button>
      )}
      {votedFor && (
        <p className="muted">
          Tu as voté pour <strong>{votedFor.name}</strong>. En attente des autres joueurs...
        </p>
      )}
      {hasAbstained && (
        <p className="muted">Tu as choisi de ne pas voter. En attente des autres joueurs...</p>
      )}
    </div>
  );
}
