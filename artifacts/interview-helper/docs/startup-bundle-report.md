# Frontend startup bundle report

Measured with the production Vite build on 2026-08-30. The checked-in
`scripts/startup-baseline.json` records the normalized pre-change manifest; the
report compares it with the generated build by logical asset name. The
supported legacy targets in `vite.config.ts` were not changed.

## Startup comparison

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Modern entry JS | 2,037,122 B / 595,080 B gzip | 535,437 B / 167,038 B gzip | -74% raw / -72% gzip |
| Modern initial assets | 3,537,740 B / 993,385 B gzip | 1,411,798 B / 384,206 B gzip | -60% raw / -61% gzip |
| Legacy entry JS | 2,411,653 B / 628,800 B gzip | 896,339 B / 203,782 B gzip | -63% raw / -68% gzip |
| Legacy direct startup assets | 2,558,736 B / 683,937 B gzip | 1,043,422 B / 258,914 B gzip | -59% raw / -62% gzip |

“Modern initial assets” includes the entry, modern polyfills, CSS, and every
modulepreload emitted in `index.html`. Before this change those preloads included
the route-only markdown, syntax-highlighting, and chart vendor chunks. After the
change, only React, TanStack Query, and Framer Motion remain shared preloads.

## Major on-demand chunks after

| Chunk | Raw | Gzip | Loaded when |
| --- | ---: | ---: | --- |
| `WorldPlay` | 1,348,004 B | ~370 KB | City route |
| `PabloNebula3D` | 897,540 B | ~241 KB | Pablo route or small orb enhancement interaction |
| `jspdf.es.min` | 386,290 B | ~125 KB | Document/PDF feature |
| `BarChart` | 373,255 B | ~103 KB | Chart-bearing reporting route |
| `BotFactory` | 205,520 B | ~51 KB | Agents route |
| `twilio` | 182,120 B | ~47 KB | Voice device initialization |
| `audioConvert` | 170,104 B | ~59 KB | User requests audio conversion |
| `MarkdownRenderer` | 102,658 B | ~33 KB | Markdown-bearing feature route |
| `PabloTerminal` | 56,152 B | ~19 KB | Pablo route |
| `CommandPalette` | 52,447 B | ~19 KB | Authenticated navigation shell |
| `ChatPanel` | 33,603 B | ~11 KB | User opens COMMS |
| `DeferredChatPanel` | 2,447 B | ~1 KB | Authenticated lightweight launcher |

## Reproducing the report

```sh
pnpm --filter @workspace/interview-helper run build
pnpm --filter @workspace/interview-helper run bundle:report
```

The report script reads the checked-in baseline plus generated `index.html`,
strips content hashes from current asset names, measures direct modern and
legacy startup assets, and prints calculated raw/gzip deltas. Pass another
baseline manifest as the first argument when comparing a different revision.