'use client';
import type { RoomSettings, SimilarityLevel } from '@/lib/hostSettings';

const AVAILABLE_THEMES = ['anime', 'films', 'histoire'];

interface Player {
  id: string;
  name: string;
  alive: boolean;
  connected: boolean;
}

interface LobbyScreenProps {
  isHost: boolean;
  players: Player[];
  settings: RoomSettings;
  onStart: () => void;
  onSettingsChange: (settings: RoomSettings) => void;
}

export function LobbyScreen({ isHost, players, settings, onStart, onSettingsChange }: LobbyScreenProps) {
  function toggleTheme(theme: string) {
    const themes = settings.themes.includes(theme)
      ? settings.themes.filter((t) => t !== theme)
      : [...settings.themes, theme];
    onSettingsChange({ ...settings, themes });
  }

  return (
    <div>
      <h2>Lobby</h2>
      <ul>
        {players.map((p) => (
          <li key={p.id}>{p.name}{!p.connected ? ' (déconnecté)' : ''}</li>
        ))}
      </ul>

      {isHost && (
        <div>
          <fieldset>
            <legend>Thèmes</legend>
            {AVAILABLE_THEMES.map((theme) => (
              <label key={theme} htmlFor={`theme-${theme}`}>
                <input
                  id={`theme-${theme}`}
                  type="checkbox"
                  checked={settings.themes.includes(theme)}
                  onChange={() => toggleTheme(theme)}
                />
                {theme}
              </label>
            ))}
          </fieldset>

          <label htmlFor="similarity-select">Similarité</label>
          <select
            id="similarity-select"
            value={settings.similarityLevel}
            onChange={(e) => onSettingsChange({ ...settings, similarityLevel: e.target.value as SimilarityLevel })}
          >
            <option value="none">Aucun lien</option>
            <option value="close">Proche</option>
            <option value="very_close">Très proche</option>
          </select>

          <label htmlFor="mrwhite-checkbox">
            <input
              id="mrwhite-checkbox"
              type="checkbox"
              checked={settings.mrWhiteEnabled}
              onChange={(e) => onSettingsChange({ ...settings, mrWhiteEnabled: e.target.checked })}
            />
            Mr. White
          </label>

          <button onClick={onStart}>Lancer la partie</button>
        </div>
      )}
    </div>
  );
}
