import { useEffect, useRef, useCallback, useState } from 'react';
import { Device, Call } from '@twilio/voice-sdk';

export type DeviceState = 'uninitialized' | 'initializing' | 'ready' | 'error';

export interface UseTwilioDeviceOptions {
  BASE: string;
}

export interface UseTwilioDeviceReturn {
  deviceState: DeviceState;
  deviceError: string | null;
  connectToConference: (conferenceName: string) => Promise<Call | null>;
  disconnect: () => void;
}

export function useTwilioDevice({ BASE }: UseTwilioDeviceOptions): UseTwilioDeviceReturn {
  const deviceRef = useRef<Device | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState>('uninitialized');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiUrl = (path: string) => `${BASE}api/${path}`;

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
  }, [BASE]);

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
          if (deviceState !== 'error') setDeviceState('uninitialized');
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
        deviceRef.current = device;
        setDeviceState('ready');
        scheduleTokenRefresh();
        console.log('[TwilioDevice] device registered successfully');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to initialize Twilio device';
        console.error('[TwilioDevice] init failed:', msg);
        setDeviceError(msg);
        setDeviceState('error');
      }
    })();

    initPromiseRef.current = promise;
    try {
      await promise;
    } finally {
      initPromiseRef.current = null;
    }
  }, [BASE, scheduleTokenRefresh]);

  useEffect(() => {
    initDevice();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { }
        deviceRef.current = null;
      }
    };
  }, []);

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

  return { deviceState, deviceError, connectToConference, disconnect };
}
