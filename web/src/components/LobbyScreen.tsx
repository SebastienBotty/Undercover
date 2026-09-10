"use client";
import { useEffect, useState } from "react";
import {
  CLUE_TIMER_MIN_SECONDS,
  CLUE_TIMER_MAX_SECONDS,
  VOTE_TIMER_MIN_SECONDS,
  VOTE_TIMER_MAX_SECONDS,
  type RoomSettings,
  type SimilarityLevel,
  type GameMode,
} from "@/lib/hostSettings";
import { useThemeCatalog } from "@/lib/useThemeCatalog";
import { copyToClipboard } from "@/lib/clipboard";
import styles from "./LobbyScreen.module.css";

// Keep in sync with server/src/GameRoom.ts's MR_WHITE_MIN_PLAYERS.
const MR_WHITE_MIN_PLAYERS = 5;

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
  // Purely local UI state -- revealing the per-timer controls isn't itself a game setting.
  const [showTimers, setShowTimers] = useState(false);
  // Which themes' "choose the series" panel is expanded -- keyed by theme id so each theme
  // toggles independently, same as native <details> would.
  const [openSeries, setOpenSeries] = useState<Record<string, boolean>>({});
  const [codeCopied, setCodeCopied] = useState(false);
  const mrWhiteAllowed = players.length >= MR_WHITE_MIN_PLAYERS;

  async function handleCopyCode() {
    const ok = await copyToClipboard(code);
    if (!ok) return;
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  // If a player leaves and drops the room below the Mr. White threshold, turn it back off
  // instead of leaving a checked-but-disabled control the host can no longer act on.
  useEffect(() => {
    if (isHost && settings.mrWhiteEnabled && !mrWhiteAllowed) {
      onSettingsChange({ ...settings, mrWhiteEnabled: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-check when the gating conditions change
  }, [isHost, mrWhiteAllowed, settings.mrWhiteEnabled]);

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

  const themesControl = (
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
            <div className={styles.seriesDetails}>
              {/* A plain div (not a <button>) on purpose: it sits inside the settings
                  <fieldset disabled={!isHost}>, and unlike form controls, a div isn't
                  auto-disabled by an ancestor fieldset -- non-host viewers can still expand
                  this read-only list, same as the native <details> it replaced could. */}
              <div
                role="button"
                tabIndex={0}
                className={`${styles.seriesSummary}${!settings.themes.includes(theme.id) ? ` ${styles.seriesSummaryDisabled}` : ""}`}
                aria-disabled={!settings.themes.includes(theme.id)}
                aria-expanded={!!openSeries[theme.id]}
                onClick={() => {
                  if (!settings.themes.includes(theme.id)) return;
                  setOpenSeries((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }));
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  if (!settings.themes.includes(theme.id)) return;
                  setOpenSeries((prev) => ({ ...prev, [theme.id]: !prev[theme.id] }));
                }}
              >
                <span
                  aria-hidden="true"
                  className={`${styles.seriesArrow}${openSeries[theme.id] ? ` ${styles.seriesArrowOpen}` : ""}`}
                >
                  ▸
                </span>
                Choisir les {theme.label.toLowerCase()}s
              </div>
              <div
                className={`${styles.seriesList}${openSeries[theme.id] ? ` ${styles.seriesListOpen}` : ""}`}
              >
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
            </div>
          )}
        </div>
      ))}
    </fieldset>
  );

  const mrWhiteControl = (
    <label htmlFor="mrwhite-checkbox" className="checkboxRow">
      <input
        id="mrwhite-checkbox"
        type="checkbox"
        checked={settings.mrWhiteEnabled}
        disabled={!mrWhiteAllowed}
        onChange={(e) => onSettingsChange({ ...settings, mrWhiteEnabled: e.target.checked })}
      />
      Mr. White
      {!mrWhiteAllowed && (
        <span className={`muted ${styles.mrWhiteHint}`}>
          (nécessite {MR_WHITE_MIN_PLAYERS} joueurs minimum)
        </span>
      )}
    </label>
  );

  const revealRoleControl = (
    <label htmlFor="reveal-elimination-checkbox" className="checkboxRow">
      <input
        id="reveal-elimination-checkbox"
        type="checkbox"
        checked={settings.revealRoleOnElimination}
        onChange={(e) => onSettingsChange({ ...settings, revealRoleOnElimination: e.target.checked })}
      />
      Révéler le rôle à l&apos;élimination
    </label>
  );

  const timerControl = (
    <div className="field">
      <label htmlFor="timers-toggle" className="checkboxRow">
        <input
          id="timers-toggle"
          type="checkbox"
          checked={showTimers}
          onChange={(e) => setShowTimers(e.target.checked)}
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
        Timer
      </label>

      {showTimers && (
        <div className={styles.timersPanel}>
          <div className={styles.timerRow}>
            <label htmlFor="cluetimer-checkbox" className="checkboxRow">
              <input
                id="cluetimer-checkbox"
                type="checkbox"
                checked={settings.clueTimerEnabled}
                onChange={(e) =>
                  onSettingsChange({ ...settings, clueTimerEnabled: e.target.checked })
                }
              />
              Temps d&apos;indice
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
                  aria-label="Durée du temps d'indice"
                  onChange={(e) =>
                    onSettingsChange({ ...settings, clueTimerSeconds: Number(e.target.value) })
                  }
                />
                <span className={styles.timerValue}>{settings.clueTimerSeconds}s</span>
              </div>
            )}
          </div>

          <div className={styles.timerRow}>
            <label htmlFor="votetimer-checkbox" className="checkboxRow">
              <input
                id="votetimer-checkbox"
                type="checkbox"
                checked={settings.voteTimerEnabled}
                onChange={(e) =>
                  onSettingsChange({ ...settings, voteTimerEnabled: e.target.checked })
                }
              />
              Temps de vote
            </label>
            {settings.voteTimerEnabled && (
              <div className={styles.timerSliderRow}>
                <input
                  id="votetimer-slider"
                  type="range"
                  className={styles.timerSlider}
                  min={VOTE_TIMER_MIN_SECONDS}
                  max={VOTE_TIMER_MAX_SECONDS}
                  step={15}
                  value={settings.voteTimerSeconds}
                  aria-label="Durée du temps de vote"
                  onChange={(e) =>
                    onSettingsChange({ ...settings, voteTimerSeconds: Number(e.target.value) })
                  }
                />
                <span className={styles.timerValue}>{settings.voteTimerSeconds}s</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <span className="eyebrow">Salle</span>
      <button type="button" className={`roomCode ${styles.roomCodeButton}`} onClick={handleCopyCode} aria-label="Copier le code de la salle">
        {codeCopied ? 'Copié !' : code}
      </button>

      <div className={styles.columns}>
        <div className={styles.playersColumn}>
          <h3>Joueurs</h3>
          <ul className="roster">
            {players.map((p) => (
              <li key={p.id} className={`rosterItem${!p.connected ? " rosterItemDim" : ""}`}>
                <span>{p.name}</span>
                {!p.connected && <span className="stamp">Déconnecté</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.settingsColumn}>
          <h3>Réglages</h3>
          <fieldset className={styles.settingsFieldset} disabled={!isHost}>
            {!isHost && <p className={`muted ${styles.viewOnlyNote}`}>Seul l&apos;hôte peut modifier les réglages.</p>}

            <div className={styles.modeToggle} role="radiogroup" aria-label="Mode de jeu">
              <button
                type="button"
                role="radio"
                aria-checked={settings.mode === "classic"}
                className={`${styles.modeOption}${settings.mode === "classic" ? ` ${styles.modeOptionActive}` : ""}`}
                onClick={() => onSettingsChange({ ...settings, mode: "classic" as GameMode })}
              >
                Classique
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={settings.mode === "note"}
                className={`${styles.modeOption}${settings.mode === "note" ? ` ${styles.modeOptionActive}` : ""}`}
                onClick={() => onSettingsChange({ ...settings, mode: "note" as GameMode })}
              >
                Note
              </button>
            </div>

            {settings.mode === "note" ? (
              <>
                <p className="muted">Les notes des Civils et des Undercover sont attribuées au hasard entre 0 et 20.</p>
                {revealRoleControl}
                {timerControl}
                {mrWhiteControl}
              </>
            ) : (
              <div className={styles.classicGrid}>
                <div className={styles.settingsCol}>
                  {themesControl}
                </div>
                <div className={styles.settingsCol}>
                  {revealRoleControl}
                  {timerControl}
                </div>
                <div className={styles.settingsCol}>
                  {mrWhiteControl}
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
                </div>
              </div>
            )}
          </fieldset>

          {isHost ? (
            <button onClick={onStart} className="btn btnBlock">
              Lancer la partie
            </button>
          ) : (
            <p className="muted">En attente que l&apos;hôte lance la partie...</p>
          )}
        </div>
      </div>
    </div>
  );
}
