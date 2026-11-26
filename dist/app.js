const $ = id => document.getElementById(id);
const themeKeys = ['daily', 'work', 'travel'];
const icons = ['coffee', 'work', 'plane'];
const icon = name => '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
const storageKey = 'english-on-air-v1';
let state = {done: [], saved: [], speeds: 1, positions: {}};
try { Object.assign(state, JSON.parse(localStorage.getItem(storageKey))); }
catch { /* Use session defaults when storage is unavailable. */ }
const persist = () => {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { /* The current session remains functional. */ }
};
const normalize = value => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
const catalogEpisodes = [...episodes].reverse();
const topicCounts = themeKeys.map((_, index) => episodes.filter(([, topic]) => topic === index).length);
let theme = -1;
let openId;
const t = key => (state.language === 'en' ? english : french)[key];
const localizeEpisode = ([id, , , , description, , , quiz]) => {
  if (state.language !== 'en') return {description, quiz};
  const [enDescription, question, answers, explanation] = englishLessons[id];
  return {description: enDescription, quiz: [question, answers, quiz[2], explanation]};
};
const themeTitle = topic => t(themeKeys[topic]);
let visibleView = 'episodes';

function cards(items) {
  return items.map(episode => {
    const [id, topic, level, title] = episode;
    const {description} = localizeEpisode(episode);
    const done = state.done.includes(id);
    return `<button class="card" data-episode="${id}">
      <span class="card-top"><span class="art theme-${topic}">${icon(icons[topic])}</span><span class="tag">${themeTitle(topic)}</span><span class="level">${level}</span></span>
      <strong lang="en">${title}</strong><span class="desc">${description}</span>
      <span class="card-foot">${done ? t('done') : state.positions[id] > 0 ? t('resume') : t('listen')}${icon(done ? 'check' : 'play')}</span></button>`;
  }).join('');
}
function renderCatalog() {
  const query = normalize($('search').value);
  const filtered = catalogEpisodes.filter(episode => {
    const [, topic, level, title] = episode;
    return (theme < 0 || theme === topic) &&
    normalize([themeTitle(topic), level, title, localizeEpisode(episode).description].join(' ')).includes(query);
  });
  $('count').textContent = filtered.length + ' ' + t(filtered.length === 1 ? 'episode' : 'episodePlural') + ' · ' + t('levels');
  $('episodes').innerHTML = cards(filtered) || `<p class="empty">${t('noResults')}</p>`;
  $('filters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.theme) === theme));
}
function renderProgress() {
  $('progress').textContent = state.done.length + ' / ' + episodes.length + ' ' + t('doneCount');
}
function renderReview() {
  const used = episodes.flatMap(([id, , , title, , , expressions]) => expressions.map(([en, fr], i) =>
    state.saved.includes(id + ':' + i) ? `<div class="expression"><div><strong lang="en">${en}</strong><details><summary>${t('showMeaning')}</summary><p lang="fr">${fr}</p></details></div><button class="secondary" data-episode="${id}">${title}</button></div>` : '').filter(Boolean));
  $('saved').innerHTML = used.join('') || `<p class="muted">${t('savedEmpty')}</p>`;
  $('completed').innerHTML = cards(episodes.filter(([id]) => state.done.includes(id))) || `<p class="muted">${t('completedEmpty')}</p>`;
}
function switchView(view) {
  visibleView = view;
  $('catalog').hidden = view !== 'episodes';
  $('review').hidden = view !== 'review';
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view === 'review') renderReview();
  else renderCatalog();
}

