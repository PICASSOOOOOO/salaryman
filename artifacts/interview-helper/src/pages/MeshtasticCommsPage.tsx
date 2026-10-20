import { Radio } from "lucide-react";
import { MeshtasticCommsPanel } from "@/components/MeshtasticCommsPanel";

export default function MeshtasticCommsPage() {
  return (
    <main className="min-h-screen bg-[#fffaf0] text-black">
      <header className="mx-auto flex max-w-5xl items-center gap-2 border-b border-black px-4 py-5">
        <Radio className="h-5 w-5" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest">CALLL HOME · Mesh bridge</p>
          <p className="text-xs text-black/55">Free radio messaging. Twilio calling remains a separate paid service.</p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl">
        <MeshtasticCommsPanel />
      </div>
    </main>
  );
}
