import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoteScreen } from '@/components/VoteScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true },
  { id: 'p2', name: 'Bob', alive: true },
  { id: 'p3', name: 'Carl', alive: false },
];

describe('VoteScreen', () => {
  it('lists alive players excluding the viewer as vote targets', () => {
    render(<VoteScreen players={players} selfId="p1" onVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carl' })).not.toBeInTheDocument();
  });

  it('calls onVote with the target id when clicked', () => {
    const onVote = vi.fn();
    render(<VoteScreen players={players} selfId="p1" onVote={onVote} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(onVote).toHaveBeenCalledWith('p2');
  });
});
