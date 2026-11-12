import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { FeedbackModal } from "./FeedbackModal";

export function FeedbackLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 items-center justify-center border border-black/20 text-black/60 transition-colors hover:border-black hover:text-black"
        aria-label="Send feedback or report a bug"
        title="Send feedback or report a bug"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}