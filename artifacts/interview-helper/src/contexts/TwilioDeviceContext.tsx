import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { registerDeviceDisconnect } from '@/lib/twilio-device-bridge';
import { setPhoneBusy } from '@/lib/phone-busy';

export type DeviceState = 'uninitialized' | 'initializing' | 'ready' | 'error';

interface TwilioDeviceContextValue {
  deviceState: DeviceState;
  deviceError: string | null;
  connectToConference: (conferenceName: string) => Promise<Call | null>;
  disconnect: () => void;
  /**
   * Force a fresh init right now, bypassing the auto-retry backoff.
   * Used by the OFFLINE/ERROR badge "Reconnect" button so the user can
   * always recover from a stuck device without reloading the page.
   */
  reconnect: () => Promise<void>;
}

const TwilioDeviceContext = createContext<TwilioDeviceContextValue | null>(null);

export function useTwilioDeviceContext(): TwilioDeviceContextValue {
  const ctx = useContext(TwilioDeviceContext);
  if (!ctx) throw new Error('useTwilioDeviceContext must be inside TwilioDeviceProvider');
  return ctx;
}

export function TwilioDeviceProvider({ children }: { children: ReactNode }) {
  const BASE = import.meta.env.BASE_URL;
  const deviceRef = useRef<Device | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState>('uninitialized');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const unmountedRef = useRef<boolean>(false);

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const TOKEN_REFRESH_MS = 50 * 60 * 1000;

  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      if (!deviceRef.current) return;
      try {
        const r = await fetch(apiUrl('twilio/token'), { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        deviceRef.current.updateToken(data.token);
        console.log('[TwilioDevice] token refreshed');
        scheduleTokenRefresh();
      } catch (err) {
        console.warn('[TwilioDevice] token refresh failed:', err instanceof Error ? err.message : 'Unknown');
      }
    }, TOKEN_REFRESH_MS);
  }, [apiUrl]);

  const initDevice = useCallback(async () => {
    if (deviceRef.current && deviceState === 'ready') return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    const promise = (async () => {
      setDeviceState('initializing');
      setDeviceError(null);
      try {
        console.log('[TwilioDevice] fetching token...');
        const r = await fetch(apiUrl('twilio/token'), { credentials: 'include' });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error || `Failed to get token (${r.status})`);
        }
        const data = await r.json();
        console.log('[TwilioDevice] token received, identity:', data.identity);

        if (deviceRef.current) {
          try { deviceRef.current.destroy(); } catch { }
          deviceRef.current = null;
        }

        const device = new Device(data.token, {
          logLevel: 1,
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        });

        device.on('error', (err: Error) => {
          console.error('[TwilioDevice] error:', err.message);
          setDeviceError(err.message);
          setDeviceState('error');
        });

        device.on('registered', () => {
          console.log('[TwilioDevice] registered and ready');
          setDeviceState('ready');
          setDeviceError(null);
        });

        device.on('unregistered', () => {
          setDeviceState('uninitialized');
        });

        // Phone takes precedence over the media player. As soon as a call
        // starts ringing in (or we accept/place one), tell the global
        // phone-busy bus so the music player pauses.
        device.on('incoming', (call: Call) => {
          setPhoneBusy('twilio-incoming', true);
          const clear = () => setPhoneBusy('twilio-incoming', false);
          call.on('accept', () => setPhoneBusy('twilio-incoming', true));
          call.on('disconnect', clear);
          call.on('cancel', clear);
          call.on('reject', clear);
          call.on('error', clear);
        });

        device.on('tokenWillExpire', async () => {
          try {
            const tr = await fetch(apiUrl('twilio/token'), { credentials: 'include' });
            if (tr.ok) {
              const td = await tr.json();
              device.updateToken(td.token);
              console.log('[TwilioDevice] token refreshed via tokenWillExpire');
            }
          } catch {}
        });

        await device.register();
        // Bail out cleanly if we unmounted while register() was in flight —
        // otherwise we'd leave an orphaned Device + token-refresh timer
        // alive after the provider tore down.
        if (unmountedRef.current) {
          try { device.destroy(); } catch {}
          return;
        }
        deviceRef.current = device;
        setDeviceState('ready');
        scheduleTokenRefresh();
        // Successful register → reset the auto-retry backoff so the next
        // failure starts the cycle from 3s again instead of 60s.
        retryAttemptRef.current = 0;
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        console.log('[TwilioDevice] device registered successfully');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize Twilio device';
        console.error('[TwilioDevice] init failed:', msg);
        setDeviceError(msg);
        setDeviceState('error');
        // Auto-retry with exponential backoff (3s, 6s, 12s, 24s, capped at
        // 60s). The phone must "absolutely work" for prime users — a single
        // transient token failure should self-heal without the user having
        // to refresh.
        if (!unmountedRef.current) {
          const attempt = retryAttemptRef.current + 1;
          retryAttemptRef.current = attempt;
          const delay = Math.min(60_000, 3_000 * Math.pow(2, Math.min(attempt - 1, 4)));
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (!unmountedRef.current) {
              console.log(`[TwilioDevice] auto-retry attempt ${attempt}`);
              initDevice();
            }
          }, delay);
        }
      }
    })();

    initPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      initPromiseRef.current = null;
    }
  }, [apiUrl, scheduleTokenRefresh, deviceState]);

  useEffect(() => {
    unmountedRef.current = false;
    initDevice();
    return () => {
      unmountedRef.current = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { }
        deviceRef.current = null;
      }
    };
  }, []);

  // Manual reconnect: cancel any pending backoff and try right now.
  const reconnect = useCallback(async () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    retryAttemptRef.current = 0;
    if (deviceRef.current) {
      try { deviceRef.current.destroy(); } catch {}
      deviceRef.current = null;
    }
    setDeviceState('uninitialized');
    setDeviceError(null);
    await initDevice();
  }, [initDevice]);

  const connectToConference = useCallback(async (conferenceName: string): Promise<Call | null> => {
    if (!deviceRef.current || deviceState !== 'ready') {
      console.log('[TwilioDevice] device not ready, re-initializing before connect...');
      await initDevice();
    }
    if (!deviceRef.current) {
      console.error('[TwilioDevice] No device available after init attempt');
      setDeviceError('Phone device failed to initialize. Check microphone permissions and try refreshing.');
      return null;
    }
    try {
      console.log('[TwilioDevice] connecting to conference:', conferenceName);
      const call = await deviceRef.current.connect({
        params: { To: conferenceName },
      });
      console.log('[TwilioDevice] connected to conference successfully');
      return call;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to conference';
      console.error('[TwilioDevice] connect error:', msg);
      setDeviceError(msg);
      return null;
    }
  }, [initDevice, deviceState]);

  const disconnect = useCallback(() => {
    if (deviceRef.current) {
      try { deviceRef.current.disconnectAll(); } catch { }
    }
  }, []);

  useEffect(() => {
    const unregister = registerDeviceDisconnect(() => {
      if (deviceRef.current) {
        try { deviceRef.current.disconnectAll(); } catch { }
      }
    });
    return unregister;
  }, []);

  return (
    <TwilioDeviceContext.Provider value={{ deviceState, deviceError, connectToConference, disconnect, reconnect }}>
      {children}
    </TwilioDeviceContext.Provider>
  );
}
