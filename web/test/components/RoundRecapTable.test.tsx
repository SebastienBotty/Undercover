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
    const bob = screen.getByRole('button', { name: /bob/i });
    const alice = screen.getByRole('button', { name: /alice/i });
    expect(bob.querySelector('[aria-hidden="true"]')?.className).toMatch(/checkVisible/);
    // Not selected -- the checkmark space is still reserved (rendered, just hidden), so voting
    // for someone doesn't change any button's width and shift the table's layout.
    expect(alice.querySelector('[aria-hidden="true"]')?.className ?? '').not.toMatch(/checkVisible/);
    expect(alice).toHaveTextContent('✓');
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

  it('darkens the whole row of an eliminated player', () => {
    const withElimination = [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: false, role: null },
    ];
    render(<RoundRecapTable players={withElimination} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    expect(screen.getByText('Bob').closest('tr')?.className).toMatch(/rowEliminated/);
    expect(screen.getByText('Alice').closest('tr')?.className ?? '').not.toMatch(/rowEliminated/);
  });

  it('shows an "Éliminé" stamp next to an eliminated player\'s name, but not an alive one', () => {
    const withElimination = [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: false, role: null },
    ];
    render(<RoundRecapTable players={withElimination} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(bobRow).toHaveTextContent('Éliminé');
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(aliceRow).not.toHaveTextContent('Éliminé');
  });

  it('shows the revealed role under an eliminated player\'s name, colored by role', () => {
    const withRoles = [
      { id: 'p1', name: 'Alice', alive: false, role: 'undercover' as const },
      { id: 'p2', name: 'Bob', alive: false, role: 'civil' as const },
    ];
    render(<RoundRecapTable players={withRoles} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    expect(screen.getByText('Undercover').className).toMatch(/roleUndercover/);
    expect(screen.getByText('Civil').className).toMatch(/roleCivil/);
  });

  it('shows a "Déconnecté" stamp next to a disconnected player\'s name, but not a connected one', () => {
    const withDisconnect = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: false },
    ];
    render(<RoundRecapTable players={withDisconnect} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(bobRow).toHaveTextContent('Déconnecté');
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(aliceRow).not.toHaveTextContent('Déconnecté');
  });

  it('treats a player with no connected field as connected (no stamp)', () => {
    render(<RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    expect(screen.queryByText('Déconnecté')).not.toBeInTheDocument();
  });

  it('shows an accusation-vote count next to a player who has missed clue timers, but not otherwise', () => {
    render(
      <RoundRecapTable
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        totalRounds={1}
        accusationVotes={{ p2: 2 }}
      />,
    );
    const bobRow = screen.getByText('Bob').closest('tr')!;
    expect(bobRow).toHaveTextContent('+2 votes');
    const aliceRow = screen.getByText('Alice').closest('tr')!;
    expect(aliceRow).not.toHaveTextContent('vote');
  });

  it('shows no accusation stamp when accusationVotes is absent or the count is zero', () => {
    render(<RoundRecapTable players={players} turnOrder={turnOrder} clues={clues} totalRounds={1} accusationVotes={{ p1: 0 }} />);
    expect(screen.queryByText(/\+\d+ vote/)).not.toBeInTheDocument();
  });

  it('shows a white "Mr. White" tag and never reveals a role for a still-alive player', () => {
    const mixed = [
      { id: 'p1', name: 'Alice', alive: true, role: 'civil' as const }, // own role, revealed to self server-side, but must not show in the table while alive
      { id: 'p2', name: 'Bob', alive: false, role: 'mrwhite' as const },
    ];
    render(<RoundRecapTable players={mixed} turnOrder={turnOrder} clues={clues} totalRounds={1} />);
    expect(screen.getByText('Mr. White').className).toMatch(/roleMrwhite/);
    expect(screen.queryByText('Civil')).not.toBeInTheDocument();
  });
});
