import { useSyncExternalStore } from 'react';
import {
  CURRENCY_CHANGED_EVENT,
  getCurrency,
  getCurrencyInfo,
  setCurrency,
  type CurrencyCode,
  type CurrencyInfo,
} from '../lib/currency';

function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CURRENCY_CHANGED_EVENT, cb);
  return () => window.removeEventListener(CURRENCY_CHANGED_EVENT, cb);
}

/**
 * Reactive access to the player's selected real-world display currency.
 * Re-renders whenever `setCurrency` fires the CURRENCY_CHANGED_EVENT, so money
 * readouts update live the way changing language does — no reload.
 */
export function useCurrency(): {
  code: CurrencyCode;
  info: CurrencyInfo;
  setCurrency: (code: CurrencyCode) => void;
} {
  const code = useSyncExternalStore(subscribe, getCurrency, getCurrency) as CurrencyCode;
  return { code, info: getCurrencyInfo(code), setCurrency };
}
