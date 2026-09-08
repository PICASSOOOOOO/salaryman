import { apiFetch } from '@/lib/api-client';
import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import type { Device, Call } from '@twilio/voice-sdk';
import { registerDeviceDisconnect } from '@/lib/twilio-device-bridge';
import { setPhoneBusy } from '@/lib/phone-busy';

export type DeviceState = 'uninitialized' | 'initializing' | 'ready' | 'error';

interface TwilioDeviceContextValue {
  deviceState: DeviceState;
  deviceError: string | null;
  ensureDeviceReady: () => Promise<void>;
  connectToConference: (conferenceName: string) => Promise<Call>;
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
  const deviceStateRef = useRef<DeviceState>('uninitialized');
  const activeConferenceCallsRef = useRef<Map<string, Call>>(new Map());
  const connectingConferenceRef = useRef<Map<string, Promise<Call>>>(new Map());
  const initDeviceRef = useRef<() => Promise<void>>(async () => {});

  const apiUrl = useCallback((path: string) => `${BASE}api/${path}`, [BASE]);

  const TOKEN_REFRESH_MS = 50 * 60 * 1000;
  // Mobile Safari and resumed tabs can take longer to negotiate the Twilio
  // signaling socket. Do not mark a healthy phone offline prematurely.
  const REGISTER_TIMEOUT_MS = 30_000;

  const updateDeviceState = useCallback((state: DeviceState) => {
    deviceStateRef.current = state;
    setDeviceState(state);
  }, []);

  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(async () => {
      if (!deviceRef.current) return;
      try {
        const r = await apiFetch(apiUrl('twilio/token'), { credentials: 'include' });
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
    if (deviceRef.current && deviceStateRef.current === 'ready') return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    const promise = (async () => {
      updateDeviceState('initializing');
      setDeviceError(null);
      try {
        const { Device, Call } = await import('@twilio/voice-sdk');
        console.log('[TwilioDevice] fetching token...');
        const r = await apiFetch(apiUrl('twilio/token'), { credentials: 'include' });
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
          if (deviceRef.current !== device || unmountedRef.current) return;
          console.error('[TwilioDevice] error:', err.message);
          setDeviceError(err.message);
          updateDeviceState('error');
        });

        device.on('registered', () => {
          if (deviceRef.current !== device || unmountedRef.current) return;
          console.log('[TwilioDevice] registered and ready');
          updateDeviceState('ready');
          setDeviceError(null);
        });

        device.on('unregistered', () => {
          if (deviceRef.current !== device || unmountedRef.current) return;
          updateDeviceState('uninitialized');
          setDeviceError('Phone connection was interrupted. Reconnecting…');
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (deviceRef.current === device && !unmountedRef.current) {
              try { device.destroy(); } catch {}
              deviceRef.current = null;
              void initDeviceRef.current();
            }
          }, 1_000);
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
            const tr = await apiFetch(apiUrl('twilio/token'), { credentials: 'include' });
            if (tr.ok) {
              const td = await tr.json();
              device.updateToken(td.token);
              console.log('[TwilioDevice] token refreshed via tokenWillExpire');
            }
          } catch {}
        });

        // Publish the current Device before registering it so its synchronous
        // registration events are accepted by the stale-device guards above.
        deviceRef.current = device;
        await Promise.race([
          device.register(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Phone device registration timed out')), REGISTER_TIMEOUT_MS)),
        ]);
        // Bail out cleanly if we unmounted while register() was in flight —
        // otherwise we'd leave an orphaned Device + token-refresh timer
        // alive after the provider tore down.
        if (unmountedRef.current) {
          try { device.destroy(); } catch {}
          return;
        }
        updateDeviceState('ready');
        scheduleTokenRefresh();
        // Successful register → reset the auto-retry backoff so the next
        // failure starts the cycle from 3s again instead of 60s.
        retryAttemptRef.current = 0;
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        console.log('[TwilioDevice] device registered successfully');
      } catch (err: unknown) {
        if (deviceRef.current && deviceStateRef.current !== 'ready') {
          try { deviceRef.current.destroy(); } catch {}
          deviceRef.current = null;
        }
        const msg = err instanceof Error ? err.message : 'Failed to initialize Twilio device';
        console.error('[TwilioDevice] init failed:', msg);
        setDeviceError(msg);
        updateDeviceState('error');
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
  }, [apiUrl, scheduleTokenRefresh, updateDeviceState]);
  initDeviceRef.current = initDevice;

