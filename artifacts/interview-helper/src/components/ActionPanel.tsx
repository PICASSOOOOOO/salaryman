import { motion } from 'framer-motion';
import { Lightbulb, Code2, MessageSquare, Zap, Mic, Play, Lock } from 'lucide-react';
import type { InterviewMode } from '@/hooks/use-interview';
import { PABLO_PRODUCTS } from '@/lib/product-names';
import { useTranslation } from 'react-i18next';
import { usePledgePopup } from '@/components/PledgeStorePopup';

interface ActionPanelProps {
  onAction: (mode: InterviewMode) => void;
  isStreaming: boolean;
  hasSayThis?: boolean;
  boomerMode?: boolean;
}

const actionDefs = [
  {
    id: 'hint' as InterviewMode,
    labelKey: 'actionPanel.getHint',
    descKey: 'actionPanel.getHintDesc',
    fallbackLabel: 'GET A HINT',
    fallbackDesc: 'A small nudge in the right direction.',
    codenameLabel: PABLO_PRODUCTS.GET_HINT.name,
    codenameDesc: PABLO_PRODUCTS.GET_HINT.desc,
    icon: Lightbulb,
    color: 'text-sky-400',
    bg: 'bg-sky-400/10',
    border: 'border-sky-400/20',
    hover: 'hover:border-sky-400/50 hover:bg-sky-400/20',
  },
  {
    id: 'solution' as InterviewMode,
    labelKey: 'actionPanel.fullSolution',
    descKey: 'actionPanel.fullSolutionDesc',
    fallbackLabel: 'FULL SOLUTION',
    fallbackDesc: 'Get the complete answer with code.',
    codenameLabel: PABLO_PRODUCTS.FULL_SOLUTION.name,
    codenameDesc: PABLO_PRODUCTS.FULL_SOLUTION.desc,
    icon: Code2,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    border: 'border-blue-400/20',
    hover: 'hover:border-blue-400/50 hover:bg-blue-400/20',
  },
  {
    id: 'explain' as InterviewMode,
    labelKey: 'actionPanel.explainStepByStep',
    descKey: 'actionPanel.explainDesc',
    fallbackLabel: 'EXPLAIN STEP BY STEP',
    fallbackDesc: 'Walk through the logic one step at a time.',
    codenameLabel: PABLO_PRODUCTS.EXPLAIN_APPROACH.name,
    codenameDesc: PABLO_PRODUCTS.EXPLAIN_APPROACH.desc,
    icon: MessageSquare,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    border: 'border-purple-400/20',
    hover: 'hover:border-purple-400/50 hover:bg-purple-400/20',
  },
  {
    id: 'complexity' as InterviewMode,
    labelKey: 'actionPanel.checkPerformance',
    descKey: 'actionPanel.checkPerformanceDesc',
    fallbackLabel: 'CHECK PERFORMANCE',
    fallbackDesc: 'Find out how fast and efficient the solution is.',
    codenameLabel: PABLO_PRODUCTS.ANALYZE_COMPLEXITY.name,
    codenameDesc: PABLO_PRODUCTS.ANALYZE_COMPLEXITY.desc,
    icon: Zap,
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
    border: 'border-amber-400/20',
    hover: 'hover:border-amber-400/50 hover:bg-amber-400/20',
  },
];

export function ActionPanel({ onAction, isStreaming, hasSayThis = false, boomerMode = false }: ActionPanelProps) {
  const { openPledgePopup } = usePledgePopup();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 mt-6">
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0 }}
        onClick={() => hasSayThis ? onAction('say_it') : openPledgePopup({ reason: 'Unlock Say This with a one-time pledge.' })}
        disabled={isStreaming && hasSayThis}
        className={`relative flex items-center gap-4 p-4 text-left w-full rounded-xl border transition-all duration-300 group overflow-hidden ${
          hasSayThis
            ? 'border-rose-500/50 bg-rose-500/20 hover:bg-rose-500/30 hover:border-rose-500 disabled:opacity-50 disabled:cursor-not-allowed'
            : 'border-amber-500/30 bg-amber-500/8 hover:bg-amber-500/15 hover:border-amber-500/50 cursor-pointer'
        }`}
      >
        <div className={`p-2 rounded-lg border shrink-0 group-hover:scale-110 transition-transform duration-300 ${
          hasSayThis ? 'bg-rose-500/20 border-rose-500/40' : 'bg-amber-500/15 border-amber-500/30'
        }`}>
          {hasSayThis ? <Mic className="w-5 h-5 text-rose-400" /> : <Lock className="w-5 h-5 text-amber-400" />}
        </div>
        <div className="flex-1">
          <h3 className={`font-bold ${boomerMode ? 'text-lg' : 'text-base'} leading-none mb-1 flex items-center gap-2 ${hasSayThis ? 'text-white' : 'text-amber-300'}`}>
            {boomerMode
              ? t('actionPanel.sayThisOutLoud')
              : PABLO_PRODUCTS.SAY_THIS.name}
            <span className={`${boomerMode ? 'text-xs' : 'text-[10px]'} font-mono px-1.5 py-0.5 rounded ${
              hasSayThis ? 'bg-rose-500/30 text-rose-300' : 'bg-amber-500/20 text-amber-400'
            }`}>{hasSayThis ? t('actionPanel.quickRead') : '$5/MO'}</span>
          </h3>
          <p className={`${boomerMode ? 'text-sm' : 'text-xs'} leading-relaxed ${hasSayThis ? 'text-rose-300/80' : 'text-amber-400/60'}`}>
            {hasSayThis
              ? (boomerMode ? t('actionPanel.sayThisOutLoudDesc') : PABLO_PRODUCTS.SAY_THIS.desc)
              : (boomerMode ? t('actionPanel.subscribeToUnlock') : t('actionPanel.moduleSubRequired'))}
          </p>
        </div>
      </motion.button>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actionDefs.map((action, i) => {
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
                rounded-xl border transition-all duration-300 group overflow-hidden
                ${action.border} ${action.bg} ${action.hover} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-[initial] disabled:hover:bg-[initial]
              `}
            >
              <div className={`p-2 rounded-lg border mb-3 group-hover:scale-110 transition-transform duration-300 bg-background/50 ${action.border}`}>
                <Icon className={`w-5 h-5 ${action.color}`} />
              </div>
              <h3 className={`${boomerMode ? 'text-base' : 'text-sm'} font-semibold mb-1 flex items-center gap-2 text-foreground`}>
                {boomerMode ? t(action.labelKey, action.fallbackLabel) : action.codenameLabel}
                <Play className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
              </h3>
              <p className={`${boomerMode ? 'text-sm' : 'text-xs'} text-muted-foreground/50 leading-relaxed`}>
                {boomerMode ? t(action.descKey, action.fallbackDesc) : action.codenameDesc}
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
