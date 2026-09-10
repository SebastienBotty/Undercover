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

  it('shows the note instead of the character in note mode', () => {
    render(<RoleBanner role="civil" character={null} note={14} />);
    expect(screen.getByText(/14\/20/)).toBeInTheDocument();
  });
});
