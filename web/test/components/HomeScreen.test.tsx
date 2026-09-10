import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '@/components/HomeScreen';

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ json: async () => ({ code: 'NEWRM' }) }))
  );
});

describe('HomeScreen', () => {
  it('asks for a pseudo before showing create/join options', () => {
    render(<HomeScreen onEnterRoom={() => {}} />);
    expect(screen.getByLabelText(/pseudo/i)).toBeInTheDocument();
    expect(screen.queryByText(/créer une salle/i)).not.toBeInTheDocument();
  });

  it('shows create/join options once a pseudo is set', () => {
    render(<HomeScreen onEnterRoom={() => {}} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
    expect(screen.getByText(/créer une salle/i)).toBeInTheDocument();
  });

  it('calls onEnterRoom with a fresh code and host=true after creating a room', async () => {
    const onEnterRoom = vi.fn();
    render(<HomeScreen onEnterRoom={onEnterRoom} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    fireEvent.click(screen.getByRole('button', { name: /créer une salle/i }));
    await vi.waitFor(() => expect(onEnterRoom).toHaveBeenCalledWith('NEWRM', 'Seb', true));
  });

  it('shows an inline error message when creating a room fails, instead of doing nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error');
      })
    );
    const onEnterRoom = vi.fn();
    render(<HomeScreen onEnterRoom={onEnterRoom} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    fireEvent.click(screen.getByRole('button', { name: /créer une salle/i }));
    await screen.findByRole('alert');

    expect(onEnterRoom).not.toHaveBeenCalled();
  });

  it('calls onEnterRoom with the typed code and host=false after joining a room', () => {
    const onEnterRoom = vi.fn();
    render(<HomeScreen onEnterRoom={onEnterRoom} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));

    fireEvent.change(screen.getByLabelText(/code de la salle/i), { target: { value: 'abcde' } });
    fireEvent.click(screen.getByRole('button', { name: /rejoindre/i }));
    expect(onEnterRoom).toHaveBeenCalledWith('ABCDE', 'Seb', false);
  });

  it('shows a notice (e.g. after being kicked) once a pseudo is already set', () => {
    render(<HomeScreen onEnterRoom={() => {}} notice="L'hôte t'a exclu de la salle" />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
    expect(screen.getByRole('alert')).toHaveTextContent("L'hôte t'a exclu de la salle");
  });

  it('shows no notice when none is provided', () => {
    render(<HomeScreen onEnterRoom={() => {}} />);
    fireEvent.change(screen.getByLabelText(/pseudo/i), { target: { value: 'Seb' } });
    fireEvent.click(screen.getByRole('button', { name: /continuer/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
