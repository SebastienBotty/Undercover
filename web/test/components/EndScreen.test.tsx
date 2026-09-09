import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EndScreen } from '@/components/EndScreen';

const players = [
  { id: 'p1', name: 'Alice', role: 'civil' as const, character: 'Goku' },
  { id: 'p2', name: 'Bob', role: 'undercover' as const, character: 'Vegeta' },
];

describe('EndScreen', () => {
  it('announces the winning side', () => {
    render(<EndScreen winner="civil" players={players} onReplay={() => {}} />);
    expect(screen.getByText(/civils/i)).toBeInTheDocument();
  });

  it('lists every player with their revealed role and character', () => {
    render(<EndScreen winner="civil" players={players} onReplay={() => {}} />);
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
  });

  it('calls onReplay when the quit button is clicked', () => {
    const onReplay = vi.fn();
    render(<EndScreen winner="civil" players={players} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter/i }));
    expect(onReplay).toHaveBeenCalled();
  });
});
