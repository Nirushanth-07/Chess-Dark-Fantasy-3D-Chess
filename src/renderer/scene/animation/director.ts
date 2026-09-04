/**
 * The cinematic director.
 *
 * Takes ONE `Cinematic` from the queue and plays it out over time by writing
 * into the motion registry. It never touches game state — by the time a
 * cinematic reaches here the move is already committed (PROJECT_PLAN §4.1),
 * which is exactly why "skip animation" can be a single line: jump to the end.
 */

import * as THREE from 'three';
import type { Cinematic, Color, PieceType, Square } from '../../core/types';
import { facingFor, headingBetween, squareToWorld } from '../coords';
import { motionFor, type PieceMotion } from './motion';
import { ATTACK_DURATION, HIT_FRAME, WALK_SPEED } from './poses';

export interface DirectorHooks {
  /** Fired once, at the exact frame a weapon connects. Drives sound + sparks. */
  onImpact?(attacker: PieceType, victim: PieceType, at: THREE.Vector3): void;
  onFootstep?(type: PieceType, at: THREE.Vector3): void;
  onCameraShake?(strength: number): void;
  /** Look up a piece's colour and type; the director stays stateless. */
  describe(id: string): { type: PieceType; color: Color } | null;
}

/** How close the attacker stops to its victim before striking. */
const DUEL_GAP = 0.52;
const SETTLE_TIME = 0.4;
const DEATH_TIME = 0.95;
const FADE_TIME = 0.45;

type Plan =
  | { kind: 'none'; duration: number }
  | {
      kind: 'walk';
      id: string;
      type: PieceType;
      from: THREE.Vector3;
      to: THREE.Vector3;
      yaw: number;
      endYaw: number;
      duration: number;
      arc: boolean;
    }
  | {
      kind: 'duel';
      attacker: string;
      victim: string;
      attackerType: PieceType;
      victimType: PieceType;
      start: THREE.Vector3;
      duelPos: THREE.Vector3;
      dest: THREE.Vector3;
      victimPos: THREE.Vector3;
      attackerYaw: number;
      victimYaw: number;
      approach: number;
      attack: number;
      hitAt: number;
      duration: number;
      impactFired: boolean;
    }
  | {
      kind: 'parallel';
      plans: Plan[];
      duration: number;
    }
  | { kind: 'promote'; id: string; at: THREE.Vector3; duration: number }
  | { kind: 'check'; id: string; duration: number }
  | { kind: 'over'; winner: string | null; loser: string | null; duration: number };

export class CinematicDirector {
  private plan: Plan | null = null;
  private elapsed = 0;
  private speed = 1;
  private animated = true;

  constructor(private hooks: DirectorHooks) {}

  get isPlaying(): boolean {
    return this.plan !== null;
  }

  configure(options: { speed: number; animated: boolean }): void {
    this.speed = Math.max(0.1, options.speed);
    this.animated = options.animated;
  }

  /** Begins a cinematic. Returns its duration in seconds (0 when skipping). */
  start(cinematic: Cinematic, skip: boolean): number {
    this.elapsed = 0;
    this.plan = this.build(cinematic);
    if (skip) {
      // Evaluate the final frame, then report done immediately.
      this.apply(this.plan.duration);
      this.plan = null;
      return 0;
    }
    return this.plan.duration / this.speed;
  }

  /** @returns true when the current cinematic has finished. */
  update(delta: number): boolean {
    if (!this.plan) return true;
    this.elapsed += delta * this.speed;
    const done = this.elapsed >= this.plan.duration;
    this.apply(Math.min(this.elapsed, this.plan.duration));
    if (done) {
      this.plan = null;
      return true;
    }
    return false;
  }

  cancel(): void {
    this.plan = null;
  }

  // -- planning ------------------------------------------------------------

  private build(cinematic: Cinematic): Plan {
    switch (cinematic.kind) {
      case 'move':
        return this.planWalk(cinematic.piece, cinematic.pieceType, cinematic.from, cinematic.to);

      case 'capture':
        return this.planDuel(cinematic);

      case 'castle': {
        const kingInfo = this.hooks.describe(cinematic.king);
        const rookInfo = this.hooks.describe(cinematic.rook);
        const plans = [
          this.planWalk(cinematic.king, kingInfo?.type ?? 'k', cinematic.kingFrom, cinematic.kingTo),
          this.planWalk(cinematic.rook, rookInfo?.type ?? 'r', cinematic.rookFrom, cinematic.rookTo),
        ];
        // Castling reads as one manoeuvre, so both pieces move together.
        return { kind: 'parallel', plans, duration: Math.max(...plans.map((p) => p.duration)) };
      }

      case 'promote':
        return { kind: 'promote', id: cinematic.pawn, at: squareToWorld(cinematic.at), duration: 0.7 };

      case 'check':
        return { kind: 'check', id: cinematic.king, duration: 0.75 };

      case 'gameOver':
        return {
          kind: 'over',
          winner: cinematic.winnerKing,
          loser: null,
          duration: cinematic.winnerKing ? 2.2 : 0.6,
        };
    }
  }

