import { useState } from 'react';
import { Bug } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';

export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-3 z-40 flex h-10 items-center gap-2 border border-black bg-[#FAFAF7] px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-black shadow-[3px_3px_0_#000] sm:bottom-4 sm:right-4"
        onClick={() => setOpen(true)}
        aria-label="Report a bug or send feedback"
      >
        <Bug className="h-4 w-4" aria-hidden />
        Bug / Feedback
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}