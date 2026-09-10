import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RoundRecapTable } from '@/components/RoundRecapTable';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];
const turnOrder = ['p1', 'p2'];
const clues = [
  { playerId: 'p1', round: 1, text: 'fort' },
  { playerId: 'p2', round: 1, text: '' },
];

describe('RoundRecapTable', () => {
  it('renders one column per round played so far', () => {
    render(<RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={2} />);
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
    expect(screen.getByText('Manche 2')).toBeInTheDocument();
  });

  it('shows each clue in its player+round cell, and a placeholder for a round not yet reached', () => {
    render(<RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={2} />);
    expect(screen.getByText('fort')).toBeInTheDocument();
    expect(screen.getByText('(pas de réponse)')).toBeInTheDocument(); // Bob's empty-string round-1 clue (timeout)
    expect(screen.getAllByText('…')).toHaveLength(2); // neither player has spoken in round 2 yet
  });

  it('flags the current turn player', () => {
    render(
      <RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} currentTurnPlayerId="p2" />
    );
    expect(screen.getByLabelText("C'est son tour")).toBeInTheDocument();
  });

  it('renders no vote buttons when votableIds is not provided', () => {
    render(<RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a clickable name only for votable players, and calls onVote when clicked', () => {
    const onVote = vi.fn();
    render(
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={1}
        votableIds={new Set(['p2'])}
        onVote={onVote}
      />
    );
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(onVote).toHaveBeenCalledWith('p2');
  });

  it('marks the selected player', () => {
    render(
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={1}
        votableIds={new Set(['p1', 'p2'])}
        selectedId="p2"
        onVote={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /bob/i })).toHaveTextContent('✓');
  });

  it('shows the theme as a subtitle under the round header when provided', () => {
    render(
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={2}
        themes={[{ round: 1, text: 'La force brute' }]}
      />
    );
    expect(screen.getByText('La force brute')).toBeInTheDocument();
  });

  it('renders no theme subtitle for a round with no theme entry', () => {
    render(
      <RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} themes={[]} />
    );
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
  });
});
