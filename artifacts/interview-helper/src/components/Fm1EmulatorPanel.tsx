import { useEffect, useMemo, useState } from 'react';
import './Fm1EmulatorPanel.css';

const EMULATOR_ORIGIN = 'https://joakimeriksson.github.io/fm1-emu';

export type EmulatorMachine = 'fm1' | 'smk37';

export interface EmulatorFirmware {
  id: string;
  name: string;
  version?: string;
  author?: string;
  about?: string;
  repo?: string;
  untested?: boolean;
  byo?: boolean;
}

export interface EmulatorFirmwareCatalog {
  default: string;
  firmwares: EmulatorFirmware[];
}

const MACHINES: Record<EmulatorMachine, {
  name: string;
  subtitle: string;
  catalogUrl: string;
  playerPath: string;
}> = {
  fm1: {
    name: 'M-VAVE FM-1',
    subtitle: 'Pocket FM synthesizer',
    catalogUrl: `${EMULATOR_ORIGIN}/firmwares.json`,
    playerPath: './',
  },
  smk37: {
    name: 'M-VAVE SMK-37',
    subtitle: '37-key synth and controller',
    catalogUrl: `${EMULATOR_ORIGIN}/smk37/firmwares.json`,
    playerPath: 'smk37/',
  },
};

const MACHINE_IDS: EmulatorMachine[] = ['fm1', 'smk37'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFirmwareCatalog(value: unknown): EmulatorFirmwareCatalog {
  if (!isRecord(value) || !Array.isArray(value.firmwares) || typeof value.default !== 'string') {
    throw new Error('The emulator returned an invalid firmware catalog.');
  }

  const firmwares = value.firmwares.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      throw new Error(`Firmware catalog entry ${index + 1} is invalid.`);
    }
    return {
      id: entry.id,
      name: entry.name,
      version: typeof entry.version === 'string' ? entry.version : undefined,
      author: typeof entry.author === 'string' ? entry.author : undefined,
      about: typeof entry.about === 'string' ? entry.about : undefined,
      repo: typeof entry.repo === 'string' ? entry.repo : undefined,
      untested: entry.untested === true,
      byo: entry.byo === true,
    };
  }).filter((firmware) => !firmware.untested);

  if (firmwares.length === 0 || !firmwares.some((firmware) => firmware.id === value.default)) {
    throw new Error('The emulator catalog has no runnable default firmware.');
  }

  return { default: value.default, firmwares };
}

export function createEmulatorUrl(
  machine: EmulatorMachine,
  firmwareId: string,
  embedded = true,
): string {
  const config = MACHINES[machine];
  const url = new URL(config.playerPath, `${EMULATOR_ORIGIN}/`);
  if (firmwareId) url.searchParams.set('fw', firmwareId);
  if (embedded) url.searchParams.set('embed', '1');
  return url.toString();
}

function CatalogLoading({ machine }: { machine: EmulatorMachine }) {
  return (
    <div className="fm1-panel-state" role="status" data-testid="status-firmware-loading">
      Loading the {MACHINES[machine].name} firmware catalog…
    </div>
  );
}

export interface Fm1EmulatorPanelProps {
  initialMachine?: EmulatorMachine;
  onMachineChange?: (machine: EmulatorMachine) => void;
}