  private planWalk(id: string, type: PieceType, from: Square, to: Square): Plan {
    const info = this.hooks.describe(id);
    const start = squareToWorld(from);
    const end = squareToWorld(to);
    const distance = start.distanceTo(end);
    const speed = this.animated ? WALK_SPEED[type] : 6;
    const duration = this.animated ? Math.max(0.35, distance / speed) : 0.32;

    return {
      kind: 'walk',
      id,
      type,
      from: start,
      to: end,
      yaw: headingBetween(start, end),
      endYaw: facingFor(info?.color ?? 'w'),
      duration,
      // The knight's L-move is a leap, not a walk — PROJECT_PLAN §5.
      arc: type === 'n',
    };
  }

  private planDuel(c: Extract<Cinematic, { kind: 'capture' }>): Plan {
    const start = squareToWorld(c.from);
    const dest = squareToWorld(c.to);
    const victimPos = squareToWorld(c.victimSquare);

    // Stop short of the victim so the two are face to face, not overlapping.
    const approachDir = new THREE.Vector3().subVectors(victimPos, start);
    if (approachDir.lengthSq() < 1e-6) approachDir.set(0, 0, 1);
    approachDir.normalize();
    const duelPos = new THREE.Vector3().copy(victimPos).addScaledVector(approachDir, -DUEL_GAP);

    const attackerYaw = headingBetween(duelPos, victimPos);
    const victimYaw = attackerYaw + Math.PI;

    if (!this.animated) {
      // Classical theme: no duel, just a slide and a fade.
      return {
        kind: 'duel',
        attacker: c.attacker,
        victim: c.victim,
        attackerType: c.attackerType,
        victimType: c.victimType,
        start,
        duelPos: dest,
        dest,
        victimPos,
        attackerYaw: facingFor(this.hooks.describe(c.attacker)?.color ?? 'w'),
        victimYaw,
        approach: 0.32,
        attack: 0,
        hitAt: 0,
        duration: 0.42,
        impactFired: false,
      };
    }

    const approachDistance = start.distanceTo(duelPos);
    const approach = Math.max(0.3, approachDistance / WALK_SPEED[c.attackerType]);
    const attack = ATTACK_DURATION[c.attackerType];
    const hitAt = approach + attack * HIT_FRAME[c.attackerType];

    // The cinematic runs until BOTH the attacker has settled on its square and
    // the victim has finished dying and fading.
    const duration = Math.max(approach + attack + SETTLE_TIME, hitAt + DEATH_TIME + 0.1);

    return {
      kind: 'duel',
      attacker: c.attacker,
      victim: c.victim,
      attackerType: c.attackerType,
      victimType: c.victimType,
      start,
      duelPos,
      dest,
      victimPos,
      attackerYaw,
      victimYaw,
      approach,
      attack,
      hitAt,
      duration,
      impactFired: false,
    };
  }

  // -- evaluation ----------------------------------------------------------

  private apply(t: number): void {
    if (!this.plan) return;
    this.evaluate(this.plan, t);
  }

  private evaluate(plan: Plan, t: number): void {
    switch (plan.kind) {
      case 'none':
        break;

      case 'parallel':
        for (const child of plan.plans) this.evaluate(child, t);
        break;

      case 'walk': {
        const motion = motionFor(plan.id);
        if (!motion) break;
        const u = plan.duration === 0 ? 1 : Math.min(1, t / plan.duration);
        this.moveAlong(motion, plan, u);
        break;
      }

      case 'duel':
        this.evaluateDuel(plan, t);
        break;

      case 'promote': {
        const motion = motionFor(plan.id);
        if (!motion) break;
        const u = Math.min(1, t / plan.duration);
        // Pillar of light: a bright flash that decays as the new piece settles.
        motion.aura = Math.sin(u * Math.PI);
        motion.auraColor.set(0xffe9a8);
        motion.scale = 1 + Math.sin(u * Math.PI) * 0.18;
        if (u >= 1) {
          motion.aura = 0;
          motion.scale = 1;
        }
        break;
      }

      case 'check': {
        const motion = motionFor(plan.id);
        if (!motion) break;
        const u = Math.min(1, t / plan.duration);
        motion.auraColor.set(0xff3320);
        motion.aura = Math.sin(u * Math.PI) * 1.0;
        if (this.animated) {
          motion.pose = 'stagger';
          motion.poseTime = u;
        }
        if (t === 0) this.hooks.onCameraShake?.(0.5);
        if (u >= 1) {
          motion.aura = 0;
          motion.pose = 'idle';
          motion.poseTime = 0;
        }
        break;
      }

      case 'over': {
        if (!plan.winner) break;
        const motion = motionFor(plan.winner);
        if (!motion) break;
        const u = Math.min(1, t / plan.duration);
        motion.auraColor.set(0xffd489);
        motion.aura = Math.min(1, u * 2);
        if (this.animated) {
          motion.pose = 'victory';
          motion.poseTime = t;
        }
        break;
      }
    }
  }

