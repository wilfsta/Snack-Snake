/**
 * Fixed-timestep simulation with requestAnimationFrame rendering.
 * Logic always advances in identical small steps, so gameplay is the same on a 60Hz
 * tablet and a 144Hz monitor; rendering happens once per display frame.
 */
export class GameLoop {
  private rafId: number | null = null;
  private last = 0;
  private accumulator = 0;

  constructor(
    private readonly update: (dtMs: number) => void,
    private readonly render: (frameDtMs: number) => void,
    private readonly stepMs = 1000 / 120,
  ) {}

  start(): void {
    if (this.rafId !== null) return;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private readonly frame = (now: number): void => {
    // Clamp huge gaps (tab switches, debugger pauses) so the game never "teleports".
    const dt = Math.min(now - this.last, 100);
    this.last = now;
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < 16) {
      this.update(this.stepMs);
      this.accumulator -= this.stepMs;
      steps++;
    }
    if (steps >= 16) this.accumulator = 0;
    this.render(dt);
    this.rafId = requestAnimationFrame(this.frame);
  };
}
