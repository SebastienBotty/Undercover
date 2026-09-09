import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoteScreen } from '@/components/VoteScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true },
  { id: 'p2', name: 'Bob', alive: true },
  { id: 'p3', name: 'Carl', alive: false },
];
const turnOrder = ['p1', 'p2', 'p3'];
const clues = [
  { playerId: 'p1', round: 1, text: 'fort' },
  { playerId: 'p2', round: 1, text: 'rapide' },
  { playerId: 'p1', round: 2, text: 'agile' },
];

describe('VoteScreen', () => {
  it('lists alive players excluding the viewer as vote targets', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carl' })).not.toBeInTheDocument();
  });

  it('shows the clue recap for every round played so far', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} />);
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
    expect(screen.getByText('Manche 2')).toBeInTheDocument();
    expect(screen.getByText('fort')).toBeInTheDocument();
    expect(screen.getByText('rapide')).toBeInTheDocument();
    expect(screen.getByText('agile')).toBeInTheDocument();
    // Carl never spoke (eliminated before round 1) -- still listed, with no data.
    expect(screen.getByText('Carl')).toBeInTheDocument();
  });

  it('calls onVote with the target id when clicked', () => {
    const onVote = vi.fn();
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(onVote).toHaveBeenCalledWith('p2');
  });

  it('shows who was voted for after clicking, so the click has visible feedback', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} />);
    expect(screen.queryByText(/tu as voté/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(screen.getByText(/tu as voté pour/i)).toBeInTheDocument();
    expect(screen.getByText('Bob', { selector: 'strong' })).toBeInTheDocument();
  });

  it('lets the voter change their mind before everyone has voted', () => {
    const onVote = vi.fn();
    const players3 = [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: true },
      { id: 'p3', name: 'Dora', alive: true },
    ];
    render(<VoteScreen players={players3} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    fireEvent.click(screen.getByRole('button', { name: /dora/i }));

    expect(onVote).toHaveBeenNthCalledWith(1, 'p2');
    expect(onVote).toHaveBeenNthCalledWith(2, 'p3');
    expect(screen.getByText('Dora', { selector: 'strong' })).toBeInTheDocument();
  });
});
