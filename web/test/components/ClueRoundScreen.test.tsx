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