  private moveAlong(motion: PieceMotion, plan: Extract<Plan, { kind: 'walk' }>, u: number): void {
    const eased = u * u * (3 - 2 * u);
    motion.position.lerpVectors(plan.from, plan.to, eased);

    if (plan.arc) {
      // Parabolic hop. The knight is the only piece that leaves the ground.
      motion.position.y = Math.sin(u * Math.PI) * 0.55;
    } else if (!this.animated) {
      motion.position.y = Math.sin(u * Math.PI) * 0.12; // classical pieces are lifted
    }

    motion.visible = true;
    motion.opacity = 1;

    if (this.animated) {
      // Turn to face the direction of travel, then back to face the enemy.
      const turnIn = Math.min(1, u / 0.12);
      const turnOut = Math.max(0, (u - 0.85) / 0.15);
      motion.yaw = lerpAngle(lerpAngle(motion.yaw, plan.yaw, turnIn), plan.endYaw, turnOut);
      motion.pose = u >= 1 ? 'idle' : 'walk';
      motion.poseTime = u >= 1 ? 0 : (plan.duration * u) % 100;

      if (plan.arc) {
        motion.pose = u >= 1 ? 'idle' : 'attack'; // the tucked leap silhouette
        motion.poseTime = u >= 1 ? 0 : u * 0.5;
      }
    } else {
      motion.yaw = plan.endYaw;
    }

    if (u >= 1) {
      motion.position.copy(plan.to);
      motion.position.y = 0;
      motion.yaw = plan.endYaw;
      motion.pose = 'idle';
    }
  }

  private evaluateDuel(plan: Extract<Plan, { kind: 'duel' }>, t: number): void {
    const attacker = motionFor(plan.attacker);
    const victim = motionFor(plan.victim);

    // -- attacker ----------------------------------------------------------
    if (attacker) {
      if (t < plan.approach) {
        const u = plan.approach === 0 ? 1 : t / plan.approach;
        const eased = u * u * (3 - 2 * u);
        attacker.position.lerpVectors(plan.start, plan.duelPos, eased);
        attacker.position.y = plan.attackerType === 'n' && this.animated ? Math.sin(u * Math.PI) * 0.5 : 0;
        if (this.animated) {
          attacker.yaw = lerpAngle(attacker.yaw, plan.attackerYaw, Math.min(1, u / 0.15));
          attacker.pose = 'walk';
          attacker.poseTime = t;
        } else {
          attacker.position.y = Math.sin(u * Math.PI) * 0.12;
        }
      } else if (t < plan.approach + plan.attack) {
        const u = plan.attack === 0 ? 1 : (t - plan.approach) / plan.attack;
        attacker.position.copy(plan.duelPos);
        attacker.position.y = 0;
        attacker.yaw = plan.attackerYaw;
        attacker.pose = 'attack';
        attacker.poseTime = u;
      } else {
        // Step onto the captured square.
        const u = Math.min(1, (t - plan.approach - plan.attack) / SETTLE_TIME);
        const eased = u * u * (3 - 2 * u);
        attacker.position.lerpVectors(plan.duelPos, plan.dest, eased);
        attacker.position.y = 0;
        attacker.pose = u >= 1 ? 'idle' : 'walk';
        attacker.poseTime = t;
        if (u >= 1) {
          attacker.position.copy(plan.dest);
          attacker.yaw = facingFor(this.hooks.describe(plan.attacker)?.color ?? 'w');
          attacker.pose = 'idle';
          attacker.poseTime = 0;
        }
      }
      attacker.visible = true;
      attacker.opacity = 1;
    }

    // -- impact ------------------------------------------------------------
    if (!plan.impactFired && t >= plan.hitAt) {
      plan.impactFired = true;
      this.hooks.onImpact?.(plan.attackerType, plan.victimType, plan.victimPos);
      this.hooks.onCameraShake?.(plan.attackerType === 'r' ? 1 : 0.6);
    }

    // -- victim ------------------------------------------------------------
    if (victim) {
      victim.position.copy(plan.victimPos);
      victim.position.y = 0;
      if (this.animated) victim.yaw = plan.victimYaw;

      if (t < plan.hitAt) {
        victim.visible = true;
        victim.opacity = 1;
        victim.pose = 'idle';
      } else {
        const since = t - plan.hitAt;
        const dying = Math.min(1, since / DEATH_TIME);
        if (this.animated) {
          victim.pose = 'death';
          victim.poseTime = dying;
        }
        // Dissolve over the tail of the death — the Tier 0 fallback, reused
        // here so both tiers end the same way (PROJECT_PLAN §5).
        const fadeStart = DEATH_TIME - FADE_TIME;
        const fade = Math.min(1, Math.max(0, (since - fadeStart) / FADE_TIME));
        victim.opacity = 1 - fade;
        victim.scale = 1 - fade * 0.25;
        victim.visible = fade < 1;
        if (fade >= 1) {
          victim.opacity = 0;
          victim.visible = false;
        }
      }
    }
  }
}

/** Shortest-path angular interpolation, so pieces never spin the long way. */
function lerpAngle(from: number, to: number, t: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * Math.min(1, Math.max(0, t));
}
