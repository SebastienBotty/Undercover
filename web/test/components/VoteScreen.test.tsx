import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Carl' })).not.toBeInTheDocument();
  });

  it('shows the clue recap for every round played so far', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
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
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} onRetractVote={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(onVote).toHaveBeenCalledWith('p2');
  });

  it('shows who was voted for after clicking, so the click has visible feedback', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
    expect(screen.queryByText(/tu as voté/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    expect(screen.getByText(/tu as voté pour/i)).toBeInTheDocument();
    expect(screen.getByText('Bob', { selector: 'strong' })).toBeInTheDocument();
  });

  it('gives an eliminated viewer no clickable vote targets at all', () => {
    const onVote = vi.fn();
    // Carl (p3) is eliminated in the shared fixture.
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p3" onVote={onVote} onRetractVote={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets the voter change their mind before everyone has voted', () => {
    const onVote = vi.fn();
    const players3 = [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: true },
      { id: 'p3', name: 'Dora', alive: true },
    ];
    render(<VoteScreen players={players3} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} onRetractVote={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));
    fireEvent.click(screen.getByRole('button', { name: /dora/i }));

    expect(onVote).toHaveBeenNthCalledWith(1, 'p2');
    expect(onVote).toHaveBeenNthCalledWith(2, 'p3');
    expect(screen.getByText('Dora', { selector: 'strong' })).toBeInTheDocument();
  });

  it('lets an alive player abstain, calling onVote with null and showing feedback', () => {
    const onVote = vi.fn();
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} onRetractVote={() => {}} />);

    expect(screen.queryByText(/tu as choisi de ne pas voter/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ne pas voter/i }));

    expect(onVote).toHaveBeenCalledWith(null);
    expect(screen.getByText(/tu as choisi de ne pas voter/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ne pas voter/i })).toHaveTextContent('✓');
  });

  it('clears the abstain state when the player votes for someone after abstaining', () => {
    const onVote = vi.fn();
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={onVote} onRetractVote={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /ne pas voter/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

    expect(onVote).toHaveBeenNthCalledWith(1, null);
    expect(onVote).toHaveBeenNthCalledWith(2, 'p2');
    expect(screen.queryByText(/tu as choisi de ne pas voter/i)).not.toBeInTheDocument();
    expect(screen.getByText(/tu as voté pour/i)).toBeInTheDocument();
  });

  it('deselects the vote when clicking the already-selected target again, calling onRetractVote', () => {
    const onVote = vi.fn();
    const onRetractVote = vi.fn();
    render(
      <VoteScreen
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        round={2}
        selfId="p1"
        onVote={onVote}
        onRetractVote={onRetractVote}
      />,
    );

    const bobButton = screen.getByRole('button', { name: 'Bob' });
    fireEvent.click(bobButton);
    expect(onVote).toHaveBeenCalledWith('p2');
    expect(screen.getByText(/tu as voté pour/i)).toBeInTheDocument();

    fireEvent.click(bobButton);
    expect(onRetractVote).toHaveBeenCalledTimes(1);
    expect(onVote).toHaveBeenCalledTimes(1); // not re-sent as a vote
    expect(screen.queryByText(/tu as voté pour/i)).not.toBeInTheDocument();
  });

  it('cancels the abstention when clicking "Ne pas voter" again, calling onRetractVote', () => {
    const onVote = vi.fn();
    const onRetractVote = vi.fn();
    render(
      <VoteScreen
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        round={2}
        selfId="p1"
        onVote={onVote}
        onRetractVote={onRetractVote}
      />,
    );

    const abstainButton = screen.getByRole('button', { name: /ne pas voter/i });
    fireEvent.click(abstainButton);
    expect(onVote).toHaveBeenCalledWith(null);

    fireEvent.click(abstainButton);
    expect(onRetractVote).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/tu as choisi de ne pas voter/i)).not.toBeInTheDocument();
  });

  it('shows a live count of how many alive players have voted', () => {
    render(
      <VoteScreen
        players={players}
        turnOrder={turnOrder}
        clues={clues}
        round={2}
        selfId="p1"
        onVote={() => {}}
        onRetractVote={() => {}}
        votedCount={1}
      />,
    );
    // 2 alive players in the shared fixture (p1, p2) -- p3 is eliminated and doesn't count.
    expect(screen.getByText('1 / 2 ont voté')).toBeInTheDocument();
  });

  it('renders no vote count when votedCount is not provided', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
    expect(screen.queryByText(/ont voté/i)).not.toBeInTheDocument();
  });

  it('shows a countdown to the early resolution once everyone has voted, derived from allVotedDeadline', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <VoteScreen
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}}
          onRetractVote={() => {}}
          votedCount={2}
          allVotedDeadline={Date.now() + 3_000}
        />,
      );
      const notice = screen.getByText(/tout le monde a voté/i);
      expect(notice).toHaveTextContent('3s');
      expect(notice.className).toMatch(/allVotedNoticeVisible/);

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 2));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(notice).toHaveTextContent('1s');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reserves the grace notice\'s space (visibility, not removal) even when allVotedDeadline is not set, so the layout height stays stable', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
    const notice = screen.getByText(/tout le monde a voté/i);
    expect(notice.className).not.toMatch(/allVotedNoticeVisible/);
    expect(notice).toHaveAttribute('aria-hidden', 'true');
  });

  it('gives an eliminated viewer no option to abstain either', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p3" onVote={() => {}} onRetractVote={() => {}} />);
    expect(screen.queryByRole('button', { name: /ne pas voter/i })).not.toBeInTheDocument();
  });

  it('shows a countdown derived from the turn deadline, turning urgent near the end', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <VoteScreen
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}} onRetractVote={() => {}}
          turnDeadline={Date.now() + 15_000}
        />
      );
      expect(screen.getByText(/15s/)).toBeInTheDocument();

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 6));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      const timer = screen.getByText(/9s/);
      expect(timer).toBeInTheDocument();
      expect(timer.className).toMatch(/timerUrgent/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a progress bar that shrinks alongside the countdown, based on the vote duration', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <VoteScreen
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}} onRetractVote={() => {}}
          turnDeadline={Date.now() + 60_000}
          voteDurationSeconds={60}
        />
      );
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '100');

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 30));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(bar).toHaveAttribute('aria-valuenow', '50');
    } finally {
      vi.useRealTimers();
    }
  });

  it('wires up the CSS width transition on the very first render, not only after a later tick', () => {
    // Regression test: the bar's fill element used to only get its inline width/transition set
    // up by a layout effect gated on the ref already existing, but the ref only existed once
    // `secondsLeft` state (which started at null) had been set by a *separate* effect one render
    // later -- and since the layout effect's own deps hadn't changed by then, it never re-ran, so
    // the fill's width was never actually assigned and the bar stayed visually full forever.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <VoteScreen
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}} onRetractVote={() => {}}
          turnDeadline={Date.now() + 30_000}
          voteDurationSeconds={60}
        />
      );
      const bar = screen.getByRole('progressbar');
      const fill = bar.firstElementChild as HTMLElement;
      // jsdom doesn't animate, so the transition's *end* value lands immediately -- what matters
      // is that it was set at all (an unset inline width means the layout effect never fired).
      expect(fill.style.width).toBe('0%');
      expect(fill.style.transition).toContain('width');
      expect(fill.style.transition).not.toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the progress bar urgent once the countdown crosses the urgent threshold', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 0));
      render(
        <VoteScreen
          players={players}
          turnOrder={turnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}} onRetractVote={() => {}}
          turnDeadline={Date.now() + 60_000}
          voteDurationSeconds={60}
        />
      );
      const bar = screen.getByRole('progressbar');
      const fill = bar.firstElementChild as HTMLElement;
      expect(fill.className).not.toMatch(/progressFillUrgent/);

      vi.setSystemTime(new Date(2024, 0, 1, 0, 0, 51));
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(fill.className).toMatch(/progressFillUrgent/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders no countdown or progress bar when there is no turn deadline', () => {
    render(<VoteScreen players={players} turnOrder={turnOrder} clues={clues} round={2} selfId="p1" onVote={() => {}} onRetractVote={() => {}} />);
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  describe('tie-breaking runoff (voteCandidateIds)', () => {
    const runoffPlayers = [
      { id: 'p1', name: 'Alice', alive: true },
      { id: 'p2', name: 'Bob', alive: true },
      { id: 'p3', name: 'Carl', alive: true },
      { id: 'p4', name: 'Dora', alive: true },
    ];
    const runoffTurnOrder = ['p1', 'p2', 'p3', 'p4'];

    it('restricts vote targets to the tied candidates and shows a runoff notice', () => {
      render(
        <VoteScreen
          players={runoffPlayers}
          turnOrder={runoffTurnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}}
          onRetractVote={() => {}}
          voteCandidateIds={['p2', 'p3']}
        />,
      );
      expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Carl' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Dora' })).not.toBeInTheDocument();
      expect(screen.getByText(/égalité/i)).toHaveTextContent('Bob, Carl');
    });

    it('shows no runoff notice and every alive player is votable when voteCandidateIds is absent', () => {
      render(
        <VoteScreen
          players={runoffPlayers}
          turnOrder={runoffTurnOrder}
          clues={clues}
          round={2}
          selfId="p1"
          onVote={() => {}}
          onRetractVote={() => {}}
        />,
      );
      expect(screen.queryByText(/égalité/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Bob' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Carl' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Dora' })).toBeInTheDocument();
    });
  });
});
