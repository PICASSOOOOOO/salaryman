import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Box, Camera, LampDesk, Loader2, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SignInPage } from "@/components/SignInPrompt";
import { apiFetch } from "@/lib/api-client";

type Shape = "box" | "sphere" | "cylinder" | "cone";
type Mood = "soft daylight" | "warm studio" | "dramatic noir";
type CameraAngle = "wide" | "eye level" | "top down";

interface SceneObject {
  id: string;
  name: string;
  shape: Shape;
  color: string;
  position: [number, number, number];
  scale: number;
}

const STORAGE_KEY = "salaryman-scene-composer-v1";
const COLORS = ["#f1e8d8", "#d86f4a", "#315e61", "#d2b465", "#55536d", "#9aaba0"];
const SHAPES: Shape[] = ["box", "sphere", "cylinder", "cone"];
const MOODS: Mood[] = ["soft daylight", "warm studio", "dramatic noir"];
const ANGLES: CameraAngle[] = ["wide", "eye level", "top down"];

const starterScene: SceneObject[] = [
  { id: "hero", name: "Hero object", shape: "box", color: "#d86f4a", position: [0, 0.8, 0], scale: 1.1 },
  { id: "plinth", name: "Display plinth", shape: "cylinder", color: "#e6dcc8", position: [0, 0.25, 0], scale: 1.55 },
  { id: "accent", name: "Accent object", shape: "sphere", color: "#d2b465", position: [1.65, 0.55, -0.35], scale: 0.62 },
];

function readScene(): SceneObject[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(value) && value.length) return value;
  } catch { /* Use the starter composition if local storage is unavailable. */ }
  return starterScene;
}

function CameraPreset({ angle }: { angle: CameraAngle }) {
  const { camera } = useThree();
  useEffect(() => {
    const positions: Record<CameraAngle, [number, number, number]> = {
      wide: [6.2, 4.6, 7.8],
      "eye level": [7.2, 2.4, 8.8],
      "top down": [0.1, 10, 0.01],
    };
    camera.position.set(...positions[angle]);
    camera.lookAt(0, 0.5, 0);
    camera.updateProjectionMatrix();
  }, [angle, camera]);
  return null;
}

function SceneMesh({ item, selected, onSelect }: { item: SceneObject; selected: boolean; onSelect: () => void }) {
  const common = {
    onClick: (event: { stopPropagation: () => void }) => { event.stopPropagation(); onSelect(); },
    castShadow: true,
    receiveShadow: true,
  };
  const size = item.scale;
  return (
    <group position={item.position} scale={size}>
      {item.shape === "box" && <mesh {...common}><boxGeometry args={[1.15, 1.15, 1.15]} /><meshStandardMaterial color={item.color} roughness={0.48} /></mesh>}
      {item.shape === "sphere" && <mesh {...common}><sphereGeometry args={[0.66, 32, 24]} /><meshStandardMaterial color={item.color} roughness={0.32} /></mesh>}
      {item.shape === "cylinder" && <mesh {...common}><cylinderGeometry args={[0.85, 0.85, 0.5, 48]} /><meshStandardMaterial color={item.color} roughness={0.68} /></mesh>}
      {item.shape === "cone" && <mesh {...common}><coneGeometry args={[0.72, 1.35, 32]} /><meshStandardMaterial color={item.color} roughness={0.5} /></mesh>}
      {selected && <mesh position={[0, 0.02, 0]} scale={1.09}><sphereGeometry args={[0.8, 20, 16]} /><meshBasicMaterial color="#111827" wireframe transparent opacity={0.55} /></mesh>}
    </group>
  );
}

