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
});
