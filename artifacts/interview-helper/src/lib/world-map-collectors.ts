export interface BOCollectorPin { x: number; y: number; }

export interface BOCollectorData {
  collectors: BOCollectorPin[];
  wantedLevel: number;
  bountyAmount: number;
  boWaveCount: number;
}

const EMPTY: BOCollectorData = { collectors: [], wantedLevel: 0, bountyAmount: 0, boWaveCount: 0 };

/**
 * Read BO collector positions for the world map.
 *
 * Prefers sm_live (written ~every 1s by the game loop) so the map reflects
 * real-time positions. Falls back to sm_save (written every 30s) when the game
 * is not running — either because the tab is closed or the game loop cleared
 * sm_live on teardown. An sm_live entry older than 5 minutes is also treated as
 * stale and ignored.
 */
export function readBoCollectorsFromSave(): BOCollectorData {
  try {
    const liveRaw = localStorage.getItem('sm_live');
    if (liveRaw) {
      const live = JSON.parse(liveRaw);
      const age = typeof live.writtenAt === 'number' ? Date.now() - live.writtenAt : Infinity;
      if (age < 5 * 60 * 1000) {
        const collectors = (Array.isArray(live.boCollectors) ? live.boCollectors : []) as BOCollectorPin[];
        const wantedLevel = (live.wantedLevel ?? 0) as number;
        return { collectors, wantedLevel, bountyAmount: 0, boWaveCount: 0 };
      }
    }
    const raw = localStorage.getItem('sm_save');
    if (!raw) return EMPTY;
    const save = JSON.parse(raw);
    const wantedLevel = (save.wantedLevel ?? 0) as number;
    const bountyAmount = (save.bountyAmount ?? 0) as number;
    const boWaveCount = (save.boWaveCount ?? 0) as number;
    const collectors = (Array.isArray(save.boCollectors) ? save.boCollectors : []) as BOCollectorPin[];
    return { collectors, wantedLevel, bountyAmount, boWaveCount };
  } catch {
    return EMPTY;
  }
}
