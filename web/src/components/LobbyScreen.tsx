"use client";
import {
  CLUE_TIMER_MIN_SECONDS,
  CLUE_TIMER_MAX_SECONDS,
  type RoomSettings,
  type SimilarityLevel,
  type GameMode,
} from "@/lib/hostSettings";
import { useThemeCatalog } from "@/lib/useThemeCatalog";
import styles from "./LobbyScreen.module.css";

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

export function LobbyScreen({
  isHost,
  code,
  players,
  settings,
  onStart,
  onSettingsChange,
}: LobbyScreenProps) {
  const { themes, error: catalogError } = useThemeCatalog();

  function toggleTheme(theme: string) {
    const nextThemes = settings.themes.includes(theme)
      ? settings.themes.filter((t) => t !== theme)
      : [...settings.themes, theme];
    onSettingsChange({ ...settings, themes: nextThemes });
  }

  function toggleAnimeSeries(seriesId: string, allSeriesIds: string[]) {
    // An empty animeSeries means "no filter, every series included" -- the first toggle turns
    // that implicit "all" into an explicit list, which then behaves as a normal toggle set.
    const currentlySelected =
      settings.animeSeries.length === 0 ? allSeriesIds : settings.animeSeries;
    const nextSelected = currentlySelected.includes(seriesId)
      ? currentlySelected.filter((id) => id !== seriesId)
      : [...currentlySelected, seriesId];
    onSettingsChange({ ...settings, animeSeries: nextSelected });
  }

  return (
    <div>
      <span className="eyebrow">Salle</span>
      <p className="roomCode">{code}</p>
      <h3>Joueurs</h3>
      <ul className="roster">
        {players.map((p) => (
          <li key={p.id} className={`rosterItem${!p.connected ? " rosterItemDim" : ""}`}>
            <span>{p.name}</span>
            {!p.connected && <span className="stamp">Déconnecté</span>}
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="field">
          <hr className="divider" />
          <h3>Réglages</h3>

          <div className="field">
            <label htmlFor="mode-select">Mode de jeu</label>
            <select
              id="mode-select"
              className="input"
              value={settings.mode}
              onChange={(e) => onSettingsChange({ ...settings, mode: e.target.value as GameMode })}
            >
              <option value="classic">Classique</option>
              <option value="note">Note</option>
            </select>
          </div>

          {settings.mode === "note" ? (
            <div className="field">
              <label htmlFor="civil-note-input">Note des Civils (0-20)</label>
              <input
                id="civil-note-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={settings.civilNote}
                onChange={(e) => onSettingsChange({ ...settings, civilNote: Number(e.target.value) })}
              />
              <label htmlFor="undercover-note-input">Note des Undercover (0-20)</label>
              <input
                id="undercover-note-input"
                type="number"
                min={0}
                max={20}
                className="input"
                value={settings.undercoverNote}
                onChange={(e) => onSettingsChange({ ...settings, undercoverNote: Number(e.target.value) })}
              />
            </div>
          ) : (
            <>
              <fieldset className={styles.themesFieldset}>
                <legend className="muted">Thèmes</legend>

                {!themes && !catalogError && <p className="muted">Chargement des thèmes...</p>}
                {catalogError && (
                  <p role="alert" className="alert">
                    {catalogError}
                  </p>
                )}

                {themes?.map((theme) => (
                  <div key={theme.id} className={styles.themeCard}>
                    <label htmlFor={`theme-${theme.id}`} className={styles.themeRow}>
                      <input
                        id={`theme-${theme.id}`}
                        type="checkbox"
                        checked={settings.themes.includes(theme.id)}
                        onChange={() => toggleTheme(theme.id)}
                      />
                      <span className={styles.themeLabel}>{theme.label}</span>
                      <span className={styles.themeCount}>({theme.count})</span>
                    </label>

                    {theme.series && theme.series.length > 0 && (
                      <details className={styles.seriesDetails}>
                        <summary
                          className={`${styles.seriesSummary}${!settings.themes.includes(theme.id) ? ` ${styles.seriesSummaryDisabled}` : ""}`}
                          aria-disabled={!settings.themes.includes(theme.id)}
                          onClick={(e) => {
                            if (!settings.themes.includes(theme.id)) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <span aria-hidden="true" className={styles.seriesArrow}>
                            ▸
                          </span>
                          Choisir les {theme.label.toLowerCase()}s
                        </summary>
                        <div className={styles.seriesList}>
                          {theme.series.map((series) => {
                            const isChecked =
                              settings.animeSeries.length === 0 ||
                              settings.animeSeries.includes(series.id);
                            return (
                              <label
                                key={series.id}
                                htmlFor={`series-${series.id}`}
                                className={styles.seriesRow}
                              >
                                <input
                                  id={`series-${series.id}`}
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() =>
                                    toggleAnimeSeries(
                                      series.id,
                                      theme.series!.map((s) => s.id),
                                    )
                                  }
                                />
                                <span>{series.label}</span>
                                <span className={styles.themeCount}>({series.count})</span>
                              </label>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </fieldset>

              <div className="field">
                <label htmlFor="similarity-select">Similarité</label>
                <select
                  id="similarity-select"
                  className="input"
                  value={settings.similarityLevel}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      similarityLevel: e.target.value as SimilarityLevel,
                    })
                  }
                >
                  <option value="none">Aucun lien</option>
                  <option value="close">Proche</option>
                  <option value="very_close">Très proche</option>
                </select>
              </div>
            </>
          )}

          <label htmlFor="mrwhite-checkbox" className="checkboxRow">
            <input
              id="mrwhite-checkbox"
              type="checkbox"
              checked={settings.mrWhiteEnabled}
              onChange={(e) => onSettingsChange({ ...settings, mrWhiteEnabled: e.target.checked })}
            />
            Mr. White
          </label>

          <div className="field">
            <label htmlFor="cluetimer-checkbox" className="checkboxRow">
              <input
                id="cluetimer-checkbox"
                type="checkbox"
                checked={settings.clueTimerEnabled}
                onChange={(e) =>
                  onSettingsChange({ ...settings, clueTimerEnabled: e.target.checked })
                }
              />
              <svg
                aria-hidden="true"
                className={styles.timerIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="10" y1="2" x2="14" y2="2" />
                <line x1="12" y1="5" x2="12" y2="2" />
                <line x1="19" y1="6" x2="20.5" y2="4.5" />
                <circle cx="12" cy="14" r="8" />
                <line x1="12" y1="14" x2="12" y2="10" />
              </svg>
              <span className={styles.srOnly}>Timer pour les indices</span>
            </label>

            {settings.clueTimerEnabled && (
              <div className={styles.timerSliderRow}>
                <input
                  id="cluetimer-slider"
                  type="range"
                  className={styles.timerSlider}
                  min={CLUE_TIMER_MIN_SECONDS}
                  max={CLUE_TIMER_MAX_SECONDS}
                  step={5}
                  value={settings.clueTimerSeconds}
                  aria-label="Durée du timer"
                  onChange={(e) =>
                    onSettingsChange({ ...settings, clueTimerSeconds: Number(e.target.value) })
                  }
                />
                <span className={styles.timerValue}>{settings.clueTimerSeconds}s</span>
              </div>
            )}
          </div>

          <button onClick={onStart} className="btn btnBlock">
            Lancer la partie
          </button>
        </div>
      )}
    </div>
  );
}
