import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LobbyScreen } from "@/components/LobbyScreen";

const players = [
  { id: "p1", name: "Alice", alive: true, connected: true },
  { id: "p2", name: "Bob", alive: true, connected: true },
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
  animeSeries: [],
  clueTimerEnabled: true,
  clueTimerSeconds: 60,
  mode: "classic" as const,
  civilNote: 14,
  undercoverNote: 10,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => catalogResponse })),
  );
});

describe("LobbyScreen", () => {
  it("lists connected players", () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
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
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByText(/abcde/i)).toBeInTheDocument();
  });

  it("hides the settings form and start button for non-hosts", () => {
    render(
      <LobbyScreen
        isHost={false}
        code="ABCDE"
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /lancer la partie/i })).not.toBeInTheDocument();
  });

  it("shows each theme with its character count once the catalog loads", async () => {
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
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

  it("lets the host toggle a theme and Mr White, and calls onSettingsChange", async () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
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

  it('unchecking an anime series materializes the implicit "all series" into an explicit list', async () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    const naruto = await screen.findByLabelText(/naruto/i);
    // Default (animeSeries: []) means "all series" -- both checkboxes start checked.
    expect(naruto).toBeChecked();
    expect(screen.getByLabelText(/one piece/i)).toBeChecked();

    fireEvent.click(naruto);
    // Unchecking Naruto while everything was implicitly selected leaves only One Piece explicit.
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ animeSeries: ["one-piece"] }),
    );
  });

  it("shows the timer slider when the clue timer is enabled and hides it when disabled", () => {
    const { rerender } = render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/durée du timer/i)).toBeInTheDocument();

    rerender(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ ...baseSettings, clueTimerEnabled: false }}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/durée du timer/i)).not.toBeInTheDocument();
  });

  it("lets the host toggle the clue timer off and change its duration", () => {
    const onSettingsChange = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText(/durée du timer/i), { target: { value: "30" } });
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ clueTimerSeconds: 30 }),
    );

    fireEvent.click(screen.getByLabelText(/timer pour les indices/i));
    expect(onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ clueTimerEnabled: false }),
    );
  });

  it("lets the host start the game", () => {
    const onStart = vi.fn();
    render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
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
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/mode de jeu/i)).toHaveValue("classic");
    expect(await screen.findByText(/thèmes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/note des civils/i)).not.toBeInTheDocument();
  });

  it("switches to the note settings panel and lets the host set both notes", () => {
    const onSettingsChange = vi.fn();
    const { rerender } = render(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={baseSettings}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/mode de jeu/i), { target: { value: "note" } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "note" }));

    rerender(
      <LobbyScreen
        isHost={true}
        code="ABCDE"
        players={players}
        settings={{ ...baseSettings, mode: "note" }}
        onStart={() => {}}
        onSettingsChange={onSettingsChange}
      />,
    );
    expect(screen.queryByText(/thèmes/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/note des civils/i), { target: { value: "16" } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ civilNote: 16 }));

    fireEvent.change(screen.getByLabelText(/note des undercover/i), { target: { value: "9" } });
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ undercoverNote: 9 }));
  });
});
