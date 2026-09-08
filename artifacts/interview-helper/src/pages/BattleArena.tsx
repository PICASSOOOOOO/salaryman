/**
 * BattleArena — the staged battle scene.
 *
 * A self-contained, cinematic, zoomed-in combat arena rendered as a sub-scene
 * overlay (same pattern as ArcadeGame): it runs its OWN requestAnimationFrame
 * loop on its OWN canvas and never touches the world engine. WorldPlay freezes
 * the world (frozenRef) and mounts this for the duration of a staged fight.
 *
 * Combat reuses the shared pure helpers in combat-system.ts (combo / stamina /
 * block-parry / gear math) so an arena fight resolves with the same numbers as
 * open-world combat once did. Controls mirror the world's: WASD move, Space
 * melee combo, click / F ranged, Shift block + parry, C sneak, E stealth steal.
 *
 * On mount it ducks the ambient music channel and boosts a randomly chosen
 * high-intensity OST track; on unmount it restores the player's audio settings.
 *
 * Outcomes (win / lose / flee) are reported through onOutcome so the host can
 * advance story progression, grant rewards, and apply HP.
 */

import { useEffect, useRef } from "react";
import {
  type BattleDescriptor,
  type BattlePlayerInit,
  type BattleOutcome,
  type BattleResult,
  type ResolvedEnemy,
  resolveEnemy,
  pickBattleTrack,
} from "../lib/battle-system";
import {
  makeCombo,
  makeStamina,
  registerComboHit,
  resetCombo,
  comboDamageMultiplier,
  resolveBlock,
  applyBlockHit,
  trySpendAttackStamina,
  tickStaminaRegen,
  gearMagicMultiplier,
  gearDefenseMultiplier,
  COMBAT_CONSTANTS,
  type ComboState,
  type StaminaState,
} from "../lib/combat-system";
import {
  getAudioSettings,
  setAudioSettings,
  subscribeAudioSettings,
  channelGain,
  type AudioSettings,
} from "../lib/audio-settings";
import {
  sfxAttack,
  sfxHit,
  sfxKill,
  sfxExplosion,
  sfxStep,
  sfxError,
  sfxCoin,
} from "../soundEngine";

interface BattleArenaProps {
  descriptor: BattleDescriptor;
  player: BattlePlayerInit;
  onOutcome: (outcome: BattleOutcome) => void;
}

const ARENA_W = 900;
const ARENA_H = 600;
const PLAYER_R = 16;
const PLAYER_SPEED = 2.6;
const PLAYER_MELEE_RANGE = 50;
const PLAYER_RANGED_CD = 22; // frames
const STEAL_RANGE = 40;
const STEAL_CD = 90;
const INTRO_MS = 1900;
const OUTRO_MS = 2200;

type Phase = "intro" | "fight" | "win" | "lose" | "flee";

interface ArenaEnemy {
  def: ResolvedEnemy;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackCd: number;
  windup: number;
  hitFlash: number;
  stagger: number;
  aware: boolean;
  dead: boolean;
}

