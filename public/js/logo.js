// The CINENJOY marquee logo.
// CINE and ENJOY share the E. One N flips like a card from position 3 (CINE)
// over the shared E to position 5 (ENJOY). It plays on page load, on hover and
// in a loop while something is loading.

const LETTERS = ['C', 'I', 'N', 'E', 'N', 'J', 'O', 'Y'];
const N_CINE = 2; // position 3
const N_ENJOY = 4; // position 5

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function createLogo({ size = 'lg', autoplay = true } = {}) {
  const el = document.createElement('div');
  el.className = `logo logo-${size}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'CINENJOY');

  const tiles = LETTERS.map((ch, i) => {
    const tile = document.createElement('span');
    tile.className = 'tile';
    tile.dataset.i = String(i);
    tile.textContent = ch;
    tile.setAttribute('aria-hidden', 'true');
    el.append(tile);
    return tile;
  });

  const card = document.createElement('span');
  card.className = 'tile-card';
  card.setAttribute('aria-hidden', 'true');
  card.innerHTML = '<span class="face front">N</span><span class="face back">N</span>';
  el.append(card);

  let busy = false;
  let loading = false;

  const setPhase = (phase) => {
    el.dataset.phase = phase || '';
  };
  const ghost = (i, on) => tiles[i].classList.toggle('ghost', on);

  async function flip(from, to) {
    const x0 = tiles[from].offsetLeft;
    const x1 = tiles[to].offsetLeft;
    const y = tiles[from].offsetTop;
    const lift = tiles[from].offsetHeight * 0.55;
    card.style.top = `${y}px`;
    card.classList.add('show');
    tiles[from].classList.add('under');
    ghost(from, true);
    const anim = card.animate(
      [
        { transform: `translateX(${x0}px) translateY(0) rotateY(0deg) scale(1)` },
        { transform: `translateX(${(x0 + x1) / 2}px) translateY(${-lift}px) rotateY(90deg) scale(1.18)`, offset: 0.5 },
        { transform: `translateX(${x1}px) translateY(0) rotateY(180deg) scale(1)` },
      ],
      { duration: 820, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' },
    );
    try {
      await anim.finished;
    } catch {
      /* cancelled */
    }
    tiles[from].classList.remove('under');
    ghost(to, false);
    card.classList.remove('show');
    anim.cancel();
  }

  async function play() {
    if (busy) return;
    busy = true;
    try {
      if (reduceMotion()) {
        setPhase('cine');
        await wait(700);
        setPhase('enjoy');
        await wait(700);
        return;
      }
      // CINE lights up, ENJOY's N waits empty
      setPhase('cine');
      ghost(N_ENJOY, true);
      await wait(380);
      await flip(N_CINE, N_ENJOY);
      setPhase('enjoy');
      await wait(650);
      // Loop back and forth while loading
      while (loading) {
        await flip(N_ENJOY, N_CINE);
        setPhase('cine');
        await wait(260);
        if (!loading) break;
        await flip(N_CINE, N_ENJOY);
        setPhase('enjoy');
        await wait(260);
      }
    } finally {
      // Rest state: the full word, both Ns in place
      tiles.forEach((t) => t.classList.remove('ghost', 'under'));
      setPhase('');
      busy = false;
    }
  }

  function setLoading(on) {
    loading = Boolean(on);
    el.classList.toggle('is-loading', loading);
    if (loading) play();
  }

  el.addEventListener('mouseenter', () => play());
  el.addEventListener('click', () => play());

  if (autoplay) {
    // Wait for the display font so tile positions are measured correctly
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    Promise.race([ready, wait(1500)]).then(() => requestAnimationFrame(() => play()));
  }

  return { el, play, setLoading };
}
