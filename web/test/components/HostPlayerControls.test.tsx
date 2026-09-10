import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HostPlayerControls } from '@/components/HostPlayerControls';

const players = [
  { id: 'p1', name: 'Alice', alive: true },
  { id: 'p2', name: 'Bob', alive: true },
  { id: 'p3', name: 'Carl', alive: false },
];

describe('HostPlayerControls', () => {
  it('starts collapsed, hiding the player list', () => {
    render(<HostPlayerControls players={players} selfId="p1" onKickPlayer={() => {}} />);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('expands to list every other player when the toggle is clicked', () => {
    render(<HostPlayerControls players={players} selfId="p1" onKickPlayer={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /gérer les joueurs/i }));
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carl')).toBeInTheDocument();
    // The viewer (self) never lists themselves as a kick target.
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('kicks a player immediately, with no confirmation', () => {
    const onKickPlayer = vi.fn();
    render(<HostPlayerControls players={players} selfId="p1" onKickPlayer={onKickPlayer} />);
    fireEvent.click(screen.getByRole('button', { name: /gérer les joueurs/i }));
    fireEvent.click(screen.getByRole('button', { name: /exclure bob/i }));
    expect(onKickPlayer).toHaveBeenCalledWith('p2');
  });
});
