import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ClueRoundScreen } from '@/components/ClueRoundScreen';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('ClueRoundScreen', () => {
  it("shows whose turn it is when it isn't the viewer's turn", () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.getByText(/au tour de bob/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument();
  });

  it('shows an input and submits a clue when it is the viewer\'s turn', () => {
    const onSubmitClue = vi.fn();
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={0}
        clues={[]}
        round={1}
        selfId="p1"
        onSubmitClue={onSubmitClue}
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/ton indice/i), { target: { value: 'fort' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(onSubmitClue).toHaveBeenCalledWith('fort');
  });

  it('lists clues already given in the current round', () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[
          { playerId: 'p1', round: 1, text: 'fort' },
          { playerId: 'p2', round: 2, text: 'ne-devrait-pas-apparaitre' },
        ]}
        round={1}
        selfId="p2"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/fort/)).toBeInTheDocument();
    expect(screen.queryByText(/ne-devrait-pas-apparaitre/)).not.toBeInTheDocument();
  });

  it('shows a countdown derived from the turn deadline', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ClueRoundScreen
          players={players}
          turnOrder={['p1', 'p2']}
          currentTurnIndex={1}
          clues={[]}
          round={1}
          turnDeadline={Date.now() + 42_000}
          selfId="p1"
          onSubmitClue={() => {}}
        />
      );
      expect(screen.getByText(/42s/)).toBeInTheDocument();

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 5));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.getByText(/37s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the current theme when provided', () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        currentTheme="La force brute"
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.getByText(/thème/i)).toBeInTheDocument();
    expect(screen.getByText('La force brute')).toBeInTheDocument();
  });

  it('does not render a theme line when currentTheme is absent (classic mode)', () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.queryByText(/thème/i)).not.toBeInTheDocument();
  });

  it("shows a reconnect countdown next to the current turn-holder's name when they're disconnected", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ClueRoundScreen
          players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: false }]}
          turnOrder={['p1', 'p2']}
          currentTurnIndex={1}
          clues={[]}
          round={1}
          turnDeadline={Date.now() + 30_000}
          selfId="p1"
          onSubmitClue={() => {}}
        />
      );
      expect(screen.getByText(/au tour de bob/i)).toBeInTheDocument();
      expect(screen.getByText(/⏳ 30s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the paused normal timer (frozen) in the header instead of the ticking reconnect grace while someone's disconnected", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ClueRoundScreen
          players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: false }]}
          turnOrder={['p1', 'p2']}
          currentTurnIndex={1}
          clues={[]}
          round={1}
          turnDeadline={Date.now() + 30_000}
          pausedTurnRemainingMs={89_000}
          selfId="p1"
          onSubmitClue={() => {}}
        />
      );
      // Header shows the frozen 89s from the paused normal timer, not the ticking 30s grace.
      expect(screen.getByText('⏱ 89s')).toBeInTheDocument();
      // The reconnect badge next to Bob's name still shows the real, ticking grace countdown.
      expect(screen.getByText(/⏳ 30s/)).toBeInTheDocument();

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 5));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      // The header stays frozen at 89s (it isn't derived from turnDeadline while paused)...
      expect(screen.getByText('⏱ 89s')).toBeInTheDocument();
      // ...while the grace badge keeps ticking down normally.
      expect(screen.getByText(/⏳ 25s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no reconnect countdown when the current turn-holder is connected", () => {
    render(
      <ClueRoundScreen
        players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: true }]}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        turnDeadline={Date.now() + 30_000}
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.queryByText(/⏳/)).not.toBeInTheDocument();
  });

  it('shows no countdown when there is no turn deadline', () => {
    render(
      <ClueRoundScreen
        players={players}
        turnOrder={['p1', 'p2']}
        currentTurnIndex={1}
        clues={[]}
        round={1}
        turnDeadline={null}
        selfId="p1"
        onSubmitClue={() => {}}
      />
    );
    expect(screen.queryByText(/\ds/)).not.toBeInTheDocument();
  });
});
