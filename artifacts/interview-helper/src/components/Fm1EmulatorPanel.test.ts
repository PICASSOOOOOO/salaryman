// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import Fm1EmulatorPanel, { createEmulatorUrl, parseFirmwareCatalog } from './Fm1EmulatorPanel';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const catalog = url.includes('/smk37/')
      ? {
        default: 'snoop37',
        firmwares: [
          { id: 'snoop37', name: 'Snoop37', version: '2.6.5' },
          { id: 'polly', name: 'Polly', version: '1.0' },
        ],
      }
      : {
        default: 'felucca',
        firmwares: [
          { id: 'felucca', name: 'Felucca', version: '1.8.2' },
          { id: 'mvave', name: 'M-VAVE stock firmware', byo: true },
        ],
      };
    return { ok: true, json: async () => catalog };
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('FM-1 emulator catalog', () => {
  it('keeps runnable firmware and excludes entries the upstream emulator marks untested', () => {
    const catalog = parseFirmwareCatalog({
      default: 'felucca',
      firmwares: [
        { id: 'felucca', name: 'Felucca', version: '1.8.2' },
        { id: 'new-port', name: 'New port', untested: true },
      ],
    });

    expect(catalog.default).toBe('felucca');
    expect(catalog.firmwares.map((firmware) => firmware.id)).toEqual(['felucca']);
  });

  it('rejects a catalog whose default is not runnable', () => {
    expect(() => parseFirmwareCatalog({
      default: 'missing',
      firmwares: [{ id: 'only-one', name: 'Only one' }],
    })).toThrow('no runnable default firmware');
  });

  it('builds the FM-1 and SMK-37 player paths with the selected firmware', () => {
    expect(createEmulatorUrl('fm1', 'felucca')).toBe(
      'https://joakimeriksson.github.io/fm1-emu/?fw=felucca&embed=1',
    );
    expect(createEmulatorUrl('smk37', 'snoop37')).toBe(
      'https://joakimeriksson.github.io/fm1-emu/smk37/?fw=snoop37&embed=1',
    );
  });

  it('switches machine catalogs and launches the selected firmware inside 1999', async () => {
    await act(async () => root.render(createElement(Fm1EmulatorPanel)));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const fm1Frame = container.querySelector<HTMLIFrameElement>('[data-testid="iframe-fm1-emulator"]');
    expect(fm1Frame?.getAttribute('src')).toBe(
      'https://joakimeriksson.github.io/fm1-emu/?fw=felucca&embed=1',
    );
    expect(container.querySelector('.fm1-emulator-panel')?.getAttribute('data-machine')).toBe('fm1');
    expect(container.querySelector('.fm1-panel-heading h2')?.textContent).toBe('M-VAVE FM-1 EMULATOR');
    expect(container.querySelectorAll('[data-testid="select-firmware"] option')).toHaveLength(2);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-machine-smk37"]')!.click();
    });
    expect(container.querySelector('.fm1-emulator-panel')?.getAttribute('data-machine')).toBe('smk37');
    expect(container.querySelector('.fm1-panel-heading h2')?.textContent).toBe('M-VAVE SMK-37 EMULATOR');
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="iframe-fm1-emulator"]')?.getAttribute('src'))
      .toBe('https://joakimeriksson.github.io/fm1-emu/smk37/?fw=snoop37&embed=1');

    await act(async () => {
      const firmwareSelect = container.querySelector<HTMLSelectElement>('[data-testid="select-firmware"]')!;
      firmwareSelect.value = 'polly';
      firmwareSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector<HTMLIFrameElement>('[data-testid="iframe-fm1-emulator"]')?.getAttribute('src'))
      .toBe('https://joakimeriksson.github.io/fm1-emu/smk37/?fw=polly&embed=1');
  });

  it('opens the emulator on the machine selected by the production lane', async () => {
    await act(async () => root.render(createElement(Fm1EmulatorPanel, { initialMachine: 'smk37' })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.querySelector<HTMLIFrameElement>('[data-testid="iframe-fm1-emulator"]')?.getAttribute('src'))
      .toBe('https://joakimeriksson.github.io/fm1-emu/smk37/?fw=snoop37&embed=1');
  });
});
