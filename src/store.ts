import { computed, signal } from '@preact/signals';
import { newDay } from './domain/day';
import { shopAt } from './domain/derive';
import { compareEvents, type ShopEvent } from './domain/events';

// One append-only log per shop day. It lives in sessionStorage (so a reload keeps the day) and is
// shared with other tabs over a BroadcastChannel: a new tab asks for the log, every tab merges by
// event id, and a reset replaces the day everywhere. The views only ever read `state`.

type Incoming = ShopEvent extends infer E ? (E extends ShopEvent ? Omit<E, 'id' | 'at'> : never) : never;

type Message =
  | { t: 'hello'; from: string; day: string | null }
  | { t: 'state'; from: string; day: string; fresh: boolean; log: ShopEvent[] }
  | { t: 'events'; from: string; day: string; events: ShopEvent[] }
  | { t: 'reset'; from: string; day: string; log: ShopEvent[] };

const KEY = 'poppys-counter:log:v1';
const CHANNEL = 'poppys-counter';

function dayOf(log: readonly ShopEvent[]): string | null {
  const e = log.find((x) => x.type === 'day.opened');
  return e && e.type === 'day.opened' ? e.day : null;
}

function randomSeed(): number {
  return (Math.random() * 2 ** 31) >>> 0;
}

export interface StoreOptions {
  /** Live: real clock, sessionStorage and tab sync. Attract: none of those, the clock is driven by hand. */
  mode: 'live' | 'attract';
}

export class Store {
  readonly log = signal<readonly ShopEvent[]>([]);
  readonly now = signal(Date.now());
  readonly state = computed(() => shopAt(this.log.value, this.now.value));

  private readonly tab = Math.random().toString(36).slice(2, 8);
  private seq = 0;
  private channel: BroadcastChannel | null = null;
  private timer = 0;
  /** True while this tab's day was made here and nothing has been done in it yet. */
  private fresh = false;

  constructor(readonly opts: StoreOptions) {}

  /** Hands an attract-mode store over to the visitor: their own day, saved and shared. */
  goLive(): void {
    if (this.opts.mode === 'live') return;
    this.opts.mode = 'live';
    this.start();
  }

  start(): void {
    if (this.opts.mode !== 'live') return;
    const saved = this.load();
    if (saved) this.log.value = saved;
    else this.openDay();
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (m) => this.receive(m.data as Message);
      this.post({ t: 'hello', from: this.tab, day: dayOf(this.log.value) });
    } catch {
      this.channel = null;
    }
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 500);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.channel?.close();
    this.channel = null;
  }

  private onVisibility = () => {
    window.clearInterval(this.timer);
    if (document.visibilityState === 'visible') {
      this.tick();
      this.timer = window.setInterval(() => this.tick(), 500);
    }
  };

  private tick(): void {
    this.now.value = Date.now();
  }

  /** The current time on this store's clock. */
  time(): number {
    return this.opts.mode === 'live' ? Date.now() : this.now.value;
  }

  /** Attract mode drives the clock by hand. */
  setNow(t: number): void {
    this.now.value = t;
  }

  nextId(): string {
    return `${this.tab}-${(++this.seq).toString(36)}`;
  }

  dispatch(e: Incoming): ShopEvent {
    const event = { ...e, id: this.nextId(), at: this.time() } as ShopEvent;
    this.fresh = false;
    this.append([event]);
    if (this.opts.mode === 'live') this.now.value = event.at;
    this.post({ t: 'events', from: this.tab, day: dayOf(this.log.value)!, events: [event] });
    return event;
  }

  /** Starts the day over everywhere. */
  reset(seed = randomSeed()): void {
    this.log.value = newDay(this.time(), seed);
    this.fresh = false;
    this.save();
    this.post({ t: 'reset', from: this.tab, day: dayOf(this.log.value)!, log: [...this.log.value] });
  }

  /** Replaces the log without telling anyone (attract mode). */
  replace(log: readonly ShopEvent[]): void {
    this.log.value = log;
  }

  private openDay(): void {
    this.log.value = newDay(Date.now(), randomSeed());
    this.fresh = true;
    this.save();
  }

  private append(events: readonly ShopEvent[]): void {
    const have = new Set(this.log.value.map((e) => e.id));
    const add = events.filter((e) => !have.has(e.id));
    if (!add.length) return;
    this.log.value = [...this.log.value, ...add].sort(compareEvents);
    this.save();
  }

  private receive(m: Message): void {
    if (!m || m.from === this.tab) return;
    const mine = dayOf(this.log.value);
    switch (m.t) {
      case 'hello':
        if (mine) this.post({ t: 'state', from: this.tab, day: mine, fresh: this.fresh, log: [...this.log.value] });
        break;
      case 'state':
        if (m.day === mine) this.append(m.log);
        else if (this.fresh && !m.fresh) this.adopt(m.log);
        else if (this.fresh && m.fresh && m.day < (mine ?? '')) this.adopt(m.log);
        break;
      case 'events':
        if (m.day === mine) this.append(m.events);
        else if (this.fresh) this.post({ t: 'hello', from: this.tab, day: mine });
        break;
      case 'reset':
        this.adopt(m.log);
        this.fresh = false;
        break;
    }
  }

  private adopt(log: readonly ShopEvent[]): void {
    this.log.value = [...log].sort(compareEvents);
    this.save();
  }

  private post(m: Message): void {
    if (this.opts.mode !== 'live') return;
    try {
      this.channel?.postMessage(m);
    } catch {
      /* a closed channel is fine */
    }
  }

  private load(): ShopEvent[] | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const log = JSON.parse(raw) as ShopEvent[];
      return Array.isArray(log) && dayOf(log) ? log : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    if (this.opts.mode !== 'live') return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(this.log.value));
    } catch {
      /* storage can be full or blocked; the day still works in memory */
    }
  }
}
