/**
 * Sağlayıcı hız sınırı için token bucket (docs/04 §Hız sınırı). Adaptör her çağrıdan önce
 * `await bucket.take()` çağırır; kova boşsa yeni jeton gelene kadar bekler.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  private refill() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSecond);
    this.last = t;
  }

  /** Jeton varsa hemen alır (true), yoksa false. */
  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  async take(): Promise<void> {
    while (!this.tryTake()) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillPerSecond) * 1000);
      await this.sleep(Math.max(waitMs, 1));
    }
  }
}
