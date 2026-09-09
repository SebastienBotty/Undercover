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
});
