// Site text in the three site languages. Add a key to all three when adding text.
import { store } from './store.js';

export const LANGS = ['en', 'zh-CN', 'es'];

const dict = {
  en: {
    skip: 'Skip to content',
    language: 'Language',
    nav: { home: 'Home', watchlist: 'Watchlist', games: 'Games', lobby: 'Lobby' },
    credits: {
      tmdb: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      anilist: 'Anime details from AniList.',
    },
    status: {
      next: 'Opening next',
      step: 'Step {n} of Phase 1',
      phase: 'Phase {n}',
      soon: 'Coming soon',
    },
    modes: { daily: 'Daily', practice: 'Practice', room: 'Friend room', challenge: 'Challenge link' },
    home: {
      kicker: 'Now showing',
      tagline: 'Every story on every screen, in any language.',
      lead: 'Keep your watchlist, play cinema games and plan movie nights with friends. Films, series, anime, documentaries and shorts from every country.',
      saved: 'No sign-up needed. Everything you do is saved from your first visit.',
      replay: 'Replay the logo',
      media: ['Films', 'Series', 'Anime', 'Documentaries', 'Shorts', 'K-dramas', 'Telenovelas', 'Concert films'],
      admit: 'Admit one',
      cards: {
        watchlist: 'Keep, tag, rate and share everything you want to watch or have watched.',
        games: 'Twelve cinema games to play daily, practise, or race your friends.',
        lobby: 'Plan movie nights, track your diary, explore and learn cinema history.',
      },
    },
    watchlist: {
      title: 'Watchlist',
      lead: 'Your lists, your way. Personal or shared with friends, grouped by anything you like.',
      features: [
        ['Lists', 'Personal and shared lists. Friends add titles, rate them and mark them watched.'],
        ['Tags', 'Group by medium, genre, language, country, decade, director, actor or universe, or your own tags like "rainy Sunday".'],
        ['Ratings', 'Half stars, a note and the date you watched. See everyone\'s ratings side by side.'],
        ['Link import', 'Paste an article, Reddit thread, Letterboxd list or YouTube video and pick the titles to add.'],
      ],
    },
    games: {
      title: 'Games',
      lead: 'Twelve cinema games. Play the daily puzzle, practise as much as you like, or challenge your friends.',
      list: {
        cinewordle: ['CineWordle', 'Guess a 5 or 6 letter title in six tries.'],
        crossword: ['Cine Crossword', 'A daily 5x5 Mini and a themed 11x11 Weekend crossword.'],
        cryptic: ['Minute Cryptic', 'One cryptic clue a day, with hints in stages.'],
        quiz: ['CineQuiz', 'Ten-question rounds on plots, creators, cast and quotes.'],
        frame: ['Frame Guess', 'Name the title from a still that sharpens over six tries.'],
        impostor: ['Movie Impostor', 'One player has a different title. Give clues, then vote.'],
        pictionary: ['CinePictionary', 'Draw a title while friends race to guess it.'],
        emoji: ['Emoji Plot', 'Guess the title from emojis.'],
        degrees: ['Six Degrees', 'Link two actors through shared titles.'],
        higher: ['Higher or Lower', 'Which rated higher, earned more or ran longer?'],
        timeline: ['Timeline', 'Put five titles in release order.'],
        poster: ['Poster Reveal', 'A poster appears tile by tile. Buzz in first.'],
      },
    },
    lobby: {
      title: 'Lobby',
      lead: 'Plan what to watch with friends, keep your diary, discover more, and see how screen stories change the world.',
      tabs: {
        night: ['Movie Night', 'Swipe through your shared watchlists. A title everyone likes is a match.'],
        diary: ['Diary & Stats', 'Everything you watched, with stats, a world map and a year-in-review card.'],
        explore: ['Explore', 'Browse by country, language, film movement or medium, and see what is coming.'],
        history: ['CineHistory', 'Sourced stories of films that changed the real world, and cinema through the ages.'],
      },
    },
    notfound: { title: 'Wrong screen', body: 'This page is not showing here.', back: 'Back to the lobby doors' },
  },

  'zh-CN': {
    skip: '跳到正文',
    language: '语言',
    nav: { home: '首页', watchlist: '片单', games: '游戏', lobby: '大厅' },
    credits: {
      tmdb: '本产品使用 TMDB API，但未经 TMDB 认可或认证。',
      anilist: '动画资料来自 AniList。',
    },
    status: {
      next: '即将开放',
      step: '第一阶段 · 第 {n} 步',
      phase: '第 {n} 阶段',
      soon: '敬请期待',
    },
    modes: { daily: '每日', practice: '练习', room: '好友房间', challenge: '挑战链接' },
    home: {
      kicker: '正在上映',
      tagline: '每一块屏幕上的每一个故事，任何语言。',
      lead: '管理你的片单，玩电影游戏，和朋友约好电影之夜。涵盖世界各地的电影、剧集、动画、纪录片和短片。',
      saved: '无需注册。从第一次访问起，你做的一切都会被保存。',
      replay: '重播标志动画',
      media: ['电影', '剧集', '动画', '纪录片', '短片', '韩剧', '电视小说', '演唱会电影'],
      admit: '凭票入场',
      cards: {
        watchlist: '收藏、标记、评分并分享你想看和看过的一切。',
        games: '十二款电影游戏：每日挑战、随意练习，或和朋友比拼。',
        lobby: '约电影之夜、记观影日记、探索新片、了解电影史。',
      },
    },
    watchlist: {
      title: '片单',
      lead: '你的片单，你做主。可以自己用，也可以和朋友共享，按任何方式分组。',
      features: [
        ['片单', '个人片单和共享片单。朋友可以添加作品、评分并标记已看。'],
        ['标签', '按类型、题材、语言、国家、年代、导演、演员或宇宙分组，也可以用自己的标签，比如“下雨的周日”。'],
        ['评分', '半星评分、短评和观看日期。并排查看每个人的评分。'],
        ['链接导入', '粘贴文章、Reddit 帖子、Letterboxd 片单或 YouTube 视频，选出要添加的作品。'],
      ],
    },
    games: {
      title: '游戏',
      lead: '十二款电影游戏。玩每日谜题，尽情练习，或向朋友发起挑战。',
      list: {
        cinewordle: ['CineWordle', '六次之内猜出一个 5 或 6 个字母的片名。'],
        crossword: ['电影填字', '每日 5x5 迷你填字，以及每周末的 11x11 主题填字。'],
        cryptic: ['一分钟字谜', '每天一道隐语谜题，可分步提示。'],
        quiz: ['电影问答', '每轮十题：剧情、主创、演员和台词。'],
        frame: ['猜画面', '一张剧照在六次机会中逐渐变清晰，猜出片名。'],
        impostor: ['电影卧底', '有一位玩家拿到的是另一部作品。轮流给提示，然后投票。'],
        pictionary: ['电影你画我猜', '一人画片名，其他人抢答。'],
        emoji: ['表情剧情', '根据表情符号猜片名。'],
        degrees: ['六度空间', '通过共同出演的作品连接两位演员。'],
        higher: ['谁高谁低', '哪部评分更高、票房更多或集数更长？'],
        timeline: ['时间线', '把五部作品按上映顺序排列。'],
        poster: ['海报揭晓', '海报一块块显露，抢先猜中者胜。'],
      },
    },
    lobby: {
      title: '大厅',
      lead: '和朋友决定看什么，记录观影日记，发现更多作品，了解银幕故事如何改变世界。',
      tabs: {
        night: ['电影之夜', '一起滑动浏览共享片单，大家都喜欢的作品就是配对成功。'],
        diary: ['日记与统计', '你看过的一切，附统计、世界地图和年度回顾卡片。'],
        explore: ['探索', '按国家、语言、电影运动或类型浏览，并查看即将上映的作品。'],
        history: ['电影史', '有出处的真实故事：改变现实世界的电影，以及各个时代的电影。'],
      },
    },
    notfound: { title: '放错厅了', body: '这个页面不在这里放映。', back: '回到大厅入口' },
  },

  es: {
    skip: 'Saltar al contenido',
    language: 'Idioma',
    nav: { home: 'Inicio', watchlist: 'Mi lista', games: 'Juegos', lobby: 'Vestíbulo' },
    credits: {
      tmdb: 'Este producto usa la API de TMDB, pero no está respaldado ni certificado por TMDB.',
      anilist: 'Datos de anime de AniList.',
    },
    status: {
      next: 'Próximo estreno',
      step: 'Paso {n} de la Fase 1',
      phase: 'Fase {n}',
      soon: 'Muy pronto',
    },
    modes: { daily: 'Diario', practice: 'Práctica', room: 'Sala con amigos', challenge: 'Enlace de reto' },
    home: {
      kicker: 'En cartelera',
      tagline: 'Cada historia en cada pantalla, en cualquier idioma.',
      lead: 'Guarda tu lista, juega a juegos de cine y organiza noches de película con tus amigos. Películas, series, anime, documentales y cortos de todos los países.',
      saved: 'Sin registro. Todo lo que hagas se guarda desde tu primera visita.',
      replay: 'Repetir el logo',
      media: ['Películas', 'Series', 'Anime', 'Documentales', 'Cortos', 'K-dramas', 'Telenovelas', 'Conciertos'],
      admit: 'Entrada individual',
      cards: {
        watchlist: 'Guarda, etiqueta, puntúa y comparte todo lo que quieres ver o ya viste.',
        games: 'Doce juegos de cine: el reto diario, práctica libre o contra tus amigos.',
        lobby: 'Organiza noches de película, lleva tu diario, explora y aprende historia del cine.',
      },
    },
    watchlist: {
      title: 'Mi lista',
      lead: 'Tus listas, a tu manera. Personales o compartidas con amigos, agrupadas como quieras.',
      features: [
        ['Listas', 'Listas personales y compartidas. Tus amigos añaden títulos, los puntúan y los marcan como vistos.'],
        ['Etiquetas', 'Agrupa por formato, género, idioma, país, década, director, actor o universo, o con tus propias etiquetas como "domingo de lluvia".'],
        ['Puntuaciones', 'Medias estrellas, una nota y la fecha en que lo viste. Compara las puntuaciones de todos.'],
        ['Importar enlaces', 'Pega un artículo, un hilo de Reddit, una lista de Letterboxd o un vídeo de YouTube y elige los títulos.'],
      ],
    },
    games: {
      title: 'Juegos',
      lead: 'Doce juegos de cine. Resuelve el reto diario, practica todo lo que quieras o reta a tus amigos.',
      list: {
        cinewordle: ['CineWordle', 'Adivina un título de 5 o 6 letras en seis intentos.'],
        crossword: ['Crucigrama Cine', 'Un Mini diario de 5x5 y un crucigrama temático de fin de semana de 11x11.'],
        cryptic: ['Críptico Minuto', 'Una pista críptica al día, con ayudas por etapas.'],
        quiz: ['CineQuiz', 'Rondas de diez preguntas sobre tramas, autores, reparto y frases.'],
        frame: ['Adivina el fotograma', 'Nombra el título a partir de una imagen que se aclara en seis intentos.'],
        impostor: ['El impostor', 'Un jugador tiene otro título. Da pistas y luego votad.'],
        pictionary: ['CinePictionary', 'Dibuja un título mientras tus amigos lo adivinan.'],
        emoji: ['Trama en emojis', 'Adivina el título a partir de emojis.'],
        degrees: ['Seis grados', 'Conecta a dos actores a través de títulos compartidos.'],
        higher: ['Más o menos', '¿Cuál tuvo mejor nota, más taquilla o más episodios?'],
        timeline: ['Cronología', 'Ordena cinco títulos por fecha de estreno.'],
        poster: ['Revela el póster', 'El póster aparece por partes. Sé el primero en acertar.'],
      },
    },
    lobby: {
      title: 'Vestíbulo',
      lead: 'Decide qué ver con tus amigos, lleva tu diario, descubre más y conoce cómo las historias en pantalla cambian el mundo.',
      tabs: {
        night: ['Noche de película', 'Desliza por vuestras listas compartidas. Si a todos os gusta, hay match.'],
        diary: ['Diario y estadísticas', 'Todo lo que viste, con estadísticas, un mapa del mundo y tu resumen del año.'],
        explore: ['Explorar', 'Busca por país, idioma, movimiento o formato, y mira los próximos estrenos.'],
        history: ['CineHistoria', 'Historias con fuentes de películas que cambiaron el mundo real, y el cine a través de las épocas.'],
      },
    },
    notfound: { title: 'Sala equivocada', body: 'Esta página no se proyecta aquí.', back: 'Volver al vestíbulo' },
  },
};

function pickInitial() {
  const saved = store.get('lang');
  if (LANGS.includes(saved)) return saved;
  for (const l of navigator.languages || [navigator.language || 'en']) {
    const low = String(l).toLowerCase();
    if (low.startsWith('zh')) return 'zh-CN';
    if (low.startsWith('es')) return 'es';
    if (low.startsWith('en')) return 'en';
  }
  return 'en';
}

let current = pickInitial();
const listeners = new Set();

export const getLang = () => current;

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === current) return;
  current = lang;
  store.set('lang', lang);
  listeners.forEach((fn) => fn(lang));
}

export const onLangChange = (fn) => listeners.add(fn);

function lookup(table, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), table);
}

/** Translate a dotted key; falls back to English, then to the key itself. */
export function t(key, vars) {
  let v = lookup(dict[current], key);
  if (v === undefined) v = lookup(dict.en, key);
  if (v === undefined) return key;
  if (typeof v === 'string' && vars) {
    v = v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  }
  return v;
}
