export class PracticeDisplay {
  constructor({ document: doc = globalThis.document, navigator: nav = globalThis.navigator, onChange = () => {} } = {}) {
    Object.assign(this, { doc, nav, onChange, active:false, enabled:true, epoch:0, lock:null, pending:null, wakeState:'idle', fullscreenError:false });
    doc.addEventListener('visibilitychange', () => this.sync());
    doc.addEventListener('fullscreenchange', () => this.fullscreenChanged());
    doc.addEventListener('webkitfullscreenchange', () => this.fullscreenChanged());
    doc.defaultView?.addEventListener('pagehide', () => { this.pageHidden = true; this.release(); });
    doc.defaultView?.addEventListener('pageshow', () => { this.pageHidden = false; this.sync(); });
  }

  get wakeSupported() { return typeof this.nav.wakeLock?.request === 'function'; }
  get wanted() { return this.active && this.enabled && !this.doc.hidden && !this.pageHidden; }
  get fullscreen() { return Boolean(this.doc.fullscreenElement || this.doc.webkitFullscreenElement); }
  get fullscreenSupported() {
    return Boolean(this.doc.documentElement.requestFullscreen && this.doc.fullscreenEnabled !== false || this.doc.documentElement.webkitRequestFullscreen && this.doc.webkitFullscreenEnabled !== false);
  }
  setActive(active) { this.active = active; this.sync(); }
  setEnabled(enabled) { this.enabled = enabled; this.sync(); }

  sync() {
    if (!this.wanted) { this.release(); return; }
    if (!this.wakeSupported) { this.wakeState = 'unsupported'; this.onChange(); return; }
    if (!this.lock && !this.pending) void this.acquire();
    else this.onChange();
  }

  async acquire() {
    const request = { epoch:this.epoch };
    this.pending = request;
    this.wakeState = 'requesting'; this.onChange();
    try {
      const lock = await this.nav.wakeLock.request('screen');
      if (this.pending === request) this.pending = null;
      if (request.epoch !== this.epoch || !this.wanted) {
        await lock.release();
        if (this.wanted) this.sync();
        return;
      }
      this.lock = lock;
      this.wakeState = 'active';
      lock.addEventListener('release', () => {
        if (this.lock !== lock) return;
        this.lock = null; this.wakeState = 'released'; this.onChange();
      }, { once:true });
      this.onChange();
    } catch {
      if (this.pending === request) this.pending = null;
      if (request.epoch === this.epoch) { this.wakeState = 'denied'; this.onChange(); }
      else if (this.wanted) this.sync();
    }
  }

  release() {
    ++this.epoch;
    const lock = this.lock;
    this.lock = null;
    this.wakeState = 'idle';
    if (lock) void lock.release().catch(() => {});
    this.onChange();
  }

  fullscreenChanged() {
    this.fullscreenError = false;
    this.sync();
  }

  async toggleFullscreen() {
    this.fullscreenError = false;
    try {
      if (this.fullscreen) {
        const exit = this.doc.exitFullscreen || this.doc.webkitExitFullscreen;
        await exit.call(this.doc);
      } else if (this.fullscreenSupported) {
        const root = this.doc.documentElement;
        if (root.requestFullscreen) await root.requestFullscreen({ navigationUI:'hide' });
        else await root.webkitRequestFullscreen();
      } else return false;
      this.onChange();
      return true;
    } catch {
      this.fullscreenError = true; this.onChange();
      return false;
    }
  }
}
