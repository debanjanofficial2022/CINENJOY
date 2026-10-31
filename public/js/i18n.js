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
        crossword: ['Cine Crossword', 'The Daily Mini: a 5x5 crossword of film and series titles. The themed 11x11 Weekend crossword comes later.'],
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
    ui: { close: 'Close', save: 'Save', cancel: 'Cancel', retry: 'Try again', loading: 'Loading…', delete: 'Delete', back: 'Back' },
    errors: {
      offline: "Couldn't reach your saved lists. Check your connection and try again.",
      search: "Search isn't working right now. Try again in a moment.",
      generic: 'Something went wrong. Try again.',
      notFound: 'This list does not exist, or you are not a member.',
    },
    wl: {
      myLists: 'My lists', defaultName: 'Watchlist', newList: 'New list', newListTitle: 'Name your list',
      nameLabel: 'List name', namePlaceholder: 'e.g. Rainy Sunday films', create: 'Create',
      join: 'Join a shared list', joinPlaceholder: 'Invite code', joinBtn: 'Join',
      titles: '{n} titles', titlesOne: '1 title', shared: 'Shared', people: '{n} people',
      you: 'You', friend: 'A friend', backToLists: 'My lists',
      searchPlaceholder: 'Add a film, series or anime…', searchLabel: 'Search titles', searching: 'Searching…',
      noResults: 'No titles found.', add: 'Add', added: 'Added', addedToast: 'Added to {list}', removedToast: 'Removed from the list',
      groupBy: 'Group by', view: 'View', grid: 'Posters', compact: 'List', show: 'Show', all: 'All', unwatched: 'Not watched', watched: 'Watched',
      filterTags: 'Tags',
      empty: 'This list is empty. Search above to add your first title.', emptyFilter: 'Nothing matches these filters.',
      share: 'Share', shareTitle: 'Share this list',
      shareBody: 'Friends who open this link can add titles, rate them and mark them watched.',
      inviteLink: 'Invite link', inviteCode: 'Invite code', copyLink: 'Copy link', linkCopied: 'Link copied', shareNative: 'Share…',
      shareText: 'Join my CINENJOY list "{name}"',
      rename: 'Rename', renameTitle: 'Rename list', deleteList: 'Delete list',
      deleteConfirm: 'Delete "{name}" and everything in it? This cannot be undone.',
      leave: 'Leave list', leaveConfirm: 'Leave "{name}"? You can rejoin with the invite link.',
      addedBy: 'Added by {name}', other: 'Other', decade: '{d}s',
      yourName: 'What should friends call you?', personName: 'Your name', members: 'People in this list', owner: 'Owner',
      savedNote: 'Saved to your account automatically.',
    },
    groups: { none: 'Nothing', medium: 'Medium', genre: 'Genre', language: 'Language', country: 'Country', decade: 'Decade', director: 'Director', universe: 'Universe', tag: 'My tags' },
    medium: { film: 'Film', series: 'Series', anime: 'Anime', documentary: 'Documentary', short: 'Short film' },
    item: {
      rating: 'Your rating', clear: 'Clear', watchedOn: 'Date watched', note: 'Note', notePlaceholder: 'What did you think?',
      markWatched: 'Mark as watched', watched: 'Watched', tags: 'Your tags', newTag: 'New tag, e.g. rainy Sunday', addTag: 'Add',
      everyone: "Everyone's ratings", remove: 'Remove from list', director: 'Director', creator: 'Created by', cast: 'Cast',
      saved: 'Saved', original: 'Original title', episodes: '{n} episodes', minutes: '{n} min', noRatings: 'No ratings yet.',
    },
    imp: {
      button: 'Import', title: 'Import titles', fromLink: 'From a link', fromText: 'Paste text',
      linkLabel: 'Link to a page or video', linkPlaceholder: 'https://…',
      textLabel: 'Text with titles in it', textPlaceholder: 'Paste a list, a post, a caption or a video description…',
      hint: 'Works with articles, blogs, Wikipedia, MyAnimeList and YouTube links. Letterboxd, IMDb and Reddit usually don’t allow reading, so paste their text instead. Nothing is added until you choose.',
      find: 'Find titles', reading: 'Reading and matching titles…',
      found: 'Found {n} titles in “{source}”. Tick the ones to add.', foundText: 'Found {n} titles. Tick the ones to add.',
      none: 'No titles found. Try pasting the text instead.', maybe: 'Not sure', foundAs: 'Found as “{t}”',
      inList: 'Already in this list', selectAll: 'Select all', selectNone: 'Select none',
      add: 'Add {n} titles', addOne: 'Add 1 title', adding: 'Adding {i} of {n}…', added: 'Added {n} titles', switchToText: 'Paste text instead',
      errors: {
        bad_url: "That doesn't look like a public web link. Check it and try again.",
        blocked: "That site didn't let CINENJOY read the page. Copy the text from it and paste it here instead.",
        not_found: "That page doesn't exist any more.",
        fetch_failed: "Couldn't open that page. Check the link, or try again in a moment.",
        not_page: "That link isn't a web page.",
      },
      notes: {
        no_captions: 'This video has no captions CINENJOY could read, so only its title and description were checked.',
        partial: 'The page was very long, so some titles may be missing.',
        title_only: 'YouTube only shared this video’s title. If titles are in its description, copy the description and paste it here.',
      },
    },
    games: {
      keyboard: 'Keyboard', enter: 'Enter', backspace: 'Delete letter', board: 'Guesses',
      daily: 'Daily', dailyN: 'Daily #{n}', practice: 'Practice', challenge: 'Challenge', howToPlay: 'How to play', stats: 'Stats',
      played: 'Played', winPct: 'Win %', streak: 'Streak', bestStreak: 'Best streak', distribution: 'Guesses per win',
      seeResult: 'See result', shareResult: 'Share result', challengeFriend: 'Challenge a friend', playPractice: 'Play practice',
      playAgain: 'Play again', nextIn: 'Next daily puzzle in', copied: 'Copied. Paste it anywhere to share.',
      challengeText: 'Can you beat me at CINENJOY {game}?', challengeBoard: 'Scores on this challenge',
      challengeMissing: "This challenge link doesn't work. Ask your friend for a new one.",
      theAnswer: 'The answer', addToWatchlist: 'Add to my watchlist', playNow: 'Play now',
      state: { correct: 'right place', present: 'wrong place', absent: 'not in the title', typed: '', empty: '' },
    },
    cw: {
      letters: '{n} letters', useHint: 'Use a hint', hintUsed: 'Hint used',
      hintNote: 'One hint per game. Your score will show that you used it.',
      hint: { year: 'Year', medium: 'Type', genre: 'Genre', actor: 'Lead actor', director: 'Director' },
      tooShort: 'Not enough letters', notWord: 'Not in the word list',
      won: 'You got it in {n}!', lost: 'Out of tries. Better luck tomorrow.',
      help1: 'Guess the film, series or anime title in six tries. Every answer is one English word of 5 or 6 letters.',
      help2: 'After each guess, the colours show how close you are:',
      helpCorrect: 'Green: right letter, right place', helpPresent: 'Yellow: in the title, wrong place', helpAbsent: 'Grey: not in the title',
      help3: 'Stuck? Use one hint per game: the year, the type, the genre or the lead actor. Your score shows a 💡 when you do.',
    },
    mini: {
      title: 'Daily Mini', time: 'Time', check: 'Check', reveal: 'Reveal', letter: 'Letter', word: 'Word', puzzle: 'Puzzle',
      a: 'A', d: 'D', across: 'Across', down: 'Down', prevClue: 'Previous clue', nextClue: 'Next clue', empty: 'empty',
      notQuite: 'Not quite. Some letters are wrong.', wrongN: '{n} wrong', allRight: 'All checked letters are right',
      solved: 'Solved in {time}!', revealedAll: 'Puzzle revealed', revealedN: '{n} revealed',
      penaltyNote: 'Includes {time} added for checks and reveals.', bestTime: 'Best time', avgTime: 'Average',
      englishNote: 'Answers are English film and series titles, or words from them.',
      help1: 'Fill the grid. Every answer is a film or series title, or a word from one. Each square is part of an across word and a down word.',
      help2: 'Tap a square to choose it, tap again to switch between across and down. Type to fill, and the cursor moves on by itself.',
      help3: 'Stuck? Check adds {check} seconds per letter checked; Reveal adds {reveal} seconds per letter shown.',
    },
    rating: { label: 'Rating', stars: '{n} stars' },
    join: {
      title: "You're invited", body: 'Join "{name}": {items} titles, {people} people.', btn: 'Join list',
      notFound: 'This invite link is not valid any more.', joined: 'You joined {name}',
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
        crossword: ['电影填字', '每日迷你：用电影和剧集片名组成的 5x5 填字。11x11 的周末主题填字稍后推出。'],
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
    ui: { close: '关闭', save: '保存', cancel: '取消', retry: '重试', loading: '加载中…', delete: '删除', back: '返回' },
    errors: {
      offline: '无法连接到你保存的片单。请检查网络后重试。',
      search: '搜索暂时不可用，请稍后再试。',
      generic: '出了点问题，请重试。',
      notFound: '这个片单不存在，或者你还不是成员。',
    },
    wl: {
      myLists: '我的片单', defaultName: '想看', newList: '新建片单', newListTitle: '给片单起个名字',
      nameLabel: '片单名称', namePlaceholder: '例如：下雨天的电影', create: '创建',
      join: '加入共享片单', joinPlaceholder: '邀请码', joinBtn: '加入',
      titles: '{n} 部作品', titlesOne: '1 部作品', shared: '共享', people: '{n} 人',
      you: '你', friend: '一位朋友', backToLists: '我的片单',
      searchPlaceholder: '添加电影、剧集或动画…', searchLabel: '搜索作品', searching: '搜索中…',
      noResults: '没有找到作品。', add: '添加', added: '已添加', addedToast: '已添加到「{list}」', removedToast: '已从片单移除',
      groupBy: '分组', view: '视图', grid: '海报', compact: '列表', show: '显示', all: '全部', unwatched: '未看', watched: '已看',
      filterTags: '标签',
      empty: '这个片单还是空的。在上方搜索，添加第一部作品吧。', emptyFilter: '没有符合筛选条件的作品。',
      share: '分享', shareTitle: '分享这个片单',
      shareBody: '打开链接的朋友可以添加作品、评分并标记已看。',
      inviteLink: '邀请链接', inviteCode: '邀请码', copyLink: '复制链接', linkCopied: '链接已复制', shareNative: '分享…',
      shareText: '加入我的 CINENJOY 片单「{name}」',
      rename: '重命名', renameTitle: '重命名片单', deleteList: '删除片单',
      deleteConfirm: '删除「{name}」及其中的所有内容？此操作无法撤销。',
      leave: '退出片单', leaveConfirm: '退出「{name}」？之后可以用邀请链接重新加入。',
      addedBy: '{name} 添加', other: '其他', decade: '{d} 年代',
      yourName: '朋友们该怎么称呼你？', personName: '你的名字', members: '片单成员', owner: '创建者',
      savedNote: '已自动保存到你的账户。',
    },
    groups: { none: '不分组', medium: '类型', genre: '题材', language: '语言', country: '国家/地区', decade: '年代', director: '导演', universe: '系列宇宙', tag: '我的标签' },
    medium: { film: '电影', series: '剧集', anime: '动画', documentary: '纪录片', short: '短片' },
    item: {
      rating: '你的评分', clear: '清除', watchedOn: '观看日期', note: '短评', notePlaceholder: '你觉得怎么样？',
      markWatched: '标记为已看', watched: '已看', tags: '你的标签', newTag: '新标签，例如：下雨的周日', addTag: '添加',
      everyone: '大家的评分', remove: '从片单移除', director: '导演', creator: '主创', cast: '主演',
      saved: '已保存', original: '原名', episodes: '{n} 集', minutes: '{n} 分钟', noRatings: '还没有评分。',
    },
    imp: {
      button: '导入', title: '导入作品', fromLink: '从链接', fromText: '粘贴文字',
      linkLabel: '网页或视频链接', linkPlaceholder: 'https://…',
      textLabel: '包含片名的文字', textPlaceholder: '粘贴片单、帖子、字幕或视频简介…',
      hint: '支持文章、博客、维基百科、MyAnimeList 和 YouTube 链接。Letterboxd、IMDb 和 Reddit 通常不允许读取，请改为粘贴页面文字。在你确认之前不会添加任何内容。',
      find: '查找作品', reading: '正在读取并匹配作品…',
      found: '在「{source}」中找到 {n} 部作品。勾选要添加的作品。', foundText: '找到 {n} 部作品。勾选要添加的作品。',
      none: '没有找到作品。试试直接粘贴文字。', maybe: '不确定', foundAs: '识别为「{t}」',
      inList: '已在片单中', selectAll: '全选', selectNone: '全不选',
      add: '添加 {n} 部作品', addOne: '添加 1 部作品', adding: '正在添加第 {i} / {n} 部…', added: '已添加 {n} 部作品', switchToText: '改为粘贴文字',
      errors: {
        bad_url: '这看起来不是公开的网页链接，请检查后重试。',
        blocked: '该网站不允许 CINENJOY 读取页面。请复制页面上的文字，粘贴到这里。',
        not_found: '该页面已不存在。',
        fetch_failed: '无法打开该页面。请检查链接，或稍后再试。',
        not_page: '这个链接不是网页。',
      },
      notes: {
        no_captions: '这个视频没有可读取的字幕，所以只检查了标题和简介。',
        partial: '页面很长，可能有部分作品没有找到。',
        title_only: 'YouTube 只提供了这个视频的标题。如果片名在简介里，请复制简介并粘贴到这里。',
      },
    },
    games: {
      keyboard: '键盘', enter: '确定', backspace: '删除字母', board: '猜测记录',
      daily: '每日', dailyN: '每日 #{n}', practice: '练习', challenge: '挑战', howToPlay: '玩法', stats: '统计',
      played: '已玩', winPct: '胜率 %', streak: '连胜', bestStreak: '最长连胜', distribution: '每次获胜用的次数',
      seeResult: '查看结果', shareResult: '分享结果', challengeFriend: '挑战好友', playPractice: '练习模式',
      playAgain: '再来一局', nextIn: '下一个每日谜题', copied: '已复制，可以粘贴分享。',
      challengeText: '你能在 CINENJOY {game} 中赢过我吗？', challengeBoard: '本次挑战的成绩',
      challengeMissing: '这个挑战链接无效，请让朋友重新发一个。',
      theAnswer: '答案', addToWatchlist: '加入我的片单', playNow: '开始玩',
      state: { correct: '位置正确', present: '位置不对', absent: '片名中没有', typed: '', empty: '' },
    },
    cw: {
      letters: '{n} 个字母', useHint: '使用提示', hintUsed: '已用提示',
      hintNote: '每局只能用一次提示，成绩里会标出。',
      hint: { year: '年份', medium: '类型', genre: '题材', actor: '主演', director: '导演' },
      tooShort: '字母不够', notWord: '词库里没有这个词',
      won: '{n} 次猜中！', lost: '次数用完了，明天再试试。',
      help1: '六次之内猜出电影、剧集或动画的片名。每个答案都是一个 5 或 6 个字母的英文单词。',
      help2: '每次猜测后，颜色会告诉你离答案有多近：',
      helpCorrect: '绿色：字母和位置都对', helpPresent: '黄色：片名里有，但位置不对', helpAbsent: '灰色：片名里没有',
      help3: '卡住了？每局可以用一次提示：年份、类型、题材或主演。用了提示，成绩里会显示 💡。',
    },
    mini: {
      title: '每日迷你填字', time: '用时', check: '检查', reveal: '揭晓', letter: '字母', word: '单词', puzzle: '整题',
      a: '横', d: '竖', across: '横向', down: '纵向', prevClue: '上一条', nextClue: '下一条', empty: '空',
      notQuite: '还差一点，有些字母不对。', wrongN: '{n} 个错误', allRight: '检查的字母全对',
      solved: '用时 {time} 完成！', revealedAll: '已揭晓全部答案', revealedN: '揭晓了 {n} 个',
      penaltyNote: '其中 {time} 是检查和揭晓的加时。', bestTime: '最快', avgTime: '平均',
      englishNote: '答案是英文的电影和剧集片名，或片名中的单词。',
      help1: '填满方格。每个答案都是一部电影或剧集的英文片名，或片名中的一个单词。每个格子同时属于一个横向词和一个纵向词。',
      help2: '点一个格子选中它，再点一次切换横向和纵向。输入字母后，光标会自动前进。',
      help3: '卡住了？“检查”每个字母加 {check} 秒，“揭晓”每个字母加 {reveal} 秒。',
    },
    rating: { label: '评分', stars: '{n} 星' },
    join: {
      title: '你收到了邀请', body: '加入「{name}」：{items} 部作品，{people} 人。', btn: '加入片单',
      notFound: '这个邀请链接已失效。', joined: '你已加入「{name}」',
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
        crossword: ['Crucigrama Cine', 'El Mini diario: un crucigrama de 5x5 con títulos de películas y series. El temático de fin de semana de 11x11 llegará después.'],
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
    ui: { close: 'Cerrar', save: 'Guardar', cancel: 'Cancelar', retry: 'Reintentar', loading: 'Cargando…', delete: 'Eliminar', back: 'Volver' },
    errors: {
      offline: 'No se pudo conectar con tus listas. Revisa tu conexión e inténtalo de nuevo.',
      search: 'La búsqueda no funciona ahora mismo. Inténtalo en un momento.',
      generic: 'Algo salió mal. Inténtalo de nuevo.',
      notFound: 'Esta lista no existe o no eres miembro.',
    },
    wl: {
      myLists: 'Mis listas', defaultName: 'Por ver', newList: 'Nueva lista', newListTitle: 'Ponle nombre a tu lista',
      nameLabel: 'Nombre de la lista', namePlaceholder: 'p. ej. Pelis para un domingo de lluvia', create: 'Crear',
      join: 'Unirse a una lista compartida', joinPlaceholder: 'Código de invitación', joinBtn: 'Unirse',
      titles: '{n} títulos', titlesOne: '1 título', shared: 'Compartida', people: '{n} personas',
      you: 'Tú', friend: 'Un amigo', backToLists: 'Mis listas',
      searchPlaceholder: 'Añade una película, serie o anime…', searchLabel: 'Buscar títulos', searching: 'Buscando…',
      noResults: 'No se encontraron títulos.', add: 'Añadir', added: 'Añadido', addedToast: 'Añadido a {list}', removedToast: 'Quitado de la lista',
      groupBy: 'Agrupar por', view: 'Vista', grid: 'Pósteres', compact: 'Lista', show: 'Mostrar', all: 'Todo', unwatched: 'Sin ver', watched: 'Vistos',
      filterTags: 'Etiquetas',
      empty: 'Esta lista está vacía. Busca arriba para añadir tu primer título.', emptyFilter: 'Nada coincide con estos filtros.',
      share: 'Compartir', shareTitle: 'Compartir esta lista',
      shareBody: 'Quien abra este enlace podrá añadir títulos, puntuarlos y marcarlos como vistos.',
      inviteLink: 'Enlace de invitación', inviteCode: 'Código de invitación', copyLink: 'Copiar enlace', linkCopied: 'Enlace copiado', shareNative: 'Compartir…',
      shareText: 'Únete a mi lista de CINENJOY "{name}"',
      rename: 'Renombrar', renameTitle: 'Renombrar lista', deleteList: 'Eliminar lista',
      deleteConfirm: '¿Eliminar "{name}" y todo su contenido? No se puede deshacer.',
      leave: 'Salir de la lista', leaveConfirm: '¿Salir de "{name}"? Puedes volver con el enlace de invitación.',
      addedBy: 'Añadido por {name}', other: 'Otros', decade: 'Años {d}',
      yourName: '¿Cómo te llaman tus amigos?', personName: 'Tu nombre', members: 'Personas en esta lista', owner: 'Creador',
      savedNote: 'Se guarda en tu cuenta automáticamente.',
    },
    groups: { none: 'Nada', medium: 'Formato', genre: 'Género', language: 'Idioma', country: 'País', decade: 'Década', director: 'Dirección', universe: 'Universo', tag: 'Mis etiquetas' },
    medium: { film: 'Película', series: 'Serie', anime: 'Anime', documentary: 'Documental', short: 'Cortometraje' },
    item: {
      rating: 'Tu puntuación', clear: 'Borrar', watchedOn: 'Fecha en que la viste', note: 'Nota', notePlaceholder: '¿Qué te pareció?',
      markWatched: 'Marcar como visto', watched: 'Visto', tags: 'Tus etiquetas', newTag: 'Nueva etiqueta, p. ej. domingo de lluvia', addTag: 'Añadir',
      everyone: 'Puntuaciones de todos', remove: 'Quitar de la lista', director: 'Dirección', creator: 'Creada por', cast: 'Reparto',
      saved: 'Guardado', original: 'Título original', episodes: '{n} episodios', minutes: '{n} min', noRatings: 'Aún no hay puntuaciones.',
    },
    imp: {
      button: 'Importar', title: 'Importar títulos', fromLink: 'Desde un enlace', fromText: 'Pegar texto',
      linkLabel: 'Enlace a una página o vídeo', linkPlaceholder: 'https://…',
      textLabel: 'Texto con títulos', textPlaceholder: 'Pega una lista, una publicación, subtítulos o la descripción de un vídeo…',
      hint: 'Funciona con artículos, blogs, Wikipedia, MyAnimeList y enlaces de YouTube. Letterboxd, IMDb y Reddit no suelen permitir la lectura, así que pega su texto. No se añade nada hasta que lo elijas.',
      find: 'Buscar títulos', reading: 'Leyendo y buscando títulos…',
      found: 'Se encontraron {n} títulos en «{source}». Marca los que quieras añadir.', foundText: 'Se encontraron {n} títulos. Marca los que quieras añadir.',
      none: 'No se encontraron títulos. Prueba a pegar el texto.', maybe: 'Dudoso', foundAs: 'Detectado como «{t}»',
      inList: 'Ya está en esta lista', selectAll: 'Marcar todo', selectNone: 'Desmarcar todo',
      add: 'Añadir {n} títulos', addOne: 'Añadir 1 título', adding: 'Añadiendo {i} de {n}…', added: 'Se añadieron {n} títulos', switchToText: 'Pegar texto en su lugar',
      errors: {
        bad_url: 'Eso no parece un enlace web público. Revísalo e inténtalo de nuevo.',
        blocked: 'Ese sitio no permitió a CINENJOY leer la página. Copia su texto y pégalo aquí.',
        not_found: 'Esa página ya no existe.',
        fetch_failed: 'No se pudo abrir esa página. Revisa el enlace o inténtalo en un momento.',
        not_page: 'Ese enlace no es una página web.',
      },
      notes: {
        no_captions: 'Este vídeo no tiene subtítulos legibles, así que solo se revisaron su título y descripción.',
        partial: 'La página era muy larga, así que pueden faltar algunos títulos.',
        title_only: 'YouTube solo compartió el título de este vídeo. Si los títulos están en la descripción, cópiala y pégala aquí.',
      },
    },
    games: {
      keyboard: 'Teclado', enter: 'Enviar', backspace: 'Borrar letra', board: 'Intentos',
      daily: 'Diario', dailyN: 'Diario #{n}', practice: 'Práctica', challenge: 'Reto', howToPlay: 'Cómo se juega', stats: 'Estadísticas',
      played: 'Jugadas', winPct: '% victorias', streak: 'Racha', bestStreak: 'Mejor racha', distribution: 'Intentos por victoria',
      seeResult: 'Ver resultado', shareResult: 'Compartir resultado', challengeFriend: 'Retar a un amigo', playPractice: 'Jugar práctica',
      playAgain: 'Jugar otra vez', nextIn: 'Próximo reto diario en', copied: 'Copiado. Pégalo donde quieras para compartirlo.',
      challengeText: '¿Me ganas en {game} de CINENJOY?', challengeBoard: 'Puntuaciones de este reto',
      challengeMissing: 'Este enlace de reto no funciona. Pide a tu amigo uno nuevo.',
      theAnswer: 'La respuesta', addToWatchlist: 'Añadir a mi lista', playNow: 'Jugar ahora',
      state: { correct: 'en su sitio', present: 'en otro sitio', absent: 'no está en el título', typed: '', empty: '' },
    },
    cw: {
      letters: '{n} letras', useHint: 'Usar una pista', hintUsed: 'Pista usada',
      hintNote: 'Una pista por partida. Tu puntuación mostrará que la usaste.',
      hint: { year: 'Año', medium: 'Formato', genre: 'Género', actor: 'Protagonista', director: 'Dirección' },
      tooShort: 'Faltan letras', notWord: 'No está en la lista de palabras',
      won: '¡Acertaste en {n}!', lost: 'Se acabaron los intentos. Mañana más.',
      help1: 'Adivina el título de la película, serie o anime en seis intentos. Cada respuesta es una palabra en inglés de 5 o 6 letras.',
      help2: 'Tras cada intento, los colores te dicen lo cerca que estás:',
      helpCorrect: 'Verde: letra correcta en su sitio', helpPresent: 'Amarillo: está en el título, en otro sitio', helpAbsent: 'Gris: no está en el título',
      help3: '¿Atascado? Usa una pista por partida: el año, el formato, el género o el protagonista. Tu puntuación mostrará 💡.',
    },
    mini: {
      title: 'Mini diario', time: 'Tiempo', check: 'Comprobar', reveal: 'Revelar', letter: 'Letra', word: 'Palabra', puzzle: 'Todo',
      a: 'H', d: 'V', across: 'Horizontales', down: 'Verticales', prevClue: 'Pista anterior', nextClue: 'Pista siguiente', empty: 'vacía',
      notQuite: 'Casi. Hay letras incorrectas.', wrongN: '{n} incorrectas', allRight: 'Todas las letras comprobadas están bien',
      solved: '¡Resuelto en {time}!', revealedAll: 'Crucigrama revelado', revealedN: '{n} reveladas',
      penaltyNote: 'Incluye {time} añadidos por comprobar y revelar.', bestTime: 'Mejor tiempo', avgTime: 'Media',
      englishNote: 'Las respuestas son títulos de películas y series en inglés, o palabras de ellos.',
      help1: 'Rellena la cuadrícula. Cada respuesta es el título de una película o serie, o una palabra de uno. Cada casilla forma parte de una palabra horizontal y otra vertical.',
      help2: 'Toca una casilla para elegirla y otra vez para cambiar entre horizontal y vertical. Al escribir, el cursor avanza solo.',
      help3: '¿Atascado? Comprobar suma {check} segundos por letra; Revelar suma {reveal} segundos por letra.',
    },
    rating: { label: 'Puntuación', stars: '{n} estrellas' },
    join: {
      title: 'Te han invitado', body: 'Únete a "{name}": {items} títulos, {people} personas.', btn: 'Unirse a la lista',
      notFound: 'Este enlace de invitación ya no es válido.', joined: 'Te uniste a {name}',
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
