import { useState, useRef } from 'react';
import { Coins, Check } from 'lucide-react';
import { SUPPORTED_CURRENCIES, type CurrencyCode } from '../lib/currency';
import { useCurrency } from '../hooks/use-currency';
import { PortalDropdown } from './PortalDropdown';

interface CurrencySelectorProps {
  compact?: boolean;
}

export function CurrencySelector({ compact = false }: CurrencySelectorProps) {
  const { code, info, setCurrency } = useCurrency();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleSelect = (next: CurrencyCode) => {
    setCurrency(next);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Display currency"
        className={`flex items-center gap-1 font-mono tracking-widest uppercase transition-colors rounded-md border ${
          open
            ? 'text-sky-400 border-sky-500/30 bg-sky-500/8'
            : 'text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600/50'
        } ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
      >
        <Coins className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        {!compact && <span className="hidden sm:inline">{info.code}</span>}
        {compact && <span>{info.symbol}</span>}
      </button>

      <PortalDropdown
        open={open}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        align="right"
        className="bg-[#0e0e10] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[200px]"
      >
        <div className="px-3 py-2 border-b border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            <Coins className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">Display Currency</span>
          </div>
        </div>
        <div className="py-1 max-h-[320px] overflow-y-auto">
          {SUPPORTED_CURRENCIES.map(cur => {
            const isActive = cur.code === code;
            return (
              <button
                key={cur.code}
                onClick={() => handleSelect(cur.code as CurrencyCode)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{cur.flag}</span>
                  <div>
                    <p className="text-[11px] font-medium leading-none">{cur.code} <span className="text-zinc-500">{cur.symbol}</span></p>
                    <p className="text-[9px] font-mono text-zinc-600 leading-none mt-0.5">{cur.name}</p>
                  </div>
                </div>
                {isActive && <Check className="w-3 h-3 text-sky-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PortalDropdown>
    </div>
  );
}
