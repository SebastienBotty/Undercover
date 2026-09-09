import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LobbyScreen } from '@/components/LobbyScreen';

const players = [
  { id: 'p1', name: 'Alice', alive: true, connected: true },
  { id: 'p2', name: 'Bob', alive: true, connected: true },
];

describe('LobbyScreen', () => {
  it('lists connected players', () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('prominently displays the room code so the host can share it', () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(screen.getByText(/abcde/i)).toBeInTheDocument();
  });

  it('hides the settings form and start button for non-hosts', () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(screen.queryByRole('button', { name: /lancer la partie/i })).not.toBeInTheDocument();
  });

  it('lets the host toggle a theme and Mr White, and calls onSettingsChange', () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ themes: [], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />
    );
    fireEvent.click(screen.getByLabelText(/anime/i));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ themes: ['anime'] }));

    fireEvent.click(screen.getByLabelText(/mr\. white/i));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ mrWhiteEnabled: true }));
  });

  it('lets the host start the game', () => {
    const onStart = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ themes: ['anime'], similarityLevel: 'close', mrWhiteEnabled: false }}
        onStart={onStart}
        onSettingsChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /lancer la partie/i }));
    expect(onStart).toHaveBeenCalled();
  });
});
