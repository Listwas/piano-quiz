// Browser chrome can leave the visible viewport shorter than the CSS viewport.
// Keep the page in normal flow: a fixed body can offset iOS touch hit testing
// after rotation (WebKit 235684).
export function fitViewport() {
  const root = document.documentElement;
  let frame;
  let settlingTimers = [];

  function fit() {
    const height = Math.min(window.innerHeight, window.visualViewport?.height || window.innerHeight);
    if (height > 0) root.style.setProperty('--app-height', `${Math.floor(height)}px`);
    root.toggleAttribute('data-short-viewport', window.innerWidth > height && height < 420);
    if (!document.querySelector('dialog[open]') && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  }

  function queue() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  }

  function rotated() {
    queue();
    settlingTimers.forEach(clearTimeout);
    // On iOS the orientation event can precede the final viewport metrics.
    settlingTimers = [200, 700].map(delay => setTimeout(queue, delay));
  }

  window.addEventListener('resize', queue);
  window.visualViewport?.addEventListener('resize', queue);
  window.addEventListener('orientationchange', rotated);
  window.screen.orientation?.addEventListener('change', rotated);
  window.addEventListener('pageshow', queue);
  fit();
}
