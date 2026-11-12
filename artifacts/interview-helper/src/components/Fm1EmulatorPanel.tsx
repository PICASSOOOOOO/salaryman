import { useEffect, useMemo, useState } from 'react';
import './Fm1EmulatorPanel.css';

const EMULATOR_ORIGIN = 'https://joakimeriksson.github.io/fm1-emu';

export type EmulatorMachine = 'fm1' | 'smk37';

export interface EmulatorPatchSave {
  objectPath: string;
  filename: string;
  sizeBytes: number;
}

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
  catalogUrl: string;
  playerPath: string;
}> = {
  fm1: {
    name: 'M-VAVE FM-1',
    catalogUrl: `${EMULATOR_ORIGIN}/firmwares.json`,
    playerPath: './',
  },
  smk37: {
    name: 'M-VAVE SMK-37',
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
    throw new Error('The firmware list is invalid.');
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
    throw new Error('No runnable firmware is available.');
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
      Loading {MACHINES[machine].name} firmware…
    </div>
  );
}

export interface Fm1EmulatorPanelProps {
  initialMachine?: EmulatorMachine;
  initialFirmwareId?: string;
  patchSaves?: Partial<Record<EmulatorMachine, EmulatorPatchSave>>;
  onFirmwareChange?: (machine: EmulatorMachine, firmwareId: string) => void;
  onSavePatchFile?: (machine: EmulatorMachine, file: File) => Promise<void>;
  onDownloadPatchFile?: (machine: EmulatorMachine) => Promise<void>;
}

