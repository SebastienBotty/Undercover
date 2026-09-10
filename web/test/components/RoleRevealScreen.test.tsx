import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleRevealScreen } from '@/components/RoleRevealScreen';

describe('RoleRevealScreen', () => {
  it('shows the character name for a civil', () => {
    render(<RoleRevealScreen role="civil" character="Goku" />);
    expect(screen.getByText('Goku')).toBeInTheDocument();
    expect(screen.getByText(/civil/i)).toBeInTheDocument();
  });

  it('shows the character name for an undercover', () => {
    render(<RoleRevealScreen role="undercover" character="Vegeta" />);
    expect(screen.getByText('Vegeta')).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
  });

  it('shows a bluff message with no character for Mr. White', () => {
    render(<RoleRevealScreen role="mrwhite" character={null} />);
    expect(screen.getByText(/mr\. white/i)).toBeInTheDocument();
    expect(screen.queryByText('Goku')).not.toBeInTheDocument();
  });

  it('shows the character photo when one is provided', () => {
    render(<RoleRevealScreen role="civil" character="Goku" characterImage="https://example.com/goku.jpg" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/goku.jpg');
  });

  it('renders without a photo when none is provided', () => {
    render(<RoleRevealScreen role="civil" character="Goku" characterImage={null} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the note instead of the character when a note is provided', () => {
    render(<RoleRevealScreen role="civil" character={null} note={14} />);
    expect(screen.getByText(/ta note : 14\/20/i)).toBeInTheDocument();
  });

  it('shows the source anime series in parentheses next to the character name', () => {
    render(<RoleRevealScreen role="civil" character="Goku" characterSeries="Dragon Ball" />);
    expect(screen.getByText('Goku')).toBeInTheDocument();
    expect(screen.getByText('(Dragon Ball)')).toBeInTheDocument();
  });

  it('does not show a series parenthetical for non-anime characters', () => {
    render(<RoleRevealScreen role="civil" character="Napoléon" characterSeries={null} />);
    expect(screen.getByText('Napoléon')).toBeInTheDocument();
    expect(screen.queryByText(/\(.*\)/)).not.toBeInTheDocument();
  });

  it('colors the role red for an undercover even in note mode', () => {
    render(<RoleRevealScreen role="undercover" character={null} note={10} />);
    expect(screen.getByText(/ta note : 10\/20/i)).toBeInTheDocument();
    expect(screen.getByText(/undercover/i)).toBeInTheDocument();
  });
});