export default function Fm1EmulatorPanel({
  initialMachine = 'fm1',
  onMachineChange,
}: Fm1EmulatorPanelProps) {
  const [machine, setMachine] = useState<EmulatorMachine>(initialMachine);
  const [catalogs, setCatalogs] = useState<Partial<Record<EmulatorMachine, EmulatorFirmwareCatalog>>>({});
  const [catalogErrors, setCatalogErrors] = useState<Partial<Record<EmulatorMachine, string>>>({});
  const [firmwareIds, setFirmwareIds] = useState<Partial<Record<EmulatorMachine, string>>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMachine(initialMachine);
  }, [initialMachine]);

  useEffect(() => {
    let disposed = false;

    for (const machineId of MACHINE_IDS) {
      void fetch(MACHINES[machineId].catalogUrl, { headers: { Accept: 'application/json' } })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Catalog request failed (${response.status}).`);
          }
          return parseFirmwareCatalog(await response.json());
        })
        .then((catalog) => {
          if (disposed) return;
          setCatalogs((current) => ({ ...current, [machineId]: catalog }));
          setFirmwareIds((current) => ({
            ...current,
            [machineId]: current[machineId]
              && catalog.firmwares.some((firmware) => firmware.id === current[machineId])
              ? current[machineId]
              : catalog.default,
          }));
          setCatalogErrors((current) => ({ ...current, [machineId]: undefined }));
        })
        .catch((error: unknown) => {
          if (disposed) return;
          setCatalogErrors((current) => ({
            ...current,
            [machineId]: error instanceof Error ? error.message : 'Catalog request failed.',
          }));
        });
    }

    return () => {
      disposed = true;
    };
  }, []);

  const catalog = catalogs[machine];
  const firmwareId = firmwareIds[machine] ?? catalog?.default ?? '';
  const firmwareList = catalog?.firmwares ?? [];
  const selectedFirmware = firmwareList.find((firmware) => firmware.id === firmwareId);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleFirmwares = useMemo(
    () => firmwareList.filter((firmware) => (
      !normalizedSearch
      || [firmware.name, firmware.version, firmware.author, firmware.about]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    )),
    [firmwareList, normalizedSearch],
  );

  const playerUrl = selectedFirmware ? createEmulatorUrl(machine, selectedFirmware.id) : '';
  const fullPageUrl = selectedFirmware
    ? createEmulatorUrl(machine, selectedFirmware.id, false)
    : createEmulatorUrl(machine, '', false);

  return (
    <section className="fm1-emulator-panel" aria-label="FM-1 and SMK-37 emulator">
      <aside className="fm1-catalog">
        <div className="fm1-panel-heading">
          <span className="fm1-eyebrow">1999 HARDWARE BAY</span>
          <h2>FM-1 EMULATOR</h2>
          <p>Choose a real machine, then browse the firmware built for it.</p>
        </div>

        <div className="fm1-machine-options" role="group" aria-label="Choose a machine">
          {MACHINE_IDS.map((machineId) => (
            <button
              key={machineId}
              type="button"
              className={`fm1-machine-option${machine === machineId ? ' is-active' : ''}`}
              aria-pressed={machine === machineId}
              data-testid={`button-machine-${machineId}`}
              onClick={() => {
                setMachine(machineId);
                onMachineChange?.(machineId);
                setSearch('');
              }}
            >
              <strong>{MACHINES[machineId].name}</strong>
              <span>{MACHINES[machineId].subtitle}</span>
            </button>
          ))}
        </div>

        <label className="fm1-search-label" htmlFor="fm1-firmware-search">
          FIRMWARE LIBRARY
          <span>{catalog ? `${visibleFirmwares.length} / ${firmwareList.length}` : '—'}</span>
        </label>
        <input
          id="fm1-firmware-search"
          className="fm1-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, creator, or sound"
          aria-label="Search firmware"
          data-testid="input-firmware-search"
          disabled={!catalog}
        />

        {catalog ? (
          <select
            className="fm1-firmware-list"
            aria-label={`${MACHINES[machine].name} firmware`}
            size={9}
            value={visibleFirmwares.some((firmware) => firmware.id === firmwareId) ? firmwareId : ''}
            onChange={(event) => {
              if (event.target.value) {
                setFirmwareIds((current) => ({ ...current, [machine]: event.target.value }));
              }
            }}
            data-testid="select-firmware"
          >
            {visibleFirmwares.length === 0
              ? <option value="" disabled>No firmware matches this search</option>
              : visibleFirmwares.map((firmware) => (
                <option key={firmware.id} value={firmware.id}>
                  {firmware.name}{firmware.version ? ` · ${firmware.version}` : ''}
                </option>
              ))}
          </select>
        ) : catalogErrors[machine] ? (
          <div className="fm1-panel-state fm1-panel-error" role="alert" data-testid="status-firmware-error">
            Catalog unavailable: {catalogErrors[machine]}
          </div>
        ) : (
          <CatalogLoading machine={machine} />
        )}

        {selectedFirmware && (
          <div className="fm1-firmware-details" data-testid="text-firmware-details">
            <div className="fm1-firmware-byline">
              <strong>{selectedFirmware.name}</strong>
              {selectedFirmware.version && <span>{selectedFirmware.version}</span>}
            </div>
            {selectedFirmware.author && <div className="fm1-firmware-author">BY {selectedFirmware.author}</div>}
            {selectedFirmware.about && <p>{selectedFirmware.about}</p>}
            {selectedFirmware.byo && (
              <p className="fm1-firmware-note">
                This stock firmware needs your own .fwsc file; the emulator explains how to open it.
              </p>
            )}
            {selectedFirmware.repo && (
              <a href={selectedFirmware.repo} target="_blank" rel="noopener noreferrer">
                FIRMWARE SOURCE ↗
              </a>
            )}
          </div>
        )}

        <p className="fm1-attribution">
          Emulator by <a href="https://github.com/joakimeriksson/fm1-emu" target="_blank" rel="noopener noreferrer">
            joakimeriksson
          </a>. Firmware packages are loaded by the emulator from their authors; 1999 does not host them.
        </p>
      </aside>

      <div className="fm1-player-column">
        {playerUrl ? (
          <iframe
            key={`${machine}:${firmwareId}`}
            className="fm1-player"
            title={`${MACHINES[machine].name} running ${selectedFirmware?.name ?? 'selected firmware'}`}
            src={playerUrl}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            allow="autoplay; midi"
            data-testid="iframe-fm1-emulator"
          />
        ) : (
          <div className="fm1-player-placeholder" role="status">
            Select a machine and firmware to open its emulator.
          </div>
        )}
        <div className="fm1-player-footer">
          <span>Press START inside the emulator to boot the selected firmware.</span>
          <a href={fullPageUrl} target="_blank" rel="noopener noreferrer">
            OPEN FULL EMULATOR ↗
          </a>
        </div>
      </div>
    </section>
  );
}