interface Projectile {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  dmg: number;
  fromEnemy: boolean;
  color: string;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

const THEME_BG: Record<string, [string, string]> = {
  dojo: ["#1a1410", "#0a0806"],
  street: ["#0e1320", "#05080f"],
  tower: ["#160d1f", "#070410"],
  waste: ["#1a160e", "#0a0805"],
};

export default function BattleArena({ descriptor, player, onOutcome }: BattleArenaProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Audio: duck ambient, boost a random battle track ────────────────────
    const savedAudio: AudioSettings = { ...getAudioSettings() };
    setAudioSettings({ music: Math.min(savedAudio.music, 0.06) });
    const battleAudio = new Audio(pickBattleTrack());
    battleAudio.loop = true;
    // The battle track lives on the SOUNDTRACK channel (it IS a callhome track).
    // Drive its gain off channelGain("soundtrack"), which already bundles the
    // user's soundtrack slider × master × voice-priority ducking — then apply a
    // battle-context boost so it reads as prominent over the distant-radio level.
    // This keeps the soundtrack slider effective, honors mute, and ducks to
    // silence whenever a voice (Pablo/NPC/phone) is speaking.
    const BATTLE_TRACK_BOOST = 4;
    const applyBattleVol = (s: AudioSettings) => {
      battleAudio.volume = s.muted ? 0 : Math.max(0, Math.min(1, channelGain("soundtrack") * BATTLE_TRACK_BOOST));
    };
    applyBattleVol(getAudioSettings());
    // subscribeAudioSettings ALSO re-fires on voice-priority changes, so this
    // re-reads channelGain (with its duck factor) on every duck/un-duck.
    const unsubAudio = subscribeAudioSettings(applyBattleVol);
    battleAudio.play().catch(() => { /* autoplay may be blocked until a gesture */ });

    // ── State ────────────────────────────────────────────────────────────────
    const startTime = performance.now();
    let phase: Phase = "intro";
    let phaseEndAt = 0;
    let reported = false;
    let lastTs = startTime;
    let frame = 0;

    const totalEnemies = descriptor.enemies.length;
    const enemies: ArenaEnemy[] = descriptor.enemies.map((spec, i) => {
      const def = resolveEnemy(spec);
      const angle = (i / Math.max(1, totalEnemies)) * Math.PI - Math.PI / 2;
      const spread = totalEnemies > 1 ? 220 : 0;
      return {
        def,
        x: ARENA_W / 2 + Math.cos(angle) * spread,
        y: ARENA_H * 0.32 + Math.sin(angle) * 60,
        hp: def.hp,
        maxHp: def.hp,
        attackCd: 30 + i * 12,
        windup: 0,
        hitFlash: 0,
        stagger: 0,
        aware: false,
        dead: false,
      };
    });

    const pl = {
      x: ARENA_W / 2,
      y: ARENA_H * 0.78,
      hp: player.hp,
      maxHp: player.maxHp,
      faceX: 0,
      faceY: -1,
      aimX: ARENA_W / 2,
      aimY: 0,
      invincible: 0,
      attackAnim: 0,
      attackHitDone: false,
      blocking: false,
      blockStartedAt: undefined as number | undefined,
      sneaking: false,
      stealCd: 0,
      rangedCd: 0,
      hitFlash: 0,
    };
    const combo: ComboState = makeCombo();
    const stamina: StaminaState = makeStamina();
    const projectiles: Projectile[] = [];
    const floaters: Floater[] = [];
    let cam = { x: ARENA_W / 2, y: ARENA_H / 2, zoom: 1.6, shake: 0 };
    let hitStopUntil = 0;
    let enemiesDefeated = 0;

    const keys = new Set<string>();
    let usingMouseAim = false;

    // ── Helpers ────────────────────────────────────────────────────────────
    const addFloater = (x: number, y: number, text: string, color: string) => {
      floaters.push({ x, y, text, color, life: 40, maxLife: 40 });
    };

    const finish = (result: BattleResult) => {
      if (phase === "win" || phase === "lose" || phase === "flee") return;
      phase = result;
      phaseEndAt = performance.now() + OUTRO_MS;
      if (result === "win") sfxExplosion(0.8);
      else if (result === "lose") sfxError();
    };

    const livingEnemies = () => enemies.filter((e) => !e.dead);

    const nearestEnemy = (): ArenaEnemy | null => {
      let best: ArenaEnemy | null = null;
      let bd = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - pl.x, e.y - pl.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    };

    // ── Combat actions ──────────────────────────────────────────────────────
    const doMelee = () => {
      if (phase !== "fight" || pl.attackAnim > 0) return;
      if (!trySpendAttackStamina(stamina)) { sfxError(); return; }
      pl.attackAnim = 16;
      pl.attackHitDone = false;
      sfxAttack();
    };

    const resolveMeleeHit = () => {
      const arc = 0.4; // dot threshold for the swing cone
      let hitAny = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - pl.x;
        const dy = e.y - pl.y;
        const d = Math.hypot(dx, dy);
        if (d > PLAYER_MELEE_RANGE + e.def.size) continue;
        const dot = (dx / (d || 1)) * pl.faceX + (dy / (d || 1)) * pl.faceY;
        if (dot < arc) continue;
        hitAny = true;
        const step = registerComboHit(combo);
        const backstab = pl.sneaking && !e.aware;
        let dmg = player.meleeAttack * comboDamageMultiplier(step) * gearMagicMultiplier(player.gear);
        if (backstab) dmg *= 2.2;
        e.hp -= dmg;
        e.hitFlash = 6;
        e.stagger = backstab ? 24 : 12;
        e.aware = true;
        const ang = Math.atan2(dy, dx);
        e.x += Math.cos(ang) * (backstab ? 14 : 8);
        e.y += Math.sin(ang) * (backstab ? 14 : 8);
        addFloater(e.x, e.y - e.def.size - 6, `${backstab ? "STEALTH " : ""}-${Math.floor(dmg)}`, backstab ? "#a78bfa" : "#fbbf24");
        cam.shake = Math.max(cam.shake, backstab ? 9 : 5);
        hitStopUntil = performance.now() + (dmg >= COMBAT_CONSTANTS.HEAVY_HIT_THRESHOLD ? 110 : 45);
        if (e.hp <= 0) killEnemy(e);
      }
      if (hitAny) sfxHit();
      else resetCombo(combo);
    };

