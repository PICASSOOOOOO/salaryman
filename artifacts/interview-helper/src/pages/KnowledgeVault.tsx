import React, { useState, useEffect, useCallback, useRef, useMemo, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, Trash2, Link2, Unlink, Save,
  FileText, Lightbulb, BookOpen, Users as UsersIcon, Target,
  Layers, Globe, Zap, Eye, ChevronRight, RefreshCw,
  Circle, Maximize2, Minimize2, Upload, Download,
  FolderOpen, ArrowLeft, Brain,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useBoomerMode } from '@/hooks/use-mobile';
import * as d3Force from 'd3-force';

interface VaultEntry {
  id: number;
  title: string;
  content: string;
  entryType: string;
  tags: string[];
  color: string | null;
  folder: string;
  frontmatter: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface VaultConnection {
  id: number;
  sourceId: number;
  targetId: number;
  label: string | null;
  strength: number;
}

interface Backlink {
  id: number;
  title: string;
  entryType: string;
}

interface GraphNode {
  id: number;
  title: string;
  type: string;
  tags: string[];
  color: string | null;
  connectionCount: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphEdge {
  id: number;
  source: number | GraphNode;
  target: number | GraphNode;
  label: string | null;
  strength: number;
}

const ENTRY_TYPES = [
  { key: 'note', label: 'NOTE', icon: FileText, color: '#3b82f6' },
  { key: 'idea', label: 'IDEA', icon: Lightbulb, color: '#f59e0b' },
  { key: 'reference', label: 'REFERENCE', icon: BookOpen, color: '#8b5cf6' },
  { key: 'person', label: 'PERSON', icon: UsersIcon, color: '#10b981' },
  { key: 'project', label: 'PROJECT', icon: Target, color: '#ef4444' },
  { key: 'concept', label: 'CONCEPT', icon: Layers, color: '#06b6d4' },
  { key: 'resource', label: 'RESOURCE', icon: Globe, color: '#ec4899' },
  { key: 'action', label: 'ACTION', icon: Zap, color: '#f97316' },
];

function getTypeColor(type: string): string {
  return ENTRY_TYPES.find(t => t.key === type)?.color ?? '#6b7280';
}

function getTypeIcon(type: string) {
  return ENTRY_TYPES.find(t => t.key === type)?.icon ?? FileText;
}

function renderMarkdown(text: string, onClickLink: (title: string) => void): React.JSX.Element[] {
  const lines = text.split('\n');
  const elements: React.JSX.Element[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-foreground mt-3 mb-1">{renderInline(line.slice(4), onClickLink)}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-base font-semibold text-foreground mt-4 mb-1">{renderInline(line.slice(3), onClickLink)}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-lg font-bold text-foreground mt-4 mb-2">{renderInline(line.slice(2), onClickLink)}</h1>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-2 pl-2">
          <span className="text-zinc-500 mt-0.5">•</span>
          <span className="text-sm text-zinc-300">{renderInline(line.slice(2), onClickLink)}</span>
        </div>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-sky-500/30 pl-3 text-sm text-zinc-400 italic my-1">
          {renderInline(line.slice(2), onClickLink)}
        </blockquote>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-sm text-zinc-300 leading-relaxed">{renderInline(line, onClickLink)}</p>);
    }
  }
  return elements;
}

function renderInline(text: string, onClickLink: (title: string) => void): (string | React.JSX.Element)[] {
  const parts: (string | React.JSX.Element)[] = [];
  const regex = /(\[\[([^\]]+)\]\])|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const linkParts = match[2].split('|');
      const target = linkParts[0].trim();
      const display = (linkParts[1] || linkParts[0]).trim();
      parts.push(
        <button
          key={`wl-${match.index}`}
          onClick={(e) => { e.stopPropagation(); onClickLink(target); }}
          className="text-sky-400 hover:text-sky-300 hover:underline cursor-pointer font-medium"
        >
          {display}
        </button>
      );
    } else if (match[3]) {
      parts.push(<code key={`c-${match.index}`} className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs text-amber-300 font-mono">{match[3].slice(1, -1)}</code>);
    } else if (match[4]) {
      parts.push(<strong key={`b-${match.index}`} className="font-semibold text-foreground">{match[4].slice(2, -2)}</strong>);
    } else if (match[5]) {
      parts.push(<em key={`i-${match.index}`} className="italic text-zinc-400">{match[5].slice(1, -1)}</em>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function KnowledgeVault() {
  const [boomerMode] = useBoomerMode();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [linkingFrom, setLinkingFrom] = useState<number | null>(null);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState('note');
  const [editTags, setEditTags] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editFolder, setEditFolder] = useState('/');
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<d3Force.Simulation<GraphNode, GraphEdge> | null>(null);
  const animFrameRef = useRef<number>(0);
  const dragRef = useRef<{ node: GraphNode | null; active: boolean }>({ node: null, active: false });
  const panRef = useRef<{ x: number; y: number; scale: number; dragging: boolean; lastMouse: { x: number; y: number } }>({
    x: 0, y: 0, scale: 1, dragging: false, lastMouse: { x: 0, y: 0 },
  });
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (currentFolder) params.set('folder', currentFolder);
      const qs = params.toString();
      const url = `/api/vault/entries${qs ? `?${qs}` : ''}`;
      const resp = await apiFetch(url);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Entries request failed (${resp.status})`);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Knowledge entries could not be loaded.');
      throw error;
    }
  }, [searchQuery, currentFolder]);

  const loadFolders = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/vault/folders');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Folders request failed (${resp.status})`);
      setFolders(Array.isArray(data.folders) ? data.folders : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Knowledge folders could not be loaded.');
      throw error;
    }
  }, []);

  const loadGraph = useCallback(async () => {
    try {
      const resp = await apiFetch('/api/vault/graph');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Knowledge graph request failed (${resp.status})`);
      setGraphNodes(Array.isArray(data.nodes) ? data.nodes : []);
      setGraphEdges(Array.isArray(data.edges) ? data.edges : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Knowledge graph could not be loaded.');
      throw error;
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const results = await Promise.allSettled([loadEntries(), loadGraph(), loadFolders()]);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      setLoadError(failed.reason instanceof Error ? failed.reason.message : 'Knowledge Hub could not be loaded.');
    }
    setLoading(false);
  }, [loadEntries, loadGraph, loadFolders]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filterType) result = result.filter(e => e.entryType === filterType);
    return result;
  }, [entries, filterType]);

  const handleCreate = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    const resp = await apiFetch('/api/vault/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        content: editContent,
        entryType: editType,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        color: editColor || null,
        folder: editFolder || '/',
      }),
    });
    if (resp.ok) {
      setShowCreateModal(false);
      setEditTitle(''); setEditContent(''); setEditType('note'); setEditTags(''); setEditColor(''); setEditFolder('/');
      loadAll();
    }
    setSaving(false);
  };

  const handleSave = async () => {
    if (!selectedEntry) return;
    setSaving(true);
    const resp = await apiFetch(`/api/vault/entries/${selectedEntry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        content: editContent,
        entryType: editType,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
        color: editColor || null,
        folder: editFolder || '/',
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      setSelectedEntry(data.entry);
      setEditMode(false);
      loadAll();
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/vault/entries/${id}`, { method: 'DELETE' });
    if (selectedEntry?.id === id) setSelectedEntry(null);
    loadAll();
  };

  const handleLink = async (targetId: number) => {
    if (!linkingFrom || linkingFrom === targetId) return;
    await apiFetch('/api/vault/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: linkingFrom, targetId }),
    });
    setLinkingFrom(null);
    loadGraph();
  };

  const handleUnlink = async (connectionId: number) => {
    await apiFetch(`/api/vault/connections/${connectionId}`, { method: 'DELETE' });
    loadGraph();
  };

  const selectEntry = async (entry: VaultEntry) => {
    if (linkingFrom) {
      handleLink(entry.id);
      return;
    }
    setSelectedEntry(entry);
    setEditMode(false);
    setEditTitle(entry.title);
    setEditContent(entry.content);
    setEditType(entry.entryType);
    setEditTags((entry.tags as string[]).join(', '));
    setEditColor(entry.color || '');
    setEditFolder(entry.folder || '/');

    try {
      const resp = await apiFetch(`/api/vault/entries/${entry.id}`);
      if (resp.ok) {
        const data = await resp.json();
        setBacklinks(data.backlinks ?? []);
      }
    } catch {}
  };

  const navigateToEntryByTitle = useCallback(async (title: string) => {
    const found = entries.find(e => e.title.toLowerCase() === title.toLowerCase());
    if (found) {
      selectEntry(found);
      return;
    }
    try {
      const resp = await apiFetch(`/api/vault/entries?q=${encodeURIComponent(title)}`);
      if (resp.ok) {
        const data = await resp.json();
        const match = (data.entries ?? []).find((e: VaultEntry) => e.title.toLowerCase() === title.toLowerCase());
        if (match) selectEntry(match);
      }
    } catch {}
  }, [entries]);

  const selectNodeById = useCallback(async (id: number) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      selectEntry(entry);
      return;
    }
    const resp = await apiFetch(`/api/vault/entries/${id}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.entry) selectEntry(data.entry);
    }
  }, [entries, linkingFrom]);

  const handleImportFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setImporting(true);
    setImportStatus('Reading files...');

    const files: { filename: string; raw: string }[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f.name.endsWith('.md')) continue;
      const raw = await f.text();
      const path = (f as any).webkitRelativePath || f.name;
      files.push({ filename: path, raw });
    }

    if (files.length === 0) {
      setImportStatus('No .md files found');
      setImporting(false);
      setTimeout(() => setImportStatus(null), 3000);
      return;
    }

    setImportStatus(`Importing ${files.length} notes...`);
    try {
      const resp = await apiFetch('/api/vault/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setImportStatus(`Imported ${data.imported} notes`);
        loadAll();
      } else {
        setImportStatus('Import failed');
      }
    } catch {
      setImportStatus('Import failed');
    }
    setImporting(false);
    setTimeout(() => setImportStatus(null), 4000);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const resp = await apiFetch('/api/vault/export');
      if (resp.ok) {
        const data = await resp.json();
        const files: { filename: string; content: string }[] = data.files;

        for (const file of files) {
          const blob = new Blob([file.content], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.filename.split('/').pop() || 'note.md';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch {}
    setExporting(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || graphNodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const nodes: GraphNode[] = graphNodes.map(n => ({ ...n }));
    const edges: GraphEdge[] = graphEdges.map(e => ({ ...e }));

    if (simRef.current) simRef.current.stop();

    const sim = d3Force.forceSimulation<GraphNode>(nodes)
      .force('charge', d3Force.forceManyBody().strength(-200))
      .force('center', d3Force.forceCenter(w / 2, h / 2))
      .force('link', d3Force.forceLink<GraphNode, GraphEdge>(edges)
        .id(d => d.id)
        .distance(120)
        .strength(0.4))
      .force('collision', d3Force.forceCollide(30))
      .alphaDecay(0.02);

    simRef.current = sim;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.save();

      const pan = panRef.current;
      ctx.translate(pan.x, pan.y);
      ctx.scale(pan.scale, pan.scale);

      edges.forEach(e => {
        const s = e.source as GraphNode;
        const t = e.target as GraphNode;
        if (s.x == null || t.x == null) return;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        ctx.lineTo(t.x, t.y!);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;

        const hovered = hoveredNodeRef.current;
        if (hovered && (s.id === hovered.id || t.id === hovered.id)) {
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 2;
        }
        if (selectedEntry && (s.id === selectedEntry.id || t.id === selectedEntry.id)) {
          ctx.strokeStyle = 'rgba(59,130,246,0.5)';
          ctx.lineWidth = 2;
        }

        ctx.stroke();

        if (e.label) {
          const mx = (s.x + t.x!) / 2;
          const my = (s.y! + t.y!) / 2;
          ctx.font = '8px monospace';
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.textAlign = 'center';
          ctx.fillText(e.label, mx, my - 4);
        }
      });

      nodes.forEach(n => {
        if (n.x == null) return;
        const color = n.color || getTypeColor(n.type);
        const radius = 6 + Math.min(n.connectionCount * 2, 14);
        const isSelected = selectedEntry?.id === n.id;
        const isHovered = hoveredNodeRef.current?.id === n.id;
        const isLinkTarget = linkingFrom && linkingFrom !== n.id;

        ctx.beginPath();
        ctx.arc(n.x, n.y!, radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected
          ? 'rgba(59,130,246,0.15)'
          : isHovered ? 'rgba(255,255,255,0.05)' : 'transparent';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y!, radius, 0, Math.PI * 2);
        ctx.fillStyle = color + (isSelected ? 'cc' : isHovered ? 'aa' : '55');
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (isLinkTarget) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.font = `${isSelected || isHovered ? 'bold ' : ''}10px monospace`;
        ctx.fillStyle = isSelected ? '#e5e7eb' : isHovered ? '#d1d5db' : 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title, n.x, n.y! + radius + 14);
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(draw);
    };

    sim.on('tick', () => {});
    animFrameRef.current = requestAnimationFrame(draw);

    const getNodeAt = (mx: number, my: number): GraphNode | null => {
      const pan = panRef.current;
      const gx = (mx - pan.x) / pan.scale;
      const gy = (my - pan.y) / pan.scale;
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x == null) continue;
        const r = 6 + Math.min(n.connectionCount * 2, 14);
        const dx = gx - n.x;
        const dy = gy - n.y!;
        if (dx * dx + dy * dy < (r + 5) * (r + 5)) return n;
      }
      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const node = getNodeAt(mx, my);
      if (node) {
        dragRef.current = { node, active: true };
        node.fx = node.x;
        node.fy = node.y;
        sim.alphaTarget(0.3).restart();
      } else {
        panRef.current.dragging = true;
        panRef.current.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current.active && dragRef.current.node) {
        const pan = panRef.current;
        dragRef.current.node.fx = (mx - pan.x) / pan.scale;
        dragRef.current.node.fy = (my - pan.y) / pan.scale;
        return;
      }

      if (panRef.current.dragging) {
        const dx = e.clientX - panRef.current.lastMouse.x;
        const dy = e.clientY - panRef.current.lastMouse.y;
        panRef.current.x += dx;
        panRef.current.y += dy;
        panRef.current.lastMouse = { x: e.clientX, y: e.clientY };
        return;
      }

      hoveredNodeRef.current = getNodeAt(mx, my);
      canvas.style.cursor = hoveredNodeRef.current ? 'pointer' : 'grab';
    };

    const onMouseUp = () => {
      if (dragRef.current.active && dragRef.current.node) {
        dragRef.current.node.fx = null;
        dragRef.current.node.fy = null;
        sim.alphaTarget(0);
      }
      dragRef.current = { node: null, active: false };
      panRef.current.dragging = false;
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const node = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (node) selectNodeById(node.id);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const pan = panRef.current;
      pan.x = mx - (mx - pan.x) * factor;
      pan.y = my - (my - pan.y) * factor;
      pan.scale *= factor;
      pan.scale = Math.max(0.2, Math.min(5, pan.scale));
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      sim.stop();
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [graphNodes, graphEdges, selectedEntry, linkingFrom, selectNodeById]);

  const entryConnections = useMemo(() => {
    if (!selectedEntry) return [];
    return graphEdges.filter(e => {
      const sid = typeof e.source === 'number' ? e.source : (e.source as GraphNode).id;
      const tid = typeof e.target === 'number' ? e.target : (e.target as GraphNode).id;
      return sid === selectedEntry.id || tid === selectedEntry.id;
    });
  }, [selectedEntry, graphEdges]);

  const getConnectedTitle = (edge: GraphEdge): string => {
    if (!selectedEntry) return '';
    const sid = typeof edge.source === 'number' ? edge.source : (edge.source as GraphNode).id;
    const tid = typeof edge.target === 'number' ? edge.target : (edge.target as GraphNode).id;
    const otherId = sid === selectedEntry.id ? tid : sid;
    const node = graphNodes.find(n => n.id === otherId);
    return node?.title ?? `#${otherId}`;
  };

  const uniqueFolders = useMemo(() => {
    const all = new Set(folders);
    entries.forEach(e => { if (e.folder) all.add(e.folder); });
    return [...all].filter(f => f !== '/').sort();
  }, [folders, entries]);

  const wikiLinksInContent = useMemo(() => {
    if (!selectedEntry) return [];
    const matches = selectedEntry.content.match(/\[\[([^\]]+)\]\]/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.slice(2, -2).split('|')[0].trim()))];
  }, [selectedEntry]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-80px)] flex-col overflow-auto md:h-[calc(100vh-80px)] md:flex-row md:overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md"
        multiple
        className="hidden"
        onChange={handleImportFiles}
      />

      <div className="flex max-h-[48vh] w-full shrink-0 flex-col border-b border-border bg-card/50 md:h-full md:max-h-none md:w-72 md:border-b-0 md:border-r">
        {loadError && (
          <div role="alert" className="m-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <p className="font-medium">Knowledge Hub could not load completely.</p>
            <p className="mt-1 text-red-200/70">{loadError}</p>
            <button type="button" onClick={() => void loadAll()} className="mt-2 rounded border border-red-300/30 px-2 py-1 text-[10px] uppercase tracking-wider hover:bg-red-400/10">
              Retry
            </button>
          </div>
        )}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-sky-400" />
              <h2 className="text-xs font-mono tracking-widest uppercase text-zinc-400">
                {boomerMode ? 'SECOND BRAIN' : 'NEXUS VAULT'}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 hover:bg-violet-500/20 disabled:opacity-40"
                title="Import .md files"
              >
                <Upload className="w-3 h-3" />
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || entries.length === 0}
                className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                title="Export as .md"
              >
                <Download className="w-3 h-3" />
              </button>
              <button onClick={() => { setShowCreateModal(true); setEditTitle(''); setEditContent(''); setEditType('note'); setEditTags(''); setEditColor(''); setEditFolder(currentFolder || '/'); }}
                className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {importStatus && (
            <div className="text-[9px] font-mono tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-1 rounded animate-pulse">
              {importStatus}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notes... [[wiki-links]] supported"
              className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-zinc-600" />
          </div>

          {uniqueFolders.length > 0 && (
            <div className="space-y-0.5">
              <button onClick={() => setCurrentFolder(null)}
                className={`w-full text-left px-2 py-0.5 rounded text-[9px] font-mono tracking-widest flex items-center gap-1 ${!currentFolder ? 'text-sky-400 bg-sky-500/10' : 'text-zinc-600 hover:text-zinc-400'}`}>
                <FolderOpen className="w-3 h-3" /> ALL FOLDERS
              </button>
              {uniqueFolders.map(f => (
                <button key={f} onClick={() => setCurrentFolder(currentFolder === f ? null : f)}
                  className={`w-full text-left px-2 py-0.5 rounded text-[9px] font-mono tracking-widest flex items-center gap-1 ${currentFolder === f ? 'text-sky-400 bg-sky-500/10' : 'text-zinc-600 hover:text-zinc-400'}`}>
                  <FolderOpen className="w-3 h-3" /> {f.replace(/^\//, '').toUpperCase() || 'ROOT'}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            <button onClick={() => setFilterType(null)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-widest ${!filterType ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20' : 'text-zinc-600 hover:text-zinc-400'}`}>
              ALL
            </button>
            {ENTRY_TYPES.map(t => (
              <button key={t.key} onClick={() => setFilterType(filterType === t.key ? null : t.key)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-widest ${filterType === t.key ? 'border' : 'hover:text-zinc-400'}`}
                style={filterType === t.key ? { backgroundColor: t.color + '15', color: t.color, borderColor: t.color + '30' } : { color: '#71717a' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-600">
              {entries.length === 0 ? 'No entries yet. Create your first note or import from Obsidian.' : 'No matching entries.'}
            </div>
          ) : filteredEntries.map(entry => {
            const TypeIcon = getTypeIcon(entry.entryType);
            const color = entry.color || getTypeColor(entry.entryType);
            const isActive = selectedEntry?.id === entry.id;
            return (
              <button key={entry.id} onClick={() => selectEntry(entry)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-white/[0.02] transition-colors ${isActive ? 'bg-white/[0.04]' : ''}`}>
                <div className="flex items-center gap-2">
                  <TypeIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                  <span className="text-xs text-foreground truncate flex-1">{entry.title}</span>
                  {linkingFrom && linkingFrom !== entry.id && (
                    <button onClick={(e) => { e.stopPropagation(); handleLink(entry.id); }}
                      className="p-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
                      <Link2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 ml-5">
                  {entry.folder && entry.folder !== '/' && (
                    <span className="text-[8px] font-mono text-zinc-700 bg-zinc-800/30 px-1 rounded">{entry.folder}</span>
                  )}
                  {(entry.tags as string[]).slice(0, 3).map(tag => (
                    <span key={tag} className="text-[8px] font-mono text-zinc-600 bg-zinc-800/50 px-1 rounded">{tag}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-2 border-t border-border">
          <span className="text-[9px] font-mono text-zinc-600 tracking-widest">{entries.length} ENTRIES · {graphEdges.length} CONNECTIONS</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className={`relative border-b border-border bg-[#0a0a0b] ${graphExpanded ? 'flex-1' : 'h-[40%]'}`}>
          <canvas ref={canvasRef} className="w-full h-full" style={{ cursor: 'grab' }} />

          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="text-[9px] font-mono tracking-widest text-zinc-600 uppercase bg-black/40 backdrop-blur px-2 py-1 rounded">
              {boomerMode ? 'KNOWLEDGE GRAPH' : 'NEXUS MAP'}
            </span>
            {linkingFrom && (
              <span className="text-[9px] font-mono tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded animate-pulse">
                SELECT TARGET NODE
                <button onClick={() => setLinkingFrom(null)} className="ml-2 text-amber-400/60 hover:text-amber-400">✕</button>
              </span>
            )}
          </div>

          <div className="absolute top-3 right-3 flex items-center gap-1">
            <button onClick={() => loadGraph()} className="p-1.5 rounded bg-black/40 backdrop-blur text-zinc-500 hover:text-zinc-300">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setGraphExpanded(!graphExpanded)} className="p-1.5 rounded bg-black/40 backdrop-blur text-zinc-500 hover:text-zinc-300">
              {graphExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="absolute bottom-3 left-3 flex items-center gap-3 bg-black/40 backdrop-blur rounded px-2 py-1.5">
            {ENTRY_TYPES.map(t => (
              <div key={t.key} className="flex items-center gap-1">
                <Circle className="w-2 h-2" style={{ color: t.color, fill: t.color }} />
                <span className="text-[8px] font-mono text-zinc-600">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {!graphExpanded && (
          <div className="flex-1 overflow-y-auto bg-card/30">
            {!selectedEntry ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                <Brain className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs font-mono tracking-widest">SELECT A NOTE OR NODE</p>
                <p className="text-[10px] text-zinc-700 mt-1">Use [[wiki-links]] in your notes to connect ideas</p>
              </div>
            ) : (
              <div className="p-4 space-y-4 max-w-3xl mx-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(() => { const Icon = getTypeIcon(selectedEntry.entryType); return <Icon className="w-4 h-4" style={{ color: selectedEntry.color || getTypeColor(selectedEntry.entryType) }} />; })()}
                    {editMode ? (
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        className="bg-transparent border-b border-sky-500/30 text-foreground text-sm font-medium outline-none px-1" />
                    ) : (
                      <h3 className="text-sm font-medium text-foreground">{selectedEntry.title}</h3>
                    )}
                    {selectedEntry.folder && selectedEntry.folder !== '/' && (
                      <span className="text-[9px] font-mono text-zinc-600 bg-zinc-800/40 px-1.5 py-0.5 rounded">{selectedEntry.folder}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!editMode && (
                      <>
                        <button onClick={() => { setLinkingFrom(selectedEntry.id); }}
                          className="px-2 py-1 rounded text-[9px] font-mono text-sky-400 hover:bg-sky-500/10 border border-sky-500/20">
                          <Link2 className="w-3 h-3 inline mr-1" />LINK
                        </button>
                        <button onClick={() => setEditMode(true)}
                          className="px-2 py-1 rounded text-[9px] font-mono text-zinc-400 hover:bg-white/5">
                          EDIT
                        </button>
                        <button onClick={() => handleDelete(selectedEntry.id)}
                          className="p-1 rounded text-red-400/50 hover:text-red-400 hover:bg-red-500/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {editMode && (
                      <>
                        <button onClick={handleSave} disabled={saving}
                          className="px-2 py-1 rounded text-[9px] font-mono text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20">
                          <Save className="w-3 h-3 inline mr-1" />{saving ? 'SAVING...' : 'SAVE'}
                        </button>
                        <button onClick={() => setEditMode(false)}
                          className="px-2 py-1 rounded text-[9px] font-mono text-zinc-500 hover:bg-white/5">
                          CANCEL
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editMode && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ENTRY_TYPES.map(t => (
                        <button key={t.key} onClick={() => setEditType(t.key)}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono tracking-widest border ${editType === t.key ? '' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
                          style={editType === t.key ? { backgroundColor: t.color + '15', color: t.color, borderColor: t.color + '30' } : {}}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[9px] font-mono text-zinc-600">FOLDER:</label>
                      <input value={editFolder} onChange={e => setEditFolder(e.target.value)}
                        placeholder="/"
                        className="bg-muted/20 border border-border rounded px-2 py-0.5 text-xs text-foreground font-mono w-40" />
                    </div>
                  </div>
                )}

                {editMode ? (
                  <div className="space-y-2">
                    <div className="relative">
                      <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                        rows={14}
                        placeholder="Write in markdown. Use [[Note Title]] to link to other notes."
                        className="w-full bg-muted/20 border border-border rounded-lg p-3 text-sm text-foreground font-mono leading-relaxed resize-y" />
                      <div className="absolute top-2 right-2 text-[8px] font-mono text-zinc-700">
                        [[wiki-links]] supported
                      </div>
                    </div>
                    <input value={editTags} onChange={e => setEditTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-xs text-foreground" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-muted/10 border border-border/50 rounded-lg p-4">
                      <div className="prose-sm">
                        {selectedEntry.content
                          ? renderMarkdown(selectedEntry.content, navigateToEntryByTitle)
                          : <p className="text-sm text-zinc-600 italic">(empty)</p>
                        }
                      </div>
                    </div>

                    {(selectedEntry.tags as string[]).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(selectedEntry.tags as string[]).map(tag => (
                          <span key={tag} className="text-[9px] font-mono text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/30">#{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {wikiLinksInContent.length > 0 && !editMode && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono tracking-widest text-sky-600 uppercase">OUTGOING LINKS</p>
                    <div className="flex flex-wrap gap-1">
                      {wikiLinksInContent.map(link => (
                        <button key={link} onClick={() => navigateToEntryByTitle(link)}
                          className="text-[10px] font-mono text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded hover:bg-sky-500/20">
                          {link}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {backlinks.length > 0 && !editMode && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono tracking-widest text-violet-600 uppercase flex items-center gap-1">
                      <ArrowLeft className="w-3 h-3" /> BACKLINKS ({backlinks.length})
                    </p>
                    {backlinks.map(bl => {
                      const Icon = getTypeIcon(bl.entryType);
                      return (
                        <button key={bl.id} onClick={async () => {
                          const entry = entries.find(e => e.id === bl.id);
                          if (entry) { selectEntry(entry); return; }
                          try {
                            const resp = await apiFetch(`/api/vault/entries/${bl.id}`);
                            if (resp.ok) { const data = await resp.json(); if (data.entry) selectEntry(data.entry); }
                          } catch {}
                        }}
                          className="flex items-center gap-2 px-2 py-1.5 bg-violet-500/5 rounded-lg border border-violet-500/15 hover:border-violet-500/30 w-full text-left">
                          <Icon className="w-3 h-3 text-violet-400" />
                          <span className="text-xs text-foreground">{bl.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {entryConnections.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[9px] font-mono tracking-widest text-zinc-600 uppercase">CONNECTIONS</p>
                    {entryConnections.map(e => (
                      <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/10 rounded-lg border border-border/30 hover:border-border/60">
                        <Link2 className="w-3 h-3 text-sky-400/40" />
                        <span className="text-xs text-foreground flex-1">{getConnectedTitle(e)}</span>
                        {e.label && <span className="text-[9px] text-zinc-600 font-mono">{e.label}</span>}
                        <button onClick={() => handleUnlink(e.id)} className="p-0.5 text-red-400/40 hover:text-red-400">
                          <Unlink className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-[9px] font-mono text-zinc-700">
                  CREATED {new Date(selectedEntry.createdAt).toLocaleDateString()} · UPDATED {new Date(selectedEntry.updatedAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              className="bg-card border border-border rounded-xl p-5 w-full max-w-lg space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-mono tracking-widest text-foreground uppercase">NEW NOTE</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm text-foreground" autoFocus />
              <div className="flex flex-wrap gap-1">
                {ENTRY_TYPES.map(t => (
                  <button key={t.key} onClick={() => setEditType(t.key)}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono tracking-widest border ${editType === t.key ? '' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
                    style={editType === t.key ? { backgroundColor: t.color + '15', color: t.color, borderColor: t.color + '30' } : {}}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] font-mono text-zinc-600 shrink-0">FOLDER:</label>
                <input value={editFolder} onChange={e => setEditFolder(e.target.value)}
                  placeholder="/"
                  className="bg-muted/20 border border-border rounded px-2 py-1 text-xs text-foreground font-mono flex-1" />
              </div>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                rows={8} placeholder="Write in markdown. Use [[Note Title]] to create wiki-links."
                className="w-full bg-muted/20 border border-border rounded-lg p-3 text-sm text-foreground font-mono resize-y" />
              <input value={editTags} onChange={e => setEditTags(e.target.value)}
                placeholder="Tags (comma separated)"
                className="w-full bg-muted/20 border border-border rounded-lg px-3 py-2 text-xs text-foreground" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreateModal(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">CANCEL</button>
                <button onClick={handleCreate} disabled={!editTitle.trim() || saving}
                  className="px-4 py-1.5 bg-sky-500/15 text-sky-400 border border-sky-500/25 rounded-lg text-xs font-mono hover:bg-sky-500/25 disabled:opacity-40">
                  {saving ? 'CREATING...' : 'CREATE'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
