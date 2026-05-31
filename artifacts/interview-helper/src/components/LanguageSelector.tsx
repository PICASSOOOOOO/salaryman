import { useState, useRef } from 'react';
import { Globe, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, setLanguage, getCurrentLanguage, type LanguageCode } from '../i18n';
import { useTranslation } from 'react-i18next';
import { PortalDropdown } from './PortalDropdown';

interface LanguageSelectorProps {
  compact?: boolean;
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const currentLang = getCurrentLanguage();
  const currentLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === currentLang) ?? SUPPORTED_LANGUAGES[0];

  const handleSelect = (code: LanguageCode) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title="Select language"
        className={`flex items-center gap-1 font-mono tracking-widest uppercase transition-colors rounded-md border ${
          open
            ? 'text-sky-400 border-sky-500/30 bg-sky-500/8'
            : 'text-zinc-500 border-zinc-700/50 hover:text-zinc-300 hover:border-zinc-600/50'
        } ${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-1 text-[10px]'}`}
      >
        <Globe className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        {!compact && (
          <span className="hidden sm:inline">{currentLangInfo.nativeName}</span>
        )}
        {compact && (
          <span>{currentLangInfo.flag}</span>
        )}
      </button>

      <PortalDropdown
        open={open}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        align="right"
        className="bg-[#0e0e10] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[180px]"
      >
        <div className="px-3 py-2 border-b border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-zinc-500" />
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase">Language</span>
          </div>
        </div>
        <div className="py-1">
          {SUPPORTED_LANGUAGES.map(lang => {
            const isActive = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{lang.flag}</span>
                  <div>
                    <p className="text-[11px] font-medium leading-none">{lang.nativeName}</p>
                    <p className="text-[9px] font-mono text-zinc-600 leading-none mt-0.5">{lang.name}</p>
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
