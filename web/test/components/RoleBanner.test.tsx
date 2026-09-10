import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleBanner } from '@/components/RoleBanner';

describe('RoleBanner', () => {
  it('renders nothing when there is no role yet', () => {
    const { container } = render(<RoleBanner role={null} character={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the character for classic mode', () => {
    render(<RoleBanner role="civil" character="Goku" />);
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
  });

  it('shows the source anime series in parentheses next to the character name', () => {
    render(<RoleBanner role="civil" character="Goku" characterSeries="Dragon Ball" />);
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
    expect(screen.getByText('(Dragon Ball)')).toBeInTheDocument();
  });

  it('shows the note instead of the character in note mode', () => {
    render(<RoleBanner role="civil" character={null} note={14} />);
    expect(screen.getByText(/14\/20/)).toBeInTheDocument();
  });

  it('never says "Civil", so a player can\'t tell their own role at a glance', () => {
    render(<RoleBanner role="civil" character="Goku" />);
    expect(screen.getByText(/goku/i)).toBeInTheDocument();
    expect(screen.queryByText(/civil/i)).not.toBeInTheDocument();
  });

  it('never says "Undercover" either', () => {
    render(<RoleBanner role="undercover" character="Vegeta" />);
    expect(screen.getByText(/vegeta/i)).toBeInTheDocument();
    expect(screen.queryByText(/undercover/i)).not.toBeInTheDocument();
  });

  it('does tell Mr. White their role outright, since they have no character to see instead', () => {
    render(<RoleBanner role="mrwhite" character={null} />);
    expect(screen.getByText(/mr\. white/i)).toBeInTheDocument();
  });
});
