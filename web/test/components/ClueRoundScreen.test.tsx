import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
