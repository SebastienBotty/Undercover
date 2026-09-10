import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EndScreen } from '@/components/EndScreen';

const players = [
  { id: 'p1', name: 'Alice', role: 'civil' as const, character: 'Goku' },
  { id: 'p2', name: 'Bob', role: 'undercover' as const, character: 'Vegeta' },
];

describe('EndScreen', () => {
  it('announces the winning side', () => {
    render(<EndScreen winner="civil" players={players} isHost={false} onRestart={() => {}} onLeave={() => {}} />);
    expect(screen.getByText(/civils/i)).toBeInTheDocument();
  });

  it('lists every player with their revealed role and character', () => {
    render(<EndScreen winner="civil" players={players} isHost={false} onRestart={() => {}} onLeave={() => {}} />);
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
    expect(screen.getByText(/bob/i)).toBeInTheDocument();
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
  });

  it('calls onLeave when the quit button is clicked', () => {
    const onLeave = vi.fn();
    render(<EndScreen winner="civil" players={players} isHost={false} onRestart={() => {}} onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter/i }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('shows a Rejouer button to the host and calls onRestart when clicked', () => {
    const onRestart = vi.fn();
    render(<EndScreen winner="civil" players={players} isHost={true} onRestart={onRestart} onLeave={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /rejouer/i }));
    expect(onRestart).toHaveBeenCalled();
  });

  it('shows a waiting message instead of Rejouer for non-hosts', () => {
    render(<EndScreen winner="civil" players={players} isHost={false} onRestart={() => {}} onLeave={() => {}} />);
    expect(screen.queryByRole('button', { name: /rejouer/i })).not.toBeInTheDocument();
    expect(screen.getByText(/en attente que l'hôte relance/i)).toBeInTheDocument();
  });

  it('reveals notes instead of characters when players carry a note', () => {
    const notePlayers = [
      { id: 'p1', name: 'Alice', role: 'civil' as const, character: null, note: 14 },
      { id: 'p2', name: 'Bob', role: 'undercover' as const, character: null, note: 10 },
    ];
    render(<EndScreen winner="civil" players={notePlayers} isHost={false} onRestart={() => {}} onLeave={() => {}} />);
    expect(screen.getByText(/14\/20/)).toBeInTheDocument();
    expect(screen.getByText(/10\/20/)).toBeInTheDocument();
  });
});
