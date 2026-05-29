type Intensity = "subtle" | "full" | "cinematic";

type Props = {
  /** Grade strength. "subtle" for busy UI, "cinematic" for hero scenes. */
  intensity?: Intensity;
  /** Faint cyan/magenta edge bleed. On by default. */
  aberration?: boolean;
  className?: string;
};

/**
 * SceneFX — the single "house grade" overlay laid over every piece of artwork
 * (pixel office, cutscenes, property stills, the 3D nebula) so they all read as
 * one Akira-vapor CRT world. Absolutely positioned, pointer-events:none, sits
 * above the scene art but below interactive UI. Mount inside a `position:
 * relative` (or absolute/fixed) container.
 *
 * All layers are built on filter / box-shadow / animation, so the global
 * `.low-gfx` mode strips them automatically with no extra wiring.
 */
export function SceneFX({ intensity = "full", aberration = true, className = "" }: Props) {
  return (
    <div className={`scene-fx ${className}`} data-fx={intensity} aria-hidden="true">
      <div className="scene-fx-bloom" />
      <div className="scene-fx-vignette" />
      <div className="scene-fx-scanlines" />
      {aberration && <div className="scene-fx-aberration" />}
      <div className="scene-fx-grain" />
    </div>
  );
}

export default SceneFX;
