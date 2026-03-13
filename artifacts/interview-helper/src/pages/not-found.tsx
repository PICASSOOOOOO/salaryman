import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />

      <div className="text-center relative z-10 flex flex-col items-center">
        <div className="w-20 h-20 bg-secondary border border-border rounded-2xl flex items-center justify-center mb-8 shadow-2xl">
          <Terminal className="w-10 h-10 text-muted-foreground" />
        </div>
        
        <h1 className="text-6xl font-bold font-mono tracking-tighter mb-4 text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
          404
        </h1>
        <p className="text-xl text-muted-foreground mb-8 font-mono">
          {'>'} Error: process not found.
        </p>
        
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Workspace
        </Link>
      </div>
    </div>
  );
}
