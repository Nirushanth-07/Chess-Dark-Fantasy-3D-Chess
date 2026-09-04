/**
 * Impact camera shake. A single decaying scalar the camera rig reads each
 * frame — deliberately module-level so the director can trigger it without
 * threading a callback through the component tree.
 */

let strength = 0;

export function pushShake(amount: number): void {
  strength = Math.min(1.4, strength + amount);
}

/** Advances the decay and returns the current strength. */
export function consumeShake(delta: number): number {
  if (strength <= 0) return 0;
  const current = strength;
  strength = Math.max(0, strength - delta * 3.2);
  return current;
}

export function resetShake(): void {
  strength = 0;
}
