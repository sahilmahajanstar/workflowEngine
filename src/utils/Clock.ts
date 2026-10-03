export interface IClock {
  now(): number;
}

export class SystemClock implements IClock {
  now(): number {
    return Date.now();
  }
}

export class TestableClock implements IClock {
  private currentTime: number;

  constructor(initialTime: number = 0) {
    this.currentTime = initialTime;
  }

  now(): number {
    return this.currentTime;
  }

  advance(ms: number): void {
    this.currentTime += ms;
  }

  setTime(time: number): void {
    this.currentTime = time;
  }
}

/**
 * Global clock provider. 
 * Use Clock.now() instead of Date.now() throughout the codebase.
 */
export class Clock {
  private static instance: IClock = new SystemClock();

  static get(): IClock {
    return this.instance;
  }

  static set(clock: IClock): void {
    this.instance = clock;
  }

  static now(): number {
    return this.instance.now();
  }

  static reset(): void {
    this.instance = new SystemClock();
  }
}
