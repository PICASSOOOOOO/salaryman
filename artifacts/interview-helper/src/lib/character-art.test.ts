import { describe, expect, it } from "vitest";
import { characterArtKey } from "./character-art";

describe("named character art keys", () => {
  it("normalizes names into stable kind-specific keys", () => {
    expect(characterArtKey("tower_character", "Míla Vance")).toBe("tower_character_mila_vance");
    expect(characterArtKey("player_avatar", "Operator #7")).toBe("player_avatar_operator_7");
    expect(characterArtKey("pixel_agent", "Claw-Bot")).toBe("pixel_agent_claw_bot");
  });

  it("uses an explicit safe key for missing identities", () => {
    expect(characterArtKey("tower_character", "  !!! ")).toBe("tower_character_unnamed");
  });
});
