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

  it('colors the revealed role text by role', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/^un undercover$/i).className).toMatch(/roleUndercover/);
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

  it('reveals the eliminated player note when present, instead of a character', () => {
    const notePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null, note: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'undercover' as const, character: null, note: 10 },
    ];
    render(<EliminationScreen players={notePlayers} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/10\/20/)).toBeInTheDocument();
  });

  it('shows a "role stays secret" message instead of the role when the host disabled reveal-on-elimination', () => {
    const hiddenPlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null },
      { id: 'p2', name: 'Bob', alive: false, role: null, character: null },
    ];
    render(<EliminationScreen players={hiddenPlayers} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/son rôle reste secret/i)).toBeInTheDocument();
    expect(screen.queryByText(/undercover|civil|mr\. white/i)).not.toBeInTheDocument();
  });

  it('shows a big "Tu as été éliminé" heading to the eliminated player themselves', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p2" onMrWhiteGuess={() => {}} />);
    expect(screen.getByRole('heading', { name: /tu as été éliminé/i })).toBeInTheDocument();
    expect(screen.queryByText(/^bob éliminé$/i)).not.toBeInTheDocument();
  });

  it('shows the eliminated player\'s name (not the generic message) to other viewers', () => {
    render(<EliminationScreen players={players} lastEliminatedId="p2" selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.queryByText(/tu as été éliminé/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveTextContent('Bob');
  });

  it('shows a generic message when nobody was eliminated and no reason is given', () => {
    render(<EliminationScreen players={players} lastEliminatedId={null} selfId="p1" onMrWhiteGuess={() => {}} />);
    expect(screen.getByText(/personne n'a été éliminé ce tour-ci/i)).toBeInTheDocument();
  });

  it('explains a tie when nobody was eliminated because of one', () => {
    render(
      <EliminationScreen players={players} lastEliminatedId={null} noEliminationReason="tie" selfId="p1" onMrWhiteGuess={() => {}} />,
    );
    expect(screen.getByText(/égalité entre plusieurs joueurs/i)).toBeInTheDocument();
  });

  it('explains a lack of votes when nobody was eliminated because nobody voted', () => {
    render(
      <EliminationScreen
        players={players}
        lastEliminatedId={null}
        noEliminationReason="no_votes"
        selfId="p1"
        onMrWhiteGuess={() => {}}
      />,
    );
    expect(screen.getByText(/personne n'a voté/i)).toBeInTheDocument();
  });

  it('explains a lack of majority when a single candidate led but not enough alive players backed them', () => {
    render(
      <EliminationScreen
        players={players}
        lastEliminatedId={null}
        noEliminationReason="no_majority"
        selfId="p1"
        onMrWhiteGuess={() => {}}
      />,
    );
    expect(screen.getByText(/pas de majorité parmi les joueurs vivants/i)).toBeInTheDocument();
  });

  it('shows a numeric guess field to the eliminated Mr. White in note mode', () => {
    const mrWhitePlayers = [
      { id: 'p1', name: 'Alice', alive: true, role: null, character: null, note: null },
      { id: 'p2', name: 'Bob', alive: false, role: 'mrwhite' as const, character: null, note: null },
    ];
    const onMrWhiteGuess = vi.fn();
    render(<EliminationScreen players={mrWhitePlayers} lastEliminatedId="p2" selfId="p2" mode="note" onMrWhiteGuess={onMrWhiteGuess} />);
    const input = screen.getByLabelText(/devine la note/i);
    expect(input).toHaveAttribute('type', 'number');
    fireEvent.change(input, { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: /deviner/i }));
    expect(onMrWhiteGuess).toHaveBeenCalledWith('14');
  });
});
