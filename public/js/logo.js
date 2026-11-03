// The CINEJOY marquee logo.
// At rest it reads CINEJOY. On play, the N jumps from position 3 over the E,
// a gap opens between E and J, and the N lands there to spell ENJOY. The moment
// the N leaves, an old film projector takes the place of "CI" and the empty N
// slot and throws ENJOY onto the screen in its beam. It plays on page load, on
// hover and in a loop while something is loading.

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
  el.setAttribute('aria-label', 'CINEJOY');

  const tiles = LETTERS.map((ch, i) => {
    const tile = document.createElement('span');
    tile.className = 'tile';
    tile.dataset.i = String(i);
    tile.textContent = ch;
    tile.setAttribute('aria-hidden', 'true');
    el.append(tile);
    return tile;
  });
  // The second N's slot is closed at rest, so the logo reads CINEJOY
  tiles[N_ENJOY].classList.add('shut');

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

  // Where tile i sits once the N slot is open (measured from C, so it works
  // while the slot is still closed or opening)
  const unit = () => {
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    return tiles[0].offsetWidth + gap;
  };
  const posOf = (i) => tiles[0].offsetLeft + i * unit();

  // Fit the projector over C, I and N, and the beam from its lens across ENJOY.
  function placeProjector() {
    const left = tiles[0].offsetLeft;
    const right = posOf(N_CINE) + tiles[0].offsetWidth;
    const top = tiles[0].offsetTop;
    const h = tiles[0].offsetHeight;
    Object.assign(projector.style, { left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${h}px` });
    const end = posOf(LETTERS.length - 1) + tiles[0].offsetWidth;
    Object.assign(beam.style, { left: `${right - h * 0.05}px`, top: `${top - h * 0.38}px`, width: `${end - right + h * 0.3}px`, height: `${h * 1.76}px` });
  }

  let busy = false;
  let loading = false;

  const setPhase = (phase) => {
    el.dataset.phase = phase || '';
  };
  const ghost = (i, on) => tiles[i].classList.toggle('ghost', on);

  async function flip(from, to) {
    const x0 = posOf(from);
    const x1 = posOf(to);
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

  // The gap opens, the N takes off and the projector appears in the same frame,
  // so there is no pause between the jump and the projector.
  async function flipToEnjoy() {
    placeProjector();
    ghost(N_ENJOY, true);
    tiles[N_ENJOY].classList.remove('shut');
    const landing = flip(N_CINE, N_ENJOY);
    setPhase('enjoy');
    await landing;
  }

  async function flipToCine() {
    setPhase('cine');
    await flip(N_ENJOY, N_CINE);
    tiles[N_ENJOY].classList.add('shut');
  }

  async function play() {
    if (busy) return;
    busy = true;
    try {
      if (reduceMotion()) {
        setPhase('cine');
        await wait(700);
        placeProjector();
        tiles[N_ENJOY].classList.remove('shut');
        ghost(N_CINE, true);
        setPhase('enjoy');
        await wait(1400);
        return;
      }
      // CINE lights up, then the N jumps
      setPhase('cine');
      await wait(380);
      await flipToEnjoy();
      await wait(2200);
      // The N jumps back to CINEJOY; while loading it keeps going back and forth
      for (;;) {
        await flipToCine();
        if (!loading) break;
        await wait(260);
        await flipToEnjoy();
        await wait(900);
      }
      await wait(250);
    } finally {
      // Rest state: CINEJOY again
      tiles.forEach((t) => t.classList.remove('ghost', 'under'));
      tiles[N_ENJOY].classList.add('shut');
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