    const killEnemy = (e: ArenaEnemy) => {
      if (e.dead) return;
      e.dead = true;
      e.hp = 0;
      enemiesDefeated++;
      sfxKill();
      addFloater(e.x, e.y - e.def.size, "DOWN", "#f87171");
      cam.shake = Math.max(cam.shake, 7);
      if (livingEnemies().length === 0) finish("win");
    };

    const doRanged = () => {
      if (phase !== "fight" || !player.hasRanged || pl.rangedCd > 0) return;
      pl.rangedCd = PLAYER_RANGED_CD;
      let ang: number;
      if (usingMouseAim) ang = Math.atan2(pl.aimY - pl.y, pl.aimX - pl.x);
      else {
        const tgt = nearestEnemy();
        ang = tgt ? Math.atan2(tgt.y - pl.y, tgt.x - pl.x) : Math.atan2(pl.faceY, pl.faceX);
      }
      const dmg = player.rangedAttack * gearMagicMultiplier(player.gear);
      projectiles.push({ x: pl.x, y: pl.y, dx: Math.cos(ang) * 9, dy: Math.sin(ang) * 9, life: 70, dmg, fromEnemy: false, color: "#38bdf8" });
      sfxAttack();
    };

    const doSteal = () => {
      if (phase !== "fight" || !pl.sneaking || pl.stealCd > 0) return;
      let target: ArenaEnemy | null = null;
      let bd = STEAL_RANGE;
      for (const e of enemies) {
        if (e.dead || e.aware) continue;
        const d = Math.hypot(e.x - pl.x, e.y - pl.y);
        if (d < bd) { bd = d; target = e; }
      }
      if (!target) { sfxError(); return; }
      pl.stealCd = STEAL_CD;
      const dmg = player.meleeAttack * 2.6 * gearMagicMultiplier(player.gear);
      target.hp -= dmg;
      target.stagger = 40;
      target.hitFlash = 8;
      addFloater(target.x, target.y - target.def.size - 6, `TAKEDOWN -${Math.floor(dmg)}`, "#a78bfa");
      sfxCoin();
      cam.shake = Math.max(cam.shake, 8);
      if (target.hp <= 0) killEnemy(target);
    };

