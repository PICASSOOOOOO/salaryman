import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { SolverStatus } from '@/hooks/use-interview';

export function StatusIndicator({ status }: { status: SolverStatus }) {
  const config = {
    idle: {
      icon: Brain,
      text: 'Ready for input',
      color: 'text-muted-foreground',
      bg: 'bg-muted/50 border-border'
    },
    thinking: {
      icon: Loader2,
      text: 'Analyzing...',
      color: 'text-amber-400',
      bg: 'bg-amber-400/10 border-amber-400/20',
      spin: true
    },
    streaming: {
      icon: Loader2,
      text: 'Generating response...',
      color: 'text-primary',
      bg: 'bg-primary/10 border-primary/20',
      spin: true
    },
    done: {
      icon: CheckCircle2,
      text: 'Done',
      color: 'text-sky-400',
      bg: 'bg-sky-400/10 border-sky-400/20'
    },
    error: {
      icon: AlertCircle,
      text: 'Error generating response',
      color: 'text-destructive',
      bg: 'bg-destructive/10 border-destructive/20'
    }
  };

  const current = config[status];
  const Icon = current.icon;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${current.bg} ${current.color} transition-colors duration-300`}
    >
      <Icon className={`w-3.5 h-3.5 ${'spin' in current && current.spin ? 'animate-spin' : ''}`} />
      <span>{current.text}</span>
    </motion.div>
  );
}
