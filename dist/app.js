const $ = id => document.getElementById(id);
const themes = ['Quotidien', 'Entreprise', 'Voyage'];
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
let theme = -1;
let openId;
let visibleView = 'episodes';

function cards(items) {
  return items.map(([id, topic, level, title, description]) => {
    const done = state.done.includes(id);
    return `<button class="card" data-episode="${id}">
      <span class="card-top"><span class="art theme-${topic}">${icon(icons[topic])}</span><span class="tag">${themes[topic]}</span><span class="level">${level}</span></span>
      <strong lang="en">${title}</strong><span class="desc">${description}</span>
      <span class="card-foot">${done ? 'Terminé · Réécouter' : state.positions[id] > 0 ? 'Reprendre' : 'Écouter'}${icon(done ? 'check' : 'play')}</span></button>`;
  }).join('');
}
function renderCatalog() {
  const query = normalize($('search').value);
  const filtered = episodes.filter(([, topic, level, title, desc]) =>
    (theme < 0 || theme === topic) &&
    normalize([themes[topic], level, title, desc].join(' ')).includes(query));
  $('count').textContent = filtered.length + (filtered.length === 1 ? ' épisode' : ' épisodes') + ' · Niveaux A2 à B2';
  $('episodes').innerHTML = cards(filtered) || '<p class="empty">Aucun épisode pour cette recherche.</p>';
  $('filters').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.theme) === theme));
}
function renderProgress() {
  $('progress').textContent = state.done.length + ' / ' + episodes.length + ' terminés';
}
function renderReview() {
  const used = episodes.flatMap(([id, , , title, , , expressions]) => expressions.map(([en, fr], i) =>
    state.saved.includes(id + ':' + i) ? `<div class="expression"><div><strong lang="en">${en}</strong><details><summary>Voir la traduction</summary><p>${fr}</p></details></div><button class="secondary" data-episode="${id}">${title}</button></div>` : '').filter(Boolean));
  $('saved').innerHTML = used.join('') || '<p class="muted">Enregistrez les expressions à revoir depuis un épisode.</p>';
  $('completed').innerHTML = cards(episodes.filter(([id]) => state.done.includes(id))) || '<p class="muted">Réussissez un quiz pour ajouter un épisode ici.</p>';
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
  const [, topic, level, title, description, dialogue, expressions, quiz] = episode;
  const [question, answers, correct, explanation] = quiz;
  const positions = timestamps[id];
  const completed = state.done.includes(id);
  $('lesson-content').innerHTML = `
    <div class="lesson-top"><div><span class="tag">${themes[topic]} · ${level}</span><h2 id="lesson-title" lang="en">${title}</h2><p class="muted">${description}</p></div><button class="close" aria-label="Fermer" autofocus>×</button></div>
    <audio id="audio" src="audio/${id}.mp3" controls preload="metadata" aria-label="Lecteur de l’épisode"></audio>
    <div class="player-settings"><button class="secondary" id="back">−10 s</button><label for="speed">Vitesse</label><select id="speed">
    <option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option></select>
    <span id="audio-status" role="status"></span></div>
    <div class="tabs" aria-label="Contenu de l’épisode">${['Dialogue', 'Expressions', 'Quiz'].map((name,i) => `<button data-tab="${i}" aria-pressed="${i === 0}" aria-controls="panel-${i}">${name}</button>`).join('')}</div>
    <section id="panel-0"><label><input type="checkbox" id="translation" checked> Afficher la traduction</label>
    ${dialogue.map(([en, fr], i) => `<div class="line" data-line="${i}"><button class="secondary" data-seek="${i}" aria-label="Écouter la réplique ${i + 1}">${icon('play')}</button><div><p lang="en">${en}</p><p class="translation">${fr}</p></div></div>`).join('')}</section>
    <section id="panel-1" hidden>${expressions.map(([en, fr], i) => `<div class="expression"><div><strong lang="en">${en}</strong><p class="muted">${fr}</p></div><button class="secondary" data-save="${i}"></button></div>`).join('')}</section>
    <section id="panel-2" hidden><h3>${question}</h3><div class="quiz">${answers.map((answer,i) => `<button class="secondary" data-answer="${i}">${answer}</button>`).join('')}</div><p class="feedback" id="feedback" aria-live="polite">${completed ? 'Quiz déjà réussi. Vous pouvez le refaire.' : ''}</p></section>`;
  const audio = $('audio');
  const panel = $('lesson-content');
  const updateSaves = () => panel.querySelectorAll('[data-save]').forEach(button => {
    const saved = state.saved.includes(id + ':' + button.dataset.save);
    button.setAttribute('aria-pressed', saved);
    button.innerHTML = icon('save') + (saved ? ' Enregistrée' : ' Enregistrer');
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
    if (audio.error) $('audio-status').textContent = 'Audio indisponible.';
  });
  audio.addEventListener('error', () => { $('audio-status').textContent = 'Audio indisponible.'; });
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
        $('feedback').textContent = 'Bonne réponse ! ' + explanation;
        if (!state.done.includes(id)) state.done.push(id);
        persist();
        renderProgress();
      } else {
        button.classList.add('wrong');
        $('feedback').textContent = 'Réécoutez le dialogue ou essayez une autre réponse.';
      }
    }
  };
  $('lesson').showModal();
  if (autoplay) play();
}

$('filters').innerHTML = '<button data-theme="-1">Tous</button>' + themes.map((name, i) =>
  `<button data-theme="${i}">${icon(icons[i])}${name}</button>`).join('');
$('filters').onclick = event => {
  const button = event.target.closest('[data-theme]');
  if (!button) return;
  theme = Number(button.dataset.theme);
  renderCatalog();
};
$('search').oninput = renderCatalog;
$('hero-play').onclick = () => openEpisode(episodes[0][0], true);
document.querySelector('nav').onclick = event => {
  const button = event.target.closest('[data-view]');
  if (button) switchView(button.dataset.view);
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
renderCatalog();
renderProgress();

if (window.isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(error => {
    console.warn('Le mode hors ligne est indisponible.', error);
  });
}
