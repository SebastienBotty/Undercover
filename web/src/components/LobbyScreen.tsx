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
  code: string;
  players: Player[];
  settings: RoomSettings;
  onStart: () => void;
  onSettingsChange: (settings: RoomSettings) => void;
}

export function LobbyScreen({ isHost, code, players, settings, onStart, onSettingsChange }: LobbyScreenProps) {
  function toggleTheme(theme: string) {
    const themes = settings.themes.includes(theme)
      ? settings.themes.filter((t) => t !== theme)
      : [...settings.themes, theme];
    onSettingsChange({ ...settings, themes });
  }

  return (
    <div>
      <span className="eyebrow">Salle</span>
      <p className="roomCode">{code}</p>
      <h3>Joueurs</h3>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id} className={`rosterItem${!p.connected ? ' rosterItemDim' : ''}`}>
            <span>{p.name}</span>
            {!p.connected && <span className="stamp">Déconnecté</span>}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="field">
          <hr className="divider" />
          <h3>Réglages</h3>
          <fieldset className="field">
            <legend className="muted">Thèmes</legend>
            {AVAILABLE_THEMES.map((theme) => (
              <label key={theme} htmlFor={`theme-${theme}`} className="checkboxRow">
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

          <div className="field">
            <label htmlFor="similarity-select">Similarité</label>
            <select
              id="similarity-select"
              className="input"
              value={settings.similarityLevel}
              onChange={(e) => onSettingsChange({ ...settings, similarityLevel: e.target.value as SimilarityLevel })}
            >
              <option value="none">Aucun lien</option>
              <option value="close">Proche</option>
              <option value="very_close">Très proche</option>
            </select>
          </div>

          <label htmlFor="mrwhite-checkbox" className="checkboxRow">
            <input
              id="mrwhite-checkbox"
              type="checkbox"
              checked={settings.mrWhiteEnabled}
              onChange={(e) => onSettingsChange({ ...settings, mrWhiteEnabled: e.target.checked })}
            />
            Mr. White
          </label>

          <button onClick={onStart} className="btn btnBlock">
            Lancer la partie
          </button>
        </div>
      )}
    </div>
  );
}
