import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EliminationScreen } from '@/components/EliminationScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true, role: null, character: null },
  { id: 'p2', name: 'Bob', alive: false, role: 'undercover' as const, character: 'Vegeta' },
];

describe('EliminationScreen', () => {
  it('reveals the eliminated player role and character', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
  });

  it('does not show a guess form when the eliminated player is not Mr. White', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.queryByRole('button', { name: /deviner/i })).not.toBeInTheDocument();
  });

  it('shows a guess form to the eliminated Mr. White and calls onMrWhiteGuess on submit', () => {
    const mrWhitePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'mrwhite' as const, character: null },
    ];
    const onMrWhiteGuess = vi.fn();
    render(<EliminationScreen players={mrWhitePlayers} lastEliminatedId="p2" selfId="p2" onMrWhiteGuess={onMrWhiteGuess} />);
    fireEvent.change(screen.getByLabelText(/devine le personnage/i), { target: { value: 'Goku' } });
    fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
    expect(onMrWhiteGuess).toHaveBeenCalledWith('Goku');
  });
});
