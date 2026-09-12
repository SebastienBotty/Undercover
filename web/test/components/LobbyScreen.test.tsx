import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LobbyScreen } from "@/components/LobbyScreen";

const players = [
  { id: "p1", name: "Alice", alive: true, connected: true },
  { id: "p2", name: "Bob", alive: true, connected: true },
  { id: "p3", name: "Carl", alive: true, connected: true },
  { id: "p4", name: "Dora", alive: true, connected: true },
  { id: "p5", name: "Eve", alive: true, connected: true },
];

const catalogResponse = {
  themes: [
    {
      id: "anime",
      label: "Anime",
      count: 45,
      series: [
        { id: "one-piece", label: "One Piece", count: 2 },
        { id: "naruto", label: "Naruto", count: 3 },
      ],
    },
    { id: "films", label: "Films", count: 12 },
    { id: "histoire", label: "Histoire", count: 10 },
  ],
};

const baseSettings = {
  themes: [],
  similarityLevel: "close" as const,
  mrWhiteEnabled: false,
  seriesFilter: {},
  clueTimerEnabled: true,
  clueTimerSeconds: 30,
  voteTimerEnabled: true,
  voteTimerSeconds: 60,
  cluePassesPerVote: 2,
  mode: "classic" as const,
  noteGapMin: 2,
  noteGapMax: 6,
  revealRoleOnElimination: true,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => catalogResponse })),
  );
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("LobbyScreen", () => {
  it("lists connected players", () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("prominently displays the room code so the host can share it", () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByText(/abcde/i)).toBeInTheDocument();
  });

  it("copies the room code to the clipboard when clicked, with brief confirmation feedback", async () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: /copier le code de la salle/i });
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCDE");
    await waitFor(() => expect(screen.getByText(/copié/i)).toBeInTheDocument());
  });

  it("hides the start button for non-hosts and shows a waiting message instead", () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /lancer la partie/i })).not.toBeInTheDocument();
    expect(screen.getByText(/en attente que l'hôte lance la partie/i)).toBeInTheDocument();
  });

  it("shows the settings to non-hosts but disables every control", async () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(await screen.findByLabelText(/^anime/i)).toBeDisabled();
    expect(screen.getByLabelText(/mr\. white/i)).toBeDisabled();
    expect(screen.getByRole("radio", { name: /classique/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /^note$/i })).toBeDisabled();
    expect(screen.getByLabelText(/^timer$/i)).toBeDisabled();
    expect(screen.getByLabelText(/révéler le rôle à l'élimination/i)).toBeDisabled();
    expect(screen.getByText(/seul l'hôte peut modifier les réglages/i)).toBeInTheDocument();
  });

  it("lets the host toggle whether roles are revealed on elimination", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    const checkbox = screen.getByLabelText(/révéler le rôle à l'élimination/i);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ revealRoleOnElimination: false }),
    );
  });

  it("shows each theme with its character count once the catalog loads", async () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(await screen.findByText("(45)")).toBeInTheDocument();
    expect(screen.getByLabelText(/^films/i)).toBeInTheDocument();
    expect(screen.getByText("(12)")).toBeInTheDocument();
  });

  it("disables Mr. White and shows a hint when there are fewer than 5 players", () => {
    const fewPlayers = players.slice(0, 3);
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={fewPlayers}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/mr\. white/i)).toBeDisabled();
    expect(screen.getByText(/nécessite 5 joueurs minimum/i)).toBeInTheDocument();
  });

  it("re-enables Mr. White once the room reaches 5 players", () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/mr\. white/i)).not.toBeDisabled();
    expect(screen.queryByText(/nécessite 5 joueurs minimum/i)).not.toBeInTheDocument();
  });

  it("automatically turns Mr. White off if the player count drops below the minimum", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players.slice(0, 2)}
        settings={{ ...baseSettings, mrWhiteEnabled: true }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ mrWhiteEnabled: false }),
    );
  });

  it("lets the host toggle a theme and Mr White, and calls onSettingsChange", async () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.click(await screen.findByLabelText(/^anime/i));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ themes: ["anime"] }));

    fireEvent.click(screen.getByLabelText(/mr\. white/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ mrWhiteEnabled: true }),
    );
  });

  it('lists the anime series behind a "Choisir les animes" expander, each with its own count', async () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(await screen.findByText(/choisir les animes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/one piece/i)).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByLabelText(/naruto/i)).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("lets non-host viewers still expand the read-only anime series panel", async () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={{ ...baseSettings, themes: ["anime"] }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    const toggle = await screen.findByText(/choisir les animes/i);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it('unchecking an anime series materializes the implicit "all series" into an explicit list', async () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    const naruto = await screen.findByLabelText(/naruto/i);
    // Default (seriesFilter: {}) means "all series" -- both checkboxes start checked.
    expect(naruto).toBeChecked();
    expect(screen.getByLabelText(/one piece/i)).toBeChecked();

    fireEvent.click(naruto);
    // Unchecking Naruto while everything was implicitly selected leaves only One Piece explicit.
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ seriesFilter: { anime: ["one-piece"] } }),
    );
  });

  it("hides the timer settings panel until the Timer checkbox is checked", () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByText(/temps d'indice/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/temps de vote/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^timer$/i));
    expect(screen.getByText(/temps d'indice/i)).toBeInTheDocument();
    expect(screen.getByText(/temps de vote/i)).toBeInTheDocument();
  });

  it("shows each timer's slider only while that timer is enabled", () => {
    const { rerender } = render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^timer$/i));
    expect(screen.getByLabelText(/durée du temps d'indice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/durée du temps de vote/i)).toBeInTheDocument();

    rerender(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={{ ...baseSettings, clueTimerEnabled: false, voteTimerEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/durée du temps d'indice/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/durée du temps de vote/i)).not.toBeInTheDocument();
  });

  it("lets the host toggle the clue timer off and change its duration", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^timer$/i));

    fireEvent.change(screen.getByLabelText(/durée du temps d'indice/i), { target: { value: "45" } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ clueTimerSeconds: 45 }),
    );

    fireEvent.click(screen.getByLabelText(/^temps d'indice$/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ clueTimerEnabled: false }),
    );
  });

  it("lets the host toggle the vote timer off and change its duration, independently of the clue timer", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^timer$/i));

    fireEvent.change(screen.getByLabelText(/durée du temps de vote/i), { target: { value: "90" } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ voteTimerSeconds: 90 }),
    );

    fireEvent.click(screen.getByLabelText(/^temps de vote$/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ voteTimerEnabled: false }),
    );
  });

  it("lets the host change how many clue passes happen before each vote", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/^timer$/i));

    fireEvent.change(screen.getByLabelText(/nombre de manches d'indices avant chaque vote/i), {
      target: { value: "3" },
    });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ cluePassesPerVote: 3 }),
    );
  });

  it("lets the host start the game", () => {
    const onStart = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={{ ...baseSettings, themes: ["anime"] }}
        onStart={onStart}
        onSettingsChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /lancer la partie/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows the mode selector, defaulting to the classic settings panel", async () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByRole("radio", { name: /classique/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^note$/i })).not.toBeChecked();
    expect(await screen.findByText(/thèmes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/note des civils/i)).not.toBeInTheDocument();
  });

  it("switches to the note settings panel", () => {
    const onSettingsChange = vi.fn();
    const { rerender } = render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^note$/i }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "note" }));

    rerender(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={{ ...baseSettings, mode: "note" }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    expect(screen.queryByText(/thèmes/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/note des civils/i)).not.toBeInTheDocument();
  });

  it("lets the host adjust the min/max note gap in note mode", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={{ ...baseSettings, mode: "note" }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/écart minimum entre les notes/i), { target: { value: "4" } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ noteGapMin: 4 }));

    fireEvent.change(screen.getByLabelText(/écart maximum entre les notes/i), { target: { value: "10" } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ noteGapMax: 10 }));
  });

  it("does not show the note gap sliders in classic mode", () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/écart minimum entre les notes/i)).not.toBeInTheDocument();
  });

  it("lets the host kick a player from the roster immediately, with no confirmation", () => {
    const onKickPlayer = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="self"
        onKickPlayer={onKickPlayer}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /exclure/i })[0]);
    expect(onKickPlayer).toHaveBeenCalledWith("p1");
  });

  it("gives non-hosts no kick button at all", () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        selfId="self"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /exclure/i })).not.toBeInTheDocument();
  });

  it("gives the host no kick button on their own row", () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        selfId="p1"
        onKickPlayer={() => {}}
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    // 5 players, host is p1 (Alice) -- only the other 4 get a kick button.
    expect(screen.getAllByRole("button", { name: /exclure/i })).toHaveLength(4);
  });
});