export default function Fm1EmulatorPanel({
  initialMachine = 'fm1',
  initialFirmwareId = '',
  patchSaves = {},
  onFirmwareChange,
  onSavePatchFile,
  onDownloadPatchFile,
}: Fm1EmulatorPanelProps) {
  const [machine, setMachine] = useState<EmulatorMachine>(initialMachine);
  const [catalogs, setCatalogs] = useState<Partial<Record<EmulatorMachine, EmulatorFirmwareCatalog>>>({});
  const [catalogErrors, setCatalogErrors] = useState<Partial<Record<EmulatorMachine, string>>>({});
  const [firmwareIds, setFirmwareIds] = useState<Partial<Record<EmulatorMachine, string>>>({});
  const [search, setSearch] = useState('');
  const [patchBusy, setPatchBusy] = useState(false);
  const [patchMessage, setPatchMessage] = useState('');

  useEffect(() => {
    setMachine(initialMachine);
    if (initialFirmwareId) {
      setFirmwareIds((current) => ({ ...current, [initialMachine]: initialFirmwareId }));
    }
  }, [initialMachine, initialFirmwareId]);

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
          const preferredFirmware = machineId === initialMachine ? initialFirmwareId : '';
          const selectedFirmware = preferredFirmware
            && catalog.firmwares.some((firmware) => firmware.id === preferredFirmware)
            ? preferredFirmware
            : catalog.default;
          setCatalogs((current) => ({ ...current, [machineId]: catalog }));
          setFirmwareIds((current) => ({
            ...current,
            [machineId]: current[machineId]
              && catalog.firmwares.some((firmware) => firmware.id === current[machineId])
              ? current[machineId]
              : selectedFirmware,
          }));
          onFirmwareChange?.(machineId, selectedFirmware);
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
  const savedPatch = patchSaves[machine];
  const attachPatchFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.fm1save') || file.size < 1 || file.size > 16 * 1024 * 1024) {
      setPatchMessage('Choose a valid .fm1save file under 16 MB.');
      return;
    }
    if (file.name.length > 120 || /[\u0000-\u001f]/.test(file.name)) {
      setPatchMessage('This filename is too long or contains unsupported characters.');
      return;
    }
    if (savedPatch && !window.confirm(`Replace the saved ${MACHINES[machine].name} patch for this project?`)) return;
    setPatchBusy(true);
    setPatchMessage('Uploading patch backup…');
    try {
      await onSavePatchFile?.(machine, file);
      setPatchMessage('Patch backup saved with this project.');
    } catch (error) {
      setPatchMessage(error instanceof Error ? error.message : 'Patch backup could not be saved.');
    } finally {
      setPatchBusy(false);
    }
  };
  const downloadPatchFile = async () => {
    if (!savedPatch || !onDownloadPatchFile) return;
    setPatchBusy(true);
    setPatchMessage('Preparing patch download…');
    try {
      await onDownloadPatchFile(machine);
      setPatchMessage('Patch backup downloaded. Import it on the machine.');
    } catch (error) {
      setPatchMessage(error instanceof Error ? error.message : 'Patch backup could not be downloaded.');
    } finally {
      setPatchBusy(false);
    }
  };

  return (
    <section className="fm1-emulator-panel" aria-label="FM-1 and SMK-37 instruments" data-machine={machine}>
      <aside className="fm1-catalog">
        <div className="fm1-panel-heading">
          <h2>{MACHINES[machine].name}</h2>
        </div>

        <details className="fm1-firmware-browser">
          <summary data-testid="summary-firmware">
            <span>FIRMWARE</span>
            <span>{catalog ? `${visibleFirmwares.length} / ${firmwareList.length}` : '…'}</span>
          </summary>
          <label className="fm1-search-label" htmlFor="fm1-firmware-search">SEARCH</label>
          <input
            id="fm1-firmware-search"
            className="fm1-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search firmware"
            aria-label="Search firmware"
            data-testid="input-firmware-search"
            disabled={!catalog}
          />
          {catalog ? (
            <select
              className="fm1-firmware-list"
              aria-label={`${MACHINES[machine].name} firmware`}
              size={5}
              value={visibleFirmwares.some((firmware) => firmware.id === firmwareId) ? firmwareId : ''}
              onChange={(event) => {
                if (event.target.value) {
                  setFirmwareIds((current) => ({ ...current, [machine]: event.target.value }));
                  onFirmwareChange?.(machine, event.target.value);
                }
              }}
              data-testid="select-firmware"
            >
              {visibleFirmwares.length === 0
                ? <option value="" disabled>No results</option>
                : visibleFirmwares.map((firmware) => (
                  <option key={firmware.id} value={firmware.id}>
                    {firmware.name}{firmware.version ? ` · ${firmware.version}` : ''}
                  </option>
                ))}
            </select>
          ) : catalogErrors[machine] ? (
            <div className="fm1-panel-state fm1-panel-error" role="alert" data-testid="status-firmware-error">
              {catalogErrors[machine]}
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
              {selectedFirmware.byo && <span className="fm1-firmware-note">BYO .FWSC</span>}
              {selectedFirmware.repo && (
                <a href={selectedFirmware.repo} target="_blank" rel="noopener noreferrer">SOURCE ↗</a>
              )}
            </div>
          )}
        </details>

        <details className="fm1-patch-details" data-testid="section-patch-save">
          <summary>
            <span>PATCH SAVE</span>
            <span>{savedPatch ? 'SAVED' : 'NONE'}</span>
          </summary>
          {savedPatch && (
            <p className="fm1-save-file-name">
              {savedPatch.filename} · {(savedPatch.sizeBytes / 1024).toFixed(0)} KB
            </p>
          )}
          <div className="fm1-save-actions">
            <label className="fm1-save-file-input">
              <span>{savedPatch ? 'REPLACE .FM1SAVE' : 'ATTACH .FM1SAVE'}</span>
              <input
                type="file"
                accept=".fm1save,application/json"
                aria-label={`Attach a ${MACHINES[machine].name} patch save`}
                disabled={patchBusy || !onSavePatchFile}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  void attachPatchFile(file);
                }}
              />
            </label>
            <button
              type="button"
              className="fm1-save-download"
              disabled={!savedPatch || patchBusy || !onDownloadPatchFile}
              onClick={() => void downloadPatchFile()}
            >
              DOWNLOAD
            </button>
          </div>
          {patchMessage && <p className="fm1-save-status" role="status" aria-live="polite">{patchMessage}</p>}
        </details>

        <p className="fm1-attribution">
          <a href="https://github.com/joakimeriksson/fm1-emu" target="_blank" rel="noopener noreferrer">
            SOURCE / LICENSE ↗
          </a>
        </p>
      </aside>

      <div className="fm1-player-column">
        {playerUrl ? (
          <iframe
            key={`${machine}:${firmwareId}`}
            className="fm1-player"
            title={`${MACHINES[machine].name} · ${selectedFirmware?.name ?? 'firmware'}`}
            src={playerUrl}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
            allow="autoplay; midi"
            data-testid="iframe-fm1-emulator"
          />
        ) : (
          <div className="fm1-player-placeholder" role="status">
            SELECT FIRMWARE
          </div>
        )}
        <div className="fm1-player-footer">
          <a href={fullPageUrl} target="_blank" rel="noopener noreferrer">
            OPEN IN NEW TAB ↗
          </a>
        </div>
      </div>
    </section>
  );
}