function openEpisode(id, autoplay = false) {
  const episode = episodes.find(item => item[0] === id);
  if (!episode) return;
  openId = id;
  const [, topic, level, title, , dialogue, expressions] = episode;
  const {description, quiz} = localizeEpisode(episode);
  const [question, answers, correct, explanation] = quiz;
  const positions = timestamps[id];
  const completed = state.done.includes(id);
  $('lesson-content').innerHTML = `
    <div class="lesson-top"><div><span class="tag">${themeTitle(topic)} · ${level}</span><h2 id="lesson-title" lang="en">${title}</h2><p class="muted">${description}</p></div><button class="close" aria-label="${t('close')}" autofocus>×</button></div>
    <audio id="audio" src="audio/${id}.mp3?v=2" controls preload="metadata" aria-label="${t('player')}"></audio>
    <div class="player-settings"><button class="secondary" id="back">−10 s</button><label for="speed">${t('speed')}</label><select id="speed">
    ${[0.75, 1, 1.25, 1.5].map(rate => `<option value="${rate}">${rate.toLocaleString(document.documentElement.lang)}×</option>`).join('')}</select>
    <span id="audio-status" role="status"></span></div>
    <div class="tabs" aria-label="${t('lesson')}">${['dialogue', 'expressions', 'quiz'].map((name,i) => `<button data-tab="${i}" aria-pressed="${i === 0}" aria-controls="panel-${i}">${t(name)}</button>`).join('')}</div>
    <section id="panel-0"><label><input type="checkbox" id="translation" ${state.language === 'en' ? '' : 'checked'}> ${t('translation')}</label>
    ${dialogue.map(([en, fr], i) => `<div class="line" data-line="${i}"><button class="secondary" data-seek="${i}" aria-label="${t('line')} ${i + 1}">${icon('play')}</button><div><p lang="en">${en}</p><p class="translation" lang="fr" ${state.language === 'en' ? 'hidden' : ''}>${fr}</p></div></div>`).join('')}</section>
    <section id="panel-1" hidden>${expressions.map(([en, fr], i) => `<div class="expression"><div><strong lang="en">${en}</strong><p class="muted" lang="fr">${fr}</p></div><button class="secondary" data-save="${i}"></button></div>`).join('')}</section>
    <section id="panel-2" hidden><h3>${question}</h3><div class="quiz">${answers.map((answer,i) => `<button class="secondary" data-answer="${i}">${answer}</button>`).join('')}</div><p class="feedback" id="feedback" aria-live="polite">${completed ? t('passed') : ''}</p></section>`;
  const audio = $('audio');
  const panel = $('lesson-content');
  const updateSaves = () => panel.querySelectorAll('[data-save]').forEach(button => {
    const saved = state.saved.includes(id + ':' + button.dataset.save);
    button.setAttribute('aria-pressed', saved);
    button.innerHTML = icon('save') + ' ' + t(saved ? 'saved' : 'save');
  });
  updateSaves();
  audio.addEventListener('loadedmetadata', () => {
    if (audio.currentTime === 0 && state.positions[id] < audio.duration - 0.5) audio.currentTime = state.positions[id];
  });
  $('speed').value = state.speeds;
  audio.playbackRate = state.speeds;
  $('speed').onchange = event => {
    state.speeds = Number(event.target.value);
    audio.playbackRate = state.speeds;
    persist();
  };
  const play = () => audio.play().catch(() => {
    if (audio.error) $('audio-status').textContent = t('noAudio');
  });
  audio.addEventListener('error', () => { $('audio-status').textContent = t('noAudio'); });
  audio.addEventListener('timeupdate', () => {
    const active = positions.findLastIndex(start => start <= audio.currentTime);
    panel.querySelectorAll('[data-line]').forEach(line => line.classList.toggle('active', Number(line.dataset.line) === active));
  });
  const savePosition = () => {
    state.positions[id] = audio.ended ? 0 : audio.currentTime;
    persist();
  };
  audio.addEventListener('pause', savePosition);
  audio.addEventListener('ended', savePosition);
  audio.addEventListener('seeked', savePosition);
  $('back').onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
  $('translation').onchange = event => panel.querySelectorAll('.translation').forEach(p => { p.hidden = !event.target.checked; });
  panel.onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    const {tab, seek, save, answer} = button.dataset;
    if (button.matches('.close')) $('lesson').close();
    if (tab !== undefined) {
      panel.querySelectorAll('[data-tab]').forEach(toggle => {
        const selected = toggle.dataset.tab === tab;
        toggle.setAttribute('aria-pressed', selected);
        $('panel-' + toggle.dataset.tab).hidden = !selected;
      });
    }
    if (seek !== undefined) {
      audio.currentTime = positions[Number(seek)];
      play();
    }
    if (save !== undefined) {
      const key = id + ':' + save;
      state.saved = state.saved.includes(key) ? state.saved.filter(item => item !== key) : [...state.saved, key];
      persist();
      updateSaves();
    }
    if (answer !== undefined) {
      panel.querySelectorAll('[data-answer]').forEach(choice => choice.classList.remove('wrong', 'correct'));
      if (Number(answer) === correct) {
        button.classList.add('correct');
        $('feedback').textContent = t('correct') + ' ' + explanation;
        if (!state.done.includes(id)) state.done.push(id);
        persist();
        renderProgress();
      } else {
        button.classList.add('wrong');
        $('feedback').textContent = t('retry');
      }
    }
  };
  $('lesson').showModal();
  if (autoplay) play();
}

function applyLanguage() {
  const language = state.language === 'en' ? 'en' : 'fr';
  document.documentElement.lang = language;
  $('language').value = language;
  document.title = t('title');
  document.querySelector('meta[name="description"]').content = t('description');
  document.querySelectorAll('[data-copy]').forEach(node => { node.textContent = t(node.dataset.copy); });
  document.querySelector('nav').setAttribute('aria-label', t('navigation'));
  document.querySelector('.brand').setAttribute('aria-label', t('home'));
  $('search').setAttribute('aria-label', t('search'));
  $('search').placeholder = t('search');
  $('filters').setAttribute('aria-label', t('topics'));
  $('filters').innerHTML = `<button data-theme="-1">${t('all')} (${episodes.length})</button>` + themeKeys.map((name, i) =>
    `<button data-theme="${i}">${icon(icons[i])}${t(name)} (${topicCounts[i]})</button>`).join('');
  switchView(visibleView);
  renderProgress();
}
$('language').onchange = event => {
  state.language = event.target.value;
  persist();
  applyLanguage();
};
$('filters').onclick = event => {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  theme = Number(button.dataset.theme);
  $('search').value = '';
  renderCatalog();
};
$('search').oninput = renderCatalog;
$('hero-play').onclick = () => openEpisode(episodes[0][0], true);
function browseCatalog() {
  theme = -1;
  $('search').value = '';
  switchView('episodes');
  const heading = $('library-heading');
  heading.focus({preventScroll: true});
  heading.scrollIntoView();
}
$('hero-browse').onclick = browseCatalog;
document.querySelector('nav').onclick = event => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  if (button.dataset.view === 'episodes') browseCatalog();
  else switchView('review');
};
document.querySelector('.brand').onclick = event => {
  event.preventDefault();
  switchView('episodes');
  window.scrollTo(0, 0);
};
document.querySelector('main').onclick = event => {
  const button = event.target.closest('[data-episode]');
  if (button) openEpisode(button.dataset.episode);
};
$('lesson').addEventListener('close', () => {
  $('audio')?.pause();
  if (visibleView === 'review') renderReview();
  else renderCatalog();
  const card = document.querySelector('[data-episode="' + openId + '"]');
  if (document.activeElement === document.body) (card || $('hero-play')).focus();
});
applyLanguage();

if (window.isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(error => {
    console.warn('Le mode hors ligne est indisponible.', error);
  });
}
