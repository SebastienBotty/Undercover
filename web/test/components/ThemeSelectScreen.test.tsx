import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeSelectScreen } from '@/components/ThemeSelectScreen';

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('ThemeSelectScreen', () => {
  it("shows who is choosing the theme when it isn't the viewer's turn", () => {
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p2"
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    expect(screen.getByText(/en attente du thème de bob/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /envoyer/i })).not.toBeInTheDocument();
  });

  it('shows an input and submits a theme when it is the viewer\'s turn', () => {
    const onSubmitTheme = vi.fn();
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p1"
        selfId="p1"
        onSubmitTheme={onSubmitTheme}
      />
    );
    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: 'La force brute' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }));
    expect(onSubmitTheme).toHaveBeenCalledWith('La force brute');
  });

  it('shows the recap table with past rounds only, not the round in progress', () => {
    const { container } = render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[{ playerId: 'p1', round: 1, text: 'fort' }]}
        themes={[{ round: 1, playerId: 'p2', text: 'theme-1' }]}
        round={2}
        themeSetterId="p2"
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    expect(screen.getByText('Manche 1')).toBeInTheDocument();
    const table = container.querySelector('table');
    expect(table).not.toHaveTextContent('Manche 2');
  });

  it('disables the submit button while the draft is empty or whitespace-only', () => {
    render(
      <ThemeSelectScreen
        players={players}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p1"
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    const submitButton = screen.getByRole('button', { name: /envoyer/i });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/propose un thème/i), { target: { value: 'La force brute' } });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows a countdown derived from the turn deadline', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ThemeSelectScreen
          players={players}
          turnOrder={['p1', 'p2']}
          clues={[]}
          themes={[]}
          round={1}
          themeSetterId="p2"
          turnDeadline={Date.now() + 42_000}
          selfId="p1"
          onSubmitTheme={() => {}}
        />
      );
      expect(screen.getByText(/42s/)).toBeInTheDocument();

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 5));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.getByText(/37s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a reconnect countdown next to the theme-setter's name when they're disconnected", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ThemeSelectScreen
          players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: false }]}
          turnOrder={['p1', 'p2']}
          clues={[]}
          themes={[]}
          round={1}
          themeSetterId="p2"
          turnDeadline={Date.now() + 30_000}
          selfId="p1"
          onSubmitTheme={() => {}}
        />
      );
      expect(screen.getByText(/en attente du thème de bob/i)).toBeInTheDocument();
      expect(screen.getByText(/⏳ 30s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the paused normal timer (frozen) in the header instead of the ticking reconnect grace while the setter is disconnected", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <ThemeSelectScreen
          players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: false }]}
          turnOrder={['p1', 'p2']}
          clues={[]}
          themes={[]}
          round={1}
          themeSetterId="p2"
          turnDeadline={Date.now() + 30_000}
          pausedTurnRemainingMs={89_000}
          selfId="p1"
          onSubmitTheme={() => {}}
        />
      );
      // Header shows the frozen 89s from the paused normal timer, not the ticking 30s grace.
      expect(screen.getByText('⏱ 89s')).toBeInTheDocument();
      // The reconnect badge next to Bob's name still shows the real, ticking grace countdown.
      expect(screen.getByText(/⏳ 30s/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows no reconnect countdown when the theme-setter is connected', () => {
    render(
      <ThemeSelectScreen
        players={[{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob', connected: true }]}
        turnOrder={['p1', 'p2']}
        clues={[]}
        themes={[]}
        round={1}
        themeSetterId="p2"
        turnDeadline={Date.now() + 30_000}
        selfId="p1"
        onSubmitTheme={() => {}}
      />
    );
    expect(screen.queryByText(/⏳/)).not.toBeInTheDocument();
  });
});
