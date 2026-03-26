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
  const initializingRef = useRef(false);

  const apiUrl = (path: string) => `${BASE}api/${path}`;

  const initDevice = useCallback(async () => {
    if (initializingRef.current) return;
    if (deviceRef.current && deviceState === 'ready') return;
    initializingRef.current = true;
    setDeviceState('initializing');
    setDeviceError(null);
    try {
      const r = await fetch(apiUrl('twilio/token'));
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Failed to get token (${r.status})`);
      }
      const data = await r.json();

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
        setDeviceState('ready');
        setDeviceError(null);
      });

      device.on('unregistered', () => {
        if (deviceState !== 'error') setDeviceState('uninitialized');
      });

      await device.register();
      deviceRef.current = device;
      setDeviceState('ready');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Twilio device';
      console.warn('[TwilioDevice] init warning (non-fatal):', msg);
      setDeviceError(msg);
      setDeviceState('error');
    } finally {
      initializingRef.current = false;
    }
  }, [BASE]);

  useEffect(() => {
    initDevice();
    return () => {
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { }
        deviceRef.current = null;
      }
    };
  }, []);

  const connectToConference = useCallback(async (conferenceName: string): Promise<Call | null> => {
    if (!deviceRef.current || deviceState !== 'ready') {
      await initDevice();
    }
    if (!deviceRef.current) {
      console.warn('[TwilioDevice] No device available to connect');
      return null;
    }
    try {
      const call = await deviceRef.current.connect({
        params: { To: conferenceName },
      });
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