    // ── Input ──────────────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (keys.has(k)) return;
      keys.add(k);
      if (k === " ") doMelee();
      else if (k === "f") doRanged();
      else if (k === "c") pl.sneaking = !pl.sneaking;
      else if (k === "e") doSteal();
      else if (k === "shift") { pl.blocking = true; pl.blockStartedAt = performance.now(); }
      else if (k === "escape" && descriptor.allowFlee) finish("flee");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.delete(k);
      if (k === "shift") { pl.blocking = false; pl.blockStartedAt = undefined; }
    };
    const screenToArena = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const sx = (clientX - rect.left) * (canvas.width / rect.width) / dpr;
      const sy = (clientY - rect.top) * (canvas.height / rect.height) / dpr;
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      return {
        x: cam.x + (sx - cw / 2) / cam.zoom,
        y: cam.y + (sy - ch / 2) / cam.zoom,
      };
    };
    const onMouseMove = (e: MouseEvent) => {
      usingMouseAim = true;
      const a = screenToArena(e.clientX, e.clientY);
      pl.aimX = a.x; pl.aimY = a.y;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { pl.blocking = true; pl.blockStartedAt = performance.now(); return; }
      const a = screenToArena(e.clientX, e.clientY);
      pl.aimX = a.x; pl.aimY = a.y; usingMouseAim = true;
      doRanged();
    };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 2) { pl.blocking = false; pl.blockStartedAt = undefined; } };
    const onContext = (e: Event) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("contextmenu", onContext);

    // ── Sizing ────────────────────────────────────────────────────────────
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // ── Player damage application (respects block / parry / gear) ───────────
    const hurtPlayer = (raw: number, fromX: number, fromY: number) => {
      if (pl.invincible > 0) return;
      let dmg = raw;
      if (pl.blocking) {
        const r = resolveBlock(raw, pl.blockStartedAt);
        if (r.outcome === "parry") {
          addFloater(pl.x, pl.y - PLAYER_R - 6, "PARRY!", "#22d3ee");
          // counter: stagger nearby attacker
          const ne = nearestEnemy();
          if (ne) { ne.stagger = 30; ne.hitFlash = 6; }
          stamina.current = Math.min(COMBAT_CONSTANTS.STAMINA_MAX, stamina.current + 15);
          cam.shake = Math.max(cam.shake, 6);
          pl.invincible = 24;
          return;
        }
        // ordinary block
        const held = applyBlockHit(stamina);
        dmg = r.damage;
        if (!held) {
          addFloater(pl.x, pl.y - PLAYER_R - 6, "GUARD BROKEN", "#f59e0b");
          pl.blocking = false; pl.blockStartedAt = undefined;
          dmg = raw * 0.6;
        } else {
          addFloater(pl.x, pl.y - PLAYER_R - 6, "BLOCK", "#94a3b8");
        }
      }
      dmg *= gearDefenseMultiplier(player.gear);
      pl.hp = Math.max(0, pl.hp - dmg);
      pl.invincible = 26;
      pl.hitFlash = 6;
      if (dmg >= 1) addFloater(pl.x, pl.y - PLAYER_R - 6, `-${Math.floor(dmg)}`, "#f87171");
      const ang = Math.atan2(pl.y - fromY, pl.x - fromX);
      pl.x += Math.cos(ang) * 6; pl.y += Math.sin(ang) * 6;
      cam.shake = Math.max(cam.shake, 5);
      sfxHit();
      if (pl.hp <= 0) finish("lose");
    };

    // ── Simulation step ─────────────────────────────────────────────────────
    const step = (now: number, dtFactor: number) => {
      frame++;
      // intro / outro timing
      if (phase === "intro" && now - startTime >= INTRO_MS) phase = "fight";
      if ((phase === "win" || phase === "lose" || phase === "flee") && now >= phaseEndAt) {
        cancelAnimationFrame(rafRef.current);
        reportOutcome();
        return;
      }
      tickStaminaRegen(stamina, pl.blocking, now);
      if (pl.invincible > 0) pl.invincible -= 1;
      if (pl.rangedCd > 0) pl.rangedCd -= 1;
      if (pl.stealCd > 0) pl.stealCd -= 1;
      if (pl.hitFlash > 0) pl.hitFlash -= 1;

      const frozen = phase !== "fight" || now < hitStopUntil;

      // ── Player movement / facing ──────────────────────────────────────────
      if (!frozen) {
        let mx = 0, my = 0;
        if (keys.has("w") || keys.has("arrowup")) my -= 1;
        if (keys.has("s") || keys.has("arrowdown")) my += 1;
        if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
        if (keys.has("d") || keys.has("arrowright")) mx += 1;
        const moving = mx !== 0 || my !== 0;
        if (moving) {
          const m = Math.hypot(mx, my) || 1;
          const spd = PLAYER_SPEED * (pl.blocking ? 0.4 : pl.sneaking ? 0.55 : 1) * dtFactor;
          pl.x += (mx / m) * spd;
          pl.y += (my / m) * spd;
          if (!usingMouseAim) { pl.faceX = mx / m; pl.faceY = my / m; }
          if (frame % 16 === 0) sfxStep(0.25);
        }
        // facing toward aim (semi-autonomous: auto-face nearest if idle aim)
        if (usingMouseAim) {
          const a = Math.atan2(pl.aimY - pl.y, pl.aimX - pl.x);
          pl.faceX = Math.cos(a); pl.faceY = Math.sin(a);
        } else if (!moving) {
          const ne = nearestEnemy();
          if (ne) { const a = Math.atan2(ne.y - pl.y, ne.x - pl.x); pl.faceX = Math.cos(a); pl.faceY = Math.sin(a); }
        }
        // clamp to arena
        pl.x = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, pl.x));
        pl.y = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, pl.y));
      }

      // ── Player attack animation hit frame ─────────────────────────────────
      if (pl.attackAnim > 0) {
        pl.attackAnim -= 1;
        if (pl.attackAnim <= 9 && !pl.attackHitDone) { pl.attackHitDone = true; resolveMeleeHit(); }
      }

      // ── Enemy AI ──────────────────────────────────────────────────────────
      if (!frozen) {
        for (const e of enemies) {
          if (e.dead) continue;
          if (e.hitFlash > 0) e.hitFlash -= 1;
          if (e.stagger > 0) { e.stagger -= 1; continue; }
          const dx = pl.x - e.x;
          const dy = pl.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const detectRange = (pl.sneaking ? 140 : 320);
          if (d < detectRange) e.aware = true;
          if (!e.aware) continue;
          const ang = Math.atan2(dy, dx);

          if (e.windup > 0) {
            e.windup -= 1;
            if (e.windup === 0) {
              if (d < e.def.range + PLAYER_R) hurtPlayer(e.def.damage, e.x, e.y);
              e.attackCd = e.def.attackCd;
            }
            continue;
          }
          if (e.attackCd > 0) e.attackCd -= 1;

          if (e.def.ranged) {
            // keep distance, shoot
            const ideal = e.def.range * 0.6;
            if (d < ideal * 0.7) { e.x -= Math.cos(ang) * e.def.speed * dtFactor; e.y -= Math.sin(ang) * e.def.speed * dtFactor; }
            else if (d > e.def.range) { e.x += Math.cos(ang) * e.def.speed * dtFactor; e.y += Math.sin(ang) * e.def.speed * dtFactor; }
            else { // strafe
              e.x += Math.cos(ang + Math.PI / 2) * e.def.speed * 0.5 * dtFactor;
              e.y += Math.sin(ang + Math.PI / 2) * e.def.speed * 0.5 * dtFactor;
            }
            if (e.attackCd <= 0 && d < e.def.range) {
              e.attackCd = e.def.attackCd;
              projectiles.push({ x: e.x, y: e.y, dx: Math.cos(ang) * 5.5, dy: Math.sin(ang) * 5.5, life: 90, dmg: e.def.damage, fromEnemy: true, color: e.def.color });
            }
          } else {
            // melee: chase then windup
            if (d > e.def.range) { e.x += Math.cos(ang) * e.def.speed * dtFactor; e.y += Math.sin(ang) * e.def.speed * dtFactor; }
            else if (e.attackCd <= 0) { e.windup = e.def.windup; }
          }
          e.x = Math.max(e.def.size, Math.min(ARENA_W - e.def.size, e.x));
          e.y = Math.max(e.def.size, Math.min(ARENA_H - e.def.size, e.y));
        }
      }

      // ── Projectiles ───────────────────────────────────────────────────────
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        if (!frozen) { p.x += p.dx * dtFactor; p.y += p.dy * dtFactor; p.life -= 1; }
        let hit = false;
        if (p.fromEnemy) {
          if (Math.hypot(p.x - pl.x, p.y - pl.y) < PLAYER_R + 4) { hurtPlayer(p.dmg, p.x, p.y); hit = true; }
        } else {
          for (const e of enemies) {
            if (e.dead) continue;
            if (Math.hypot(p.x - e.x, p.y - e.y) < e.def.size + 4) {
              e.hp -= p.dmg; e.hitFlash = 6; e.aware = true; e.stagger = Math.max(e.stagger, 6);
              addFloater(e.x, e.y - e.def.size - 6, `-${Math.floor(p.dmg)}`, "#7dd3fc");
              sfxHit();
              if (e.hp <= 0) killEnemy(e);
              hit = true; break;
            }
          }
        }
        if (hit || p.life <= 0 || p.x < 0 || p.x > ARENA_W || p.y < 0 || p.y > ARENA_H) projectiles.splice(i, 1);
      }

      // ── Floaters / camera ─────────────────────────────────────────────────
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.y -= 0.5 * dtFactor; f.life -= 1;
        if (f.life <= 0) floaters.splice(i, 1);
      }
      // dynamic camera: frame the action between player and nearest enemy
      const ne = nearestEnemy();
      const tx = ne ? (pl.x + ne.x) / 2 : pl.x;
      const ty = ne ? (pl.y + ne.y) / 2 : pl.y;
      cam.x += (tx - cam.x) * 0.08;
      cam.y += (ty - cam.y) * 0.08;
      const targetZoom = phase === "intro" ? 2.1 : ne ? Math.max(1.25, 1.9 - Math.hypot(pl.x - ne.x, pl.y - ne.y) / 700) : 1.6;
      cam.zoom += (targetZoom - cam.zoom) * 0.05;
      if (cam.shake > 0) cam.shake *= 0.85;
    };

    const reportOutcome = () => {
      // Hard one-shot guard: rewards / story progression must fire exactly once,
      // even if render or RAF timing ever re-enters this path.
      if (reported) return;
      reported = true;
      const result: BattleResult = phase === "win" ? "win" : phase === "flee" ? "flee" : "lose";
      onOutcomeRef.current({
        battleId: descriptor.id,
        result,
        enemiesDefeated,
        totalEnemies,
        playerHpRemaining: Math.max(0, Math.floor(pl.hp)),
        storyFlag: descriptor.storyFlag,
        rewards: result === "win" ? descriptor.rewards : undefined,
      });
    };

    // ── Render ───────────────────────────────────────────────────────────────
    const draw = (now: number) => {
      const cw = canvas.width / dpr;
      const ch = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const theme = THEME_BG[descriptor.arenaTheme ?? "street"] ?? THEME_BG.street;
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      bg.addColorStop(0, theme[0]); bg.addColorStop(1, theme[1]);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);

      // world transform
      ctx.save();
      const shX = (Math.random() - 0.5) * cam.shake;
      const shY = (Math.random() - 0.5) * cam.shake;
      ctx.translate(cw / 2 + shX, ch / 2 + shY);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // arena floor grid
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.strokeStyle = "rgba(120,140,180,0.10)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= ARENA_W; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ARENA_H); ctx.stroke(); }
      for (let gy = 0; gy <= ARENA_H; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(ARENA_W, gy); ctx.stroke(); }
      ctx.strokeStyle = "rgba(56,189,248,0.25)";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);

      // shadows
      for (const e of enemies) {
        if (e.dead) continue;
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath(); ctx.ellipse(e.x, e.y + e.def.size * 0.8, e.def.size * 0.9, e.def.size * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.ellipse(pl.x, pl.y + PLAYER_R * 0.8, PLAYER_R * 0.9, PLAYER_R * 0.35, 0, 0, Math.PI * 2); ctx.fill();

      // enemies
      for (const e of enemies) {
        if (e.dead) continue;
        const flash = e.hitFlash > 0;
        ctx.fillStyle = flash ? "#ffffff" : e.def.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(e.x - 6, e.y - 4, 4, 5); ctx.fillRect(e.x + 2, e.y - 4, 4, 5);
        if (e.windup > 0) { // telegraph
          ctx.strokeStyle = "rgba(248,113,113,0.9)"; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.def.size + 6 + Math.sin(now / 60) * 2, 0, Math.PI * 2); ctx.stroke();
        }
        // hp pip (non-boss)
        if (!e.def.boss) {
          const w = e.def.size * 2;
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(e.x - w / 2, e.y - e.def.size - 10, w, 4);
          ctx.fillStyle = "#f87171"; ctx.fillRect(e.x - w / 2, e.y - e.def.size - 10, w * Math.max(0, e.hp / e.maxHp), 4);
        }
        if (!e.aware) {
          ctx.fillStyle = "rgba(167,139,250,0.9)"; ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillText("?", e.x, e.y - e.def.size - 14);
        }
      }

      // player
      ctx.globalAlpha = pl.sneaking ? 0.55 : 1;
      ctx.fillStyle = pl.hitFlash > 0 ? "#ffffff" : "#e2e8f0";
      ctx.beginPath(); ctx.arc(pl.x, pl.y, PLAYER_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath(); ctx.arc(pl.x + pl.faceX * 6, pl.y + pl.faceY * 6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // melee arc
      if (pl.attackAnim > 0) {
        const a0 = Math.atan2(pl.faceY, pl.faceX);
        const prog = 1 - pl.attackAnim / 16;
        ctx.strokeStyle = "rgba(251,191,36,0.85)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pl.x, pl.y, PLAYER_MELEE_RANGE * 0.85, a0 - 0.7 + prog * 1.4, a0 - 0.4 + prog * 1.4); ctx.stroke();
      }
      // block shield
      if (pl.blocking) {
        const a0 = Math.atan2(pl.faceY, pl.faceX);
        ctx.strokeStyle = "rgba(56,189,248,0.85)"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(pl.x, pl.y, PLAYER_R + 8, a0 - 0.9, a0 + 0.9); ctx.stroke();
      }

      // projectiles
      for (const p of projectiles) {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      }
      // floaters
      ctx.textAlign = "center";
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color; ctx.font = "bold 13px monospace";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // ── vignette ─────────────────────────────────────────────────────────
      const vg = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, ch * 0.8);
      vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);

      drawHud(cw, ch, now);
    };

    const drawHud = (cw: number, ch: number, now: number) => {
      ctx.textAlign = "left";
      // title strip
      ctx.fillStyle = "rgba(56,189,248,0.9)";
      ctx.font = "bold 16px 'Fira Code', monospace";
      ctx.fillText(descriptor.title, 20, 30);
      ctx.fillStyle = "rgba(226,232,240,0.55)";
      ctx.font = "12px monospace";
      ctx.fillText(`ENEMIES ${livingEnemies().length}/${totalEnemies}`, 20, 48);

      // player HP bar
      const barW = 240, barH = 16, bx = 20, by = ch - 70;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#22c55e"; ctx.fillRect(bx, by, barW * Math.max(0, pl.hp / pl.maxHp), barH);
      ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, barW, barH);
      ctx.fillStyle = "#fff"; ctx.font = "11px monospace";
      ctx.fillText(`HP ${Math.ceil(pl.hp)}/${pl.maxHp}`, bx + 6, by + 12);
      // stamina bar
      const sy2 = by + 22;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, sy2, barW, 8);
      ctx.fillStyle = "#fbbf24"; ctx.fillRect(bx, sy2, barW * (stamina.current / COMBAT_CONSTANTS.STAMINA_MAX), 8);
      // combo
      if (combo.count > 1) {
        ctx.fillStyle = "#f59e0b"; ctx.font = "bold 22px 'Fira Code', monospace"; ctx.textAlign = "left";
        ctx.fillText(`${combo.count}x COMBO`, bx, by - 12);
      }
      // status chips
      ctx.textAlign = "right"; ctx.font = "11px monospace";
      if (pl.sneaking) { ctx.fillStyle = "#a78bfa"; ctx.fillText("● SNEAKING", cw - 20, ch - 64); }
      if (pl.blocking) { ctx.fillStyle = "#38bdf8"; ctx.fillText("● GUARD", cw - 20, ch - 50); }

      // boss bar
      const boss = enemies.find((e) => e.def.boss && !e.dead);
      if (boss) {
        const bw = Math.min(420, cw - 80), bbx = (cw - bw) / 2, bby = 60;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bbx, bby, bw, 12);
        ctx.fillStyle = "#ef4444"; ctx.fillRect(bbx, bby, bw * Math.max(0, boss.hp / boss.maxHp), 12);
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.strokeRect(bbx, bby, bw, 12);
        ctx.fillStyle = "#fca5a5"; ctx.font = "12px 'Fira Code',monospace"; ctx.textAlign = "center";
        ctx.fillText(boss.def.name, cw / 2, bby - 4);
      }

      // intro card
      if (phase === "intro") {
        const t = (now - startTime) / INTRO_MS;
        ctx.fillStyle = `rgba(0,0,0,${0.6 * (1 - t)})`; ctx.fillRect(0, 0, cw, ch);
        ctx.textAlign = "center";
        ctx.fillStyle = "#38bdf8"; ctx.font = "bold 40px 'Fira Code', monospace";
        ctx.fillText(descriptor.title, cw / 2, ch / 2 - 10);
        if (descriptor.subtitle) { ctx.fillStyle = "rgba(226,232,240,0.7)"; ctx.font = "16px monospace"; ctx.fillText(descriptor.subtitle, cw / 2, ch / 2 + 24); }
        if (t > 0.7) { ctx.fillStyle = "#fbbf24"; ctx.font = "bold 28px 'Fira Code',monospace"; ctx.fillText("FIGHT!", cw / 2, ch / 2 + 70); }
      }
      // outro card
      if (phase === "win" || phase === "lose" || phase === "flee") {
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, cw, ch);
        ctx.textAlign = "center";
        const label = phase === "win" ? "VICTORY" : phase === "flee" ? "WITHDREW" : "DEFEATED";
        const col = phase === "win" ? "#22c55e" : phase === "flee" ? "#94a3b8" : "#ef4444";
        ctx.fillStyle = col; ctx.font = "bold 48px 'Fira Code', monospace";
        ctx.fillText(label, cw / 2, ch / 2);
      }
      // controls hint
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(148,163,184,0.6)"; ctx.font = "11px monospace";
      const hint = `WASD MOVE · SPACE STRIKE${player.hasRanged ? " · F/CLICK SHOOT" : ""} · SHIFT GUARD/PARRY · C SNEAK · E TAKEDOWN${descriptor.allowFlee ? " · ESC FLEE" : ""}`;
      ctx.fillText(hint, cw / 2, ch - 16);
    };

    // ── Main loop ────────────────────────────────────────────────────────────
    const loop = (ts: number) => {
      const dt = Math.min(50, ts - lastTs);
      lastTs = ts;
      const dtFactor = dt / (1000 / 60);
      step(ts, dtFactor);
      draw(ts);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── Cleanup ────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("contextmenu", onContext);
      unsubAudio();
      try { battleAudio.pause(); battleAudio.src = ""; } catch { /* noop */ }
      setAudioSettings({ music: savedAudio.music });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor]);

  return (
    <div className="fixed inset-0 z-[120]" style={{ background: "#000" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", touchAction: "none" }} />
    </div>
  );
}
