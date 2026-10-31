// The CINENJOY marquee logo.
// CINE and ENJOY share the E. One N flips like a card from position 3 (CINE)
// over the shared E to position 5 (ENJOY). It plays on page load, on hover and
// in a loop while something is loading.
// Once the N lands in ENJOY, the leftover "CI" and the empty N slot fade out and
// an old film projector takes their place, throwing ENJOY onto the screen in its beam.

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

  // The projector that replaces "CIN" while ENJOY is showing, and its beam of light.
  const projector = document.createElement('span');
  projector.className = 'projector';
  projector.setAttribute('aria-hidden', 'true');
  projector.innerHTML = `<svg viewBox="0 0 100 52" preserveAspectRatio="xMidYMid meet">
    <g class="reel reel-a"><circle cx="30" cy="15" r="13"/><circle class="hub" cx="30" cy="15" r="3"/>
      <circle class="hole" cx="30" cy="7" r="3.2"/><circle class="hole" cx="37" cy="19" r="3.2"/><circle class="hole" cx="23" cy="19" r="3.2"/></g>
    <g class="reel reel-b"><circle cx="62" cy="15" r="13"/><circle class="hub" cx="62" cy="15" r="3"/>
      <circle class="hole" cx="62" cy="7" r="3.2"/><circle class="hole" cx="69" cy="19" r="3.2"/><circle class="hole" cx="55" cy="19" r="3.2"/></g>
    <path class="film" d="M30 15 L44 30 M62 15 L56 30" />
    <rect class="body" x="14" y="28" width="66" height="18" rx="4"/>
    <rect class="slot" x="22" y="33" width="20" height="3" rx="1.5"/>
    <rect class="lens-hood" x="80" y="31" width="12" height="12" rx="2"/>
    <circle class="lens" cx="93" cy="37" r="5"/>
    <rect class="leg" x="22" y="46" width="5" height="6" rx="1"/><rect class="leg" x="67" y="46" width="5" height="6" rx="1"/>
  </svg>`;
  const beam = document.createElement('span');
  beam.className = 'beam';
  beam.setAttribute('aria-hidden', 'true');
  el.append(projector, beam);

  // Fit the projector over C, I and N, and the beam from its lens across ENJOY.
  function placeProjector() {
    const left = tiles[0].offsetLeft;
    const right = tiles[N_CINE].offsetLeft + tiles[N_CINE].offsetWidth;
    const top = tiles[0].offsetTop;
    const h = tiles[0].offsetHeight;
    Object.assign(projector.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${h}px` });
    const end = tiles[LETTERS.length - 1].offsetLeft + tiles[LETTERS.length - 1].offsetWidth;
    Object.assign(beam.style, { left: `${right - h * 0.05}px`, top: `${top - h * 0.38}px`, width: `${end - right + h * 0.3}px`, height: `${h * 1.76}px` });
  }

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
        placeProjector();
        setPhase('enjoy');
        await wait(1400);
        return;
      }
      // CINE lights up, ENJOY's N waits empty
      setPhase('cine');
      ghost(N_ENJOY, true);
      await wait(380);
      await flip(N_CINE, N_ENJOY);
      placeProjector();
      setPhase('enjoy');
      await wait(2200);
      // Loop back and forth while loading
      while (loading) {
        setPhase('cine');
        await wait(350);
        await flip(N_ENJOY, N_CINE);
        await wait(260);
        if (!loading) break;
        await flip(N_CINE, N_ENJOY);
        placeProjector();
        setPhase('enjoy');
        await wait(900);
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
