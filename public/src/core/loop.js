/**
 * loop.js — fixed-timestep game loop with interpolation and visibility handling.
 *
 * Simulation runs at a fixed 60 Hz so combat frame data (startup / active /
 * recovery) is identical on every display. Rendering happens once per animation
 * frame. A long pause (tab hidden) is clamped so the game never "fast-forwards"
 * a whole match on return.
 */
export const FIXED_DT = 1 / 60;

export class GameLoop {
  constructor({ update, render, maxFrameSkip = 5 }) {
    this.update = update;
    this.render = render;
    this.maxFrameSkip = maxFrameSkip;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.frameHandle = null;
    this.elapsed = 0;
    this.fps = 60;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.scale = 1; // slow-motion / hit-stop multiplier set by the game
    bindVisibility(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const step = (now) => {
      if (!this.running) return;
      this.frameHandle = requestAnimationFrame(step);
      let delta = (now - this.lastTime) / 1000;
      this.lastTime = now;
      if (delta > 0.25) delta = 0.25; // tab was backgrounded
      this.fpsAccum += delta;
      this.fpsFrames += 1;
      if (this.fpsAccum >= 0.5) {
        this.fps = this.fpsFrames / this.fpsAccum;
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }
      this.accumulator += delta * this.scale;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < this.maxFrameSkip) {
        this.update(FIXED_DT, this.elapsed);
        this.elapsed += FIXED_DT;
        this.accumulator -= FIXED_DT;
        steps += 1;
      }
      if (steps === this.maxFrameSkip) this.accumulator = 0;
      this.render(delta, this.elapsed, this.accumulator / FIXED_DT);
    };
    this.frameHandle = requestAnimationFrame(step);
  }

  stop() {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
  }
}

function bindVisibility(loop) {
  document.addEventListener('visibilitychange', () => {
    loop.lastTime = performance.now();
    loop.accumulator = 0;
  });
}