export default function SceneComposer({ embedded = false }: { embedded?: boolean }) {
  const { isAuthenticated } = useAuth();
  const [objects, setObjects] = useState<SceneObject[]>(readScene);
  const [selectedId, setSelectedId] = useState<string | null>("hero");
  const [mood, setMood] = useState<Mood>("soft daylight");
  const [angle, setAngle] = useState<CameraAngle>("wide");
  const [brief, setBrief] = useState("A premium editorial product scene");
  const [render, setRender] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const selected = objects.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(objects)); } catch { /* Scene remains editable for this session. */ }
  }, [objects]);

  const sceneDescription = useMemo(() => objects.map((item) =>
    `${item.name}: ${item.shape}, ${item.color}, at x ${item.position[0].toFixed(1)} y ${item.position[1].toFixed(1)} z ${item.position[2].toFixed(1)}, scale ${item.scale.toFixed(1)}`,
  ).join("; "), [objects]);

  if (!isAuthenticated && !embedded) return <SignInPage context="Sign in to use the Scene Composer." />;

  const addObject = (shape: Shape) => {
    const next: SceneObject = {
      id: `object-${Date.now()}`,
      name: `${shape[0].toUpperCase()}${shape.slice(1)} ${objects.length + 1}`,
      shape,
      color: COLORS[objects.length % COLORS.length],
      position: [((objects.length % 3) - 1) * 1.3, 0.65, Math.floor(objects.length / 3) * 1.25 - 0.5],
      scale: 0.8,
    };
    setObjects((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const updateSelected = (patch: Partial<SceneObject>) => {
    if (!selected) return;
    setObjects((current) => current.map((item) => item.id === selected.id ? { ...item, ...patch } : item));
  };

  const renderScene = async () => {
    if (!brief.trim() || generating) return;
    setGenerating(true);
    setError("");
    setRender(null);
    try {
      const response = await apiFetch("/api/studio/production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "film_hidef",
          aspect: angle === "eye level" ? "1024x1536" : "1536x1024",
          style: `${mood}; camera ${angle}; carefully follow the described object placement, scale, and color`,
          prompt: `${brief.trim()}. 3D composition: ${sceneDescription}. Use clear spatial relationships and a deliberate camera composition.`,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Image generation failed.");
      setRender(data.image);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const surface = embedded ? "rounded-2xl border border-slate-200 bg-white" : "min-h-screen bg-[#f5f3ee] text-slate-900";
  return (
    <main className={`${surface} mx-auto w-full max-w-7xl p-4 sm:p-6`}>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-slate-500">DARK ROOM / CREATIVE TOOLS</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Scene Composer</h1>
          <p className="mt-1 text-sm text-slate-500">Block the scene in 3D, then render it with AI.</p>
        </div>
        <button onClick={() => { setObjects(starterScene); setSelectedId("hero"); setRender(null); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <RotateCcw size={15} /> Reset scene
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-[#ebe8e0]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <span className="text-xs font-medium text-slate-500">CLICK AN OBJECT TO EDIT · DRAG TO ORBIT</span>
            <div className="flex gap-1">
              {ANGLES.map((option) => <button key={option} onClick={() => setAngle(option)} className={`rounded-md px-2.5 py-1.5 text-xs capitalize ${angle === option ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{option}</button>)}
            </div>
          </div>
          <div className="h-[360px] sm:h-[480px]">
            <Canvas shadows camera={{ position: [6.2, 4.6, 7.8], fov: 42 }} dpr={[1, 1.5]} onPointerMissed={() => setSelectedId(null)}>
              <CameraPreset angle={angle} />
              <color attach="background" args={["#ebe8e0"]} />
              <ambientLight intensity={mood === "dramatic noir" ? 0.35 : 0.75} />
              <directionalLight position={[-3, 7, 4]} intensity={mood === "warm studio" ? 2.3 : 1.6} color={mood === "warm studio" ? "#ffd59a" : "#ffffff"} castShadow shadow-mapSize={[1024, 1024]} />
              {mood === "dramatic noir" && <spotLight position={[4, 5, -3]} intensity={75} angle={0.42} penumbra={0.8} color="#d5e4ff" />}
              <Suspense fallback={null}>
                {objects.map((item) => <SceneMesh key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color="#d8d4ca" roughness={0.92} /></mesh>
                <ContactShadows position={[0, -0.025, 0]} opacity={0.28} scale={12} blur={2} far={4} />
              </Suspense>
              <OrbitControls target={[0, 0.5, 0]} minDistance={3} maxDistance={18} maxPolarAngle={Math.PI / 2.02} />
            </Canvas>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 bg-white p-3">
            {SHAPES.map((shape) => <button key={shape} onClick={() => addObject(shape)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs capitalize text-slate-700 hover:bg-slate-50"><Plus size={13} /> {shape}</button>)}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Scene objects <span className="font-normal text-slate-400">{objects.length}</span></h2>
            <div className="max-h-36 space-y-1 overflow-auto">
              {objects.map((item) => <div key={item.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${item.id === selectedId ? "bg-slate-100" : ""}`}>
                <button onClick={() => setSelectedId(item.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate">{item.name}</span></button>
                <button aria-label={`Delete ${item.name}`} onClick={() => { setObjects((current) => current.filter((object) => object.id !== item.id)); if (selectedId === item.id) setSelectedId(null); }} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>)}
              {!objects.length && <p className="py-3 text-xs text-slate-400">Add a shape to start composing.</p>}
            </div>
          </section>

          {selected && <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Box size={15} /> Edit {selected.name}</h2>
            <div className="mb-3 flex gap-2">{COLORS.map((color) => <button key={color} aria-label={`Set color ${color}`} onClick={() => updateSelected({ color })} className={`h-6 w-6 rounded-full border-2 ${selected.color === color ? "border-slate-900" : "border-white"}`} style={{ backgroundColor: color }} />)}</div>
            <label className="block text-xs text-slate-500">Size <span className="float-right text-slate-800">{selected.scale.toFixed(1)}</span><input className="mt-1 w-full accent-slate-800" type="range" min="0.35" max="2" step="0.05" value={selected.scale} onChange={(event) => updateSelected({ scale: Number(event.target.value) })} /></label>
            {(["x", "y", "z"] as const).map((axis, index) => <label key={axis} className="mt-3 block text-xs uppercase text-slate-500">{axis} position <span className="float-right text-slate-800">{selected.position[index].toFixed(1)}</span><input className="mt-1 w-full accent-slate-800" type="range" min={axis === "y" ? "0.2" : "-3"} max={axis === "y" ? "3.5" : "3"} step="0.1" value={selected.position[index]} onChange={(event) => { const position = [...selected.position] as SceneObject["position"]; position[index] = Number(event.target.value); updateSelected({ position }); }} /></label>)}
          </section>}

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><LampDesk size={15} /> Lighting</h2>
            <select value={mood} onChange={(event) => setMood(event.target.value as Mood)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              {MOODS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </section>
        </aside>
      </div>

      <section className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="scene-brief" className="mb-1 block text-sm font-semibold">What are you creating?</label>
          <textarea id="scene-brief" value={brief} onChange={(event) => setBrief(event.target.value)} rows={2} maxLength={800} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-500" placeholder="Describe the product, subject, and atmosphere..." />
          <p className="mt-1 text-xs text-slate-400">Your 3D layout guides the prompt; the AI render may interpret exact geometry differently.</p>
        </div>
        <button disabled={!brief.trim() || generating} onClick={renderScene} className="inline-flex h-fit items-center justify-center gap-2 self-end rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {generating ? "Rendering..." : "Generate render"}
        </button>
      </section>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {render && <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Camera size={15} /> Generated render</div><img src={render} alt="AI render of the composed scene" className="mx-auto max-h-[680px] w-full rounded-xl object-contain" /></section>}
    </main>
  );
}
