import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaveGameButton } from '@/components/LeaveGameButton';

describe('LeaveGameButton', () => {
  it('calls onLeave when clicked', () => {
    const onLeave = vi.fn();
    render(<LeaveGameButton onLeave={onLeave} />);
    fireEvent.click(screen.getByRole('button', { name: /quitter la partie/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
