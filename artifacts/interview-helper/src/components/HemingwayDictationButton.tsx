import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

type SpeechAlternativeLike = { transcript: string };
type SpeechResultLike = ArrayLike<SpeechAlternativeLike> & { isFinal: boolean };
type SpeechEventLike = { resultIndex: number; results: ArrayLike<SpeechResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export default function HemingwayDictationButton({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState("");
  const [interim, setInterim] = useState("");

  callbackRef.current = onTranscript;

  useEffect(() => () => {
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
  }, []);

  const Recognition = (window as SpeechRecognitionWindow).SpeechRecognition
    ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    if (!Recognition) return;

    setNotice("");
    setInterim("");
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const finalParts: string[] = [];
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalParts.push(transcript);
        else interimText += transcript;
      }
      if (finalParts.length) callbackRef.current(finalParts.join(" ").trim());
      setInterim(interimText);
    };
    recognition.onerror = (event) => {
      setRecording(false);
      setInterim("");
      setNotice(event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Allow microphone access in your browser to dictate."
        : "Dictation stopped. Try again or type your draft.");
    };
    recognition.onend = () => {
      setRecording(false);
      setInterim("");
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
    } catch {
      recognitionRef.current = null;
      setRecording(false);
      setNotice("Dictation could not start. Check microphone access and try again.");
    }
  };

  if (!Recognition) {
    return (
      <button
        type="button"
        disabled
        title="This browser does not provide speech recognition."
        data-testid="hemingway-dictation-coming-soon"
        className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded border border-white/[0.06] px-2.5 py-1 text-[9px] tracking-wider text-zinc-700 opacity-50"
      >
        <Mic className="h-3 w-3" /> DICTATION · COMING SOON
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1" data-testid="hemingway-dictation">
      <button
        type="button"
        onClick={toggleRecording}
        aria-pressed={recording}
        data-testid="hemingway-dictation-toggle"
        className={`flex items-center gap-1 rounded border px-2.5 py-1 text-[9px] tracking-wider transition-colors ${
          recording
            ? "border-red-400/40 bg-red-400/10 text-red-200"
            : "border-white/[0.06] text-zinc-500 hover:border-amber-500/25 hover:text-amber-200"
        }`}
        title="Dictate into the draft using browser speech recognition"
      >
        {recording ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
        {recording ? "STOP DICTATION" : "DICTATE"}
      </button>
      {(notice || interim) && (
        <span role={notice ? "status" : undefined} className="max-w-40 truncate text-[9px] text-zinc-500">
          {notice || `Hearing: ${interim}`}
        </span>
      )}
    </span>
  );
}
