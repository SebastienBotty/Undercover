import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoomCodeBadge } from '@/components/RoomCodeBadge';

describe('RoomCodeBadge', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the room code', () => {
    render(<RoomCodeBadge code="ABCDE" />);
    expect(screen.getByText('ABCDE')).toBeInTheDocument();
    expect(screen.getByText(/salle/i)).toBeInTheDocument();
  });

  it('is a clickable button that copies the code, with brief confirmation feedback', async () => {
    render(<RoomCodeBadge code="ABCDE" />);
    const button = screen.getByRole('button', { name: /copier le code de la salle/i });
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDE');
    await waitFor(() => expect(screen.getByText(/copié/i)).toBeInTheDocument());
  });
});
