import { motion } from 'framer-motion';
import { Lightbulb, Code2, MessageSquare, Zap, Loader2, Play, Mic } from 'lucide-react';
import type { InterviewMode } from '@/hooks/use-interview';

interface ActionPanelProps {
  onAction: (mode: InterviewMode) => void;
  isStreaming: boolean;
}

const actions = [
  {
    id: 'hint' as InterviewMode,
    label: 'Get Hint',
    description: 'A subtle nudge in the right direction',
    icon: Lightbulb,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    border: 'border-emerald-400/20',
    hover: 'hover:border-emerald-400/50 hover:bg-emerald-400/20',
    fullWidth: false,
  },
  {
    id: 'solution' as InterviewMode,
    label: 'Full Solution',
    description: 'Optimal code with inline comments',
    icon: Code2,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    hover: 'hover:border-blue-400/50 hover:bg-blue-400/20',
    fullWidth: false,
  },
  {
    id: 'explain' as InterviewMode,
    label: 'Explain Approach',
    description: 'Break down the logic step-by-step',
    icon: MessageSquare,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    hover: 'hover:border-purple-400/50 hover:bg-purple-400/20',
    fullWidth: false,
  },
  {
    id: 'complexity' as InterviewMode,
    label: 'Analyze Complexity',
    description: 'Time and space complexity breakdown',
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    hover: 'hover:border-amber-400/50 hover:bg-amber-400/20',
    fullWidth: false,
  },
];

const sayItAction = {
  id: 'say_it' as InterviewMode,
  label: 'Say This',
  description: '3 bullets. Plain English. Read it out loud right now.',
  icon: Mic,
  color: 'text-white',
  bg: 'bg-rose-500/20',
  border: 'border-rose-500/50',
  hover: 'hover:bg-rose-500/30 hover:border-rose-500',
};

export function ActionPanel({ onAction, isStreaming }: ActionPanelProps) {
  return (
    <div className="flex flex-col gap-3 mt-6">
      {/* Say This — full width, prominent */}
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        onClick={() => onAction(sayItAction.id)}
        disabled={isStreaming}
        className={`
          relative flex items-center gap-4 p-4 text-left w-full
          rounded-xl border ${sayItAction.border} ${sayItAction.bg}
          transition-all duration-300 group overflow-hidden
          disabled:opacity-50 disabled:cursor-not-allowed
          ${!isStreaming && sayItAction.hover}
        `}
      >
        <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/40 shrink-0 group-hover:scale-110 transition-transform duration-300">
          <Mic className="w-5 h-5 text-rose-400" />
        </div>
        <div>
          <h3 className="font-bold text-white text-base leading-none mb-1 flex items-center gap-2">
            {sayItAction.label}
            <span className="text-[10px] font-mono bg-rose-500/30 text-rose-300 px-1.5 py-0.5 rounded">QUICK READ</span>
          </h3>
          <p className="text-xs text-rose-300/80 leading-relaxed">
            {sayItAction.description}
          </p>
        </div>
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500/5 to-transparent" />
        </div>
      </motion.button>

      {/* Other 4 buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 1) * 0.08 }}
              onClick={() => onAction(action.id)}
              disabled={isStreaming}
              className={`
                relative flex flex-col items-start p-4 text-left
                rounded-xl border ${action.border} ${action.bg}
                transition-all duration-300 group overflow-hidden
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[initial] disabled:hover:bg-[initial]
                ${!isStreaming && action.hover}
              `}
            >
              <div className={`p-2 rounded-lg bg-background/50 border ${action.border} mb-3 group-hover:scale-110 transition-transform duration-300`}>
                <Icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                {action.label}
                <Play className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {action.description}
              </p>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