  useEffect(() => {
    unmountedRef.current = false;
    const retryWhenOnline = () => {
      if (unmountedRef.current || deviceStateRef.current === 'ready') return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptRef.current = 0;
      void initDeviceRef.current();
    };
    const retryWhenVisible = () => {
      if (document.visibilityState === 'visible') retryWhenOnline();
    };
    window.addEventListener('online', retryWhenOnline);
    document.addEventListener('visibilitychange', retryWhenVisible);
    return () => {
      unmountedRef.current = true;
      window.removeEventListener('online', retryWhenOnline);
      document.removeEventListener('visibilitychange', retryWhenVisible);
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
    // Let an in-flight registration settle before replacing it. Otherwise a
    // late event from the old Device can race the new one back to OFFLINE.
    if (initPromiseRef.current) {
      await initPromiseRef.current;
    }
    if (deviceRef.current) {
      try { deviceRef.current.destroy(); } catch {}
      deviceRef.current = null;
    }
    updateDeviceState('uninitialized');
    setDeviceError(null);
    await initDevice();
  }, [initDevice, updateDeviceState]);

  const ensureDeviceReady = useCallback(async () => {
    if (!deviceRef.current || deviceStateRef.current !== 'ready') {
      await initDevice();
    }
    if (!deviceRef.current || deviceStateRef.current !== 'ready') {
      throw new Error(deviceError || 'Phone device is offline or failed to register');
    }
  }, [deviceError, initDevice]);

  const connectToConference = useCallback(async (conferenceName: string): Promise<Call> => {
    await ensureDeviceReady();
    const existing = activeConferenceCallsRef.current.get(conferenceName);
    if (existing) {
      return existing;
    }
    const inFlight = connectingConferenceRef.current.get(conferenceName);
    if (inFlight) return inFlight;

    let connection!: Promise<Call>;
    connection = (async () => {
      try {
      console.log('[TwilioDevice] connecting to conference:', conferenceName);
      const call = await deviceRef.current!.connect({
        params: { To: conferenceName },
      });
      activeConferenceCallsRef.current.set(conferenceName, call);
      const clear = () => {
        if (activeConferenceCallsRef.current.get(conferenceName) === call) {
          activeConferenceCallsRef.current.delete(conferenceName);
        }
      };
      call.on('disconnect', clear);
      call.on('cancel', clear);
      call.on('reject', clear);
      call.on('error', clear);
      console.log('[TwilioDevice] connected to conference successfully');
      return call;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect to conference';
        console.error('[TwilioDevice] connect error:', msg);
        setDeviceError(msg);
        throw err;
      } finally {
        if (connectingConferenceRef.current.get(conferenceName) === connection) {
          connectingConferenceRef.current.delete(conferenceName);
        }
      }
    })();
    connectingConferenceRef.current.set(conferenceName, connection);
    return connection;
  }, [ensureDeviceReady]);

  const disconnect = useCallback(() => {
    if (deviceRef.current) {
      try { deviceRef.current.disconnectAll(); } catch { }
    }
    activeConferenceCallsRef.current.clear();
    connectingConferenceRef.current.clear();
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
    <TwilioDeviceContext.Provider value={{ deviceState, deviceError, ensureDeviceReady, connectToConference, disconnect, reconnect }}>
      {children}
    </TwilioDeviceContext.Provider>
  );
}
