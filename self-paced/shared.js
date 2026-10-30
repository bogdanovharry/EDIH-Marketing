/* Shared deck engine for the self-paced Module IV.
   - slide navigation (arrows, dots, buttons, postMessage from the shell)
   - selected profile ("sme" | "public") -> <html data-profile>
   - prompt copy buttons, video slots
   Decks include: <script src="shared.js"></script> at the end of <body>. */
(function () {
    var PROFILE_KEY = 'm4-profile';

    function readStore(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeStore(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* private mode: ignore */ }
    }

    /* ── Profile ── */
    function applyProfile(p) {
        if (p === 'sme' || p === 'public') document.documentElement.dataset.profile = p;
    }
    var fromUrl = new URLSearchParams(location.search).get('profile');
    var stored = readStore(PROFILE_KEY);
    if (fromUrl === 'sme' || fromUrl === 'public') { stored = fromUrl; writeStore(PROFILE_KEY, fromUrl); }
    applyProfile(stored);
    window.M4 = {
        getProfile: function () { return document.documentElement.dataset.profile || null; },
        setProfile: function (p) {
            writeStore(PROFILE_KEY, p);
            applyProfile(p);
            if (window.parent !== window) window.parent.postMessage({ type: 'profile-changed', profile: p }, '*');
        }
    };

    /* ── Deck ── */
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    if (!slides.length) return;
    var deckId = document.body.dataset.deck || location.pathname;
    var current = 0;

    var dotsEl = document.querySelector('.nav-progress');
    var infoEl = document.querySelector('.nav-info');
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    slides.forEach(function (s, i) {
        var num = s.querySelector('.slide-number');
        if (num) num.textContent = pad(i + 1) + ' / ' + pad(slides.length);
        if (dotsEl) {
            var d = document.createElement('div');
            d.className = 'nav-dot';
            d.addEventListener('click', function () { show(i); });
            dotsEl.appendChild(d);
        }
    });

    function show(i) {
        current = Math.max(0, Math.min(slides.length - 1, i));
        slides.forEach(function (s, k) { s.classList.toggle('active', k === current); });
        if (dotsEl) Array.prototype.forEach.call(dotsEl.children, function (d, k) { d.classList.toggle('active', k === current); });
        if (infoEl) infoEl.textContent = pad(current + 1) + ' / ' + pad(slides.length);
        writeStore('m4-pos-' + deckId, String(current));
        if (typeof onSlide === 'function') onSlide(slides[current]);
        if (window.parent !== window) window.parent.postMessage({ type: 'progress', deck: deckId, index: current, total: slides.length }, '*');
    }

    function next() {
        if (current < slides.length - 1) show(current + 1);
        else if (window.parent !== window) window.parent.postMessage({ type: 'next-section-arrow' }, '*');
    }
    function prev() {
        if (current > 0) show(current - 1);
        else if (window.parent !== window) window.parent.postMessage({ type: 'prev-section-arrow' }, '*');
    }

    function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }
    document.addEventListener('keydown', function (e) {
        if (isTyping(e.target)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') next();
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev();
    });
    window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || !d.type) return;
        if (d.type === 'keydown') { if (d.key === 'ArrowRight') next(); else if (d.key === 'ArrowLeft') prev(); }
        if (d.type === 'go-to-last-slide') show(slides.length - 1);
        if (d.type === 'profile') applyProfile(d.profile);
    });
    var btnPrev = document.querySelector('[data-nav="prev"]');
    var btnNext = document.querySelector('[data-nav="next"]');
    if (btnPrev) btnPrev.addEventListener('click', prev);
    if (btnNext) btnNext.addEventListener('click', next);

    /* ── Plan store: profile + sections of the final marketing plan ──
       Lives in localStorage ('m4-plan'); inside the shell (index.html) it is also mirrored in the parent window,
       because file:// pages do not always share storage. Newer timestamp wins. */
    var SECTIONS = [
        { key: 'audit', n: 1, title: 'Профил и изходно положение' },
        { key: 'offer', n: 2, title: 'Предложение и позициониране' },
        { key: 'audience', n: 3, title: 'Аудитория и път на клиента' },
        { key: 'rivals', n: 4, title: 'Конкуренти и аналози' },
        { key: 'goal', n: 5, title: 'Цел и показатели' },
        { key: 'channels', n: 6, title: 'Канали и роля на всеки' },
        { key: 'voice', n: 7, title: 'Бранд кит: глас, цветове, стил', also: ['visuals'] },
        { key: 'content', n: 8, title: 'Съдържание и календар за 30 дни' },
        { key: 'web', n: 9, title: 'Google профил и сайт' },
        { key: 'email', n: 10, title: 'Имейл и съобщения' },
        { key: 'ads', n: 11, title: 'Реклама (по избор)', optional: true },
        { key: 'auto', n: 12, title: 'Бюджет, време и автоматизации' },
        { key: 'kpi', n: 13, title: 'Мерене и седмично табло' },
        { key: 'policy', n: 14, title: 'Правила за ИИ, рискове и следващи стъпки', also: ['next', 'training'] }
    ];
    var plan = loadPlan();
    var planListeners = [];
    function loadPlan() {
        var p = {};
        try { p = JSON.parse(readStore('m4-plan') || '{}') || {}; } catch (e) { p = {}; }
        p.profile = p.profile || {}; p.sections = p.sections || {}; p.ts = p.ts || 0;
        return p;
    }
    function planChanged() { planListeners.forEach(function (f) { try { f(); } catch (e) {} }); }
    function savePlan() {
        plan.ts = Date.now();
        writeStore('m4-plan', JSON.stringify(plan));
        if (window.parent !== window) window.parent.postMessage({ type: 'plan-set', plan: plan }, '*');
        planChanged();
    }
    window.addEventListener('message', function (e) {
        var d = e.data;
        if (d && d.type === 'plan-sync' && d.plan && (d.plan.ts || 0) > plan.ts) {
            plan = d.plan; plan.profile = plan.profile || {}; plan.sections = plan.sections || {};
            writeStore('m4-plan', JSON.stringify(plan));
            bindFields(); planChanged();
        }
    });
    if (window.parent !== window) window.parent.postMessage({ type: 'plan-get' }, '*');

    var timers = {};
    function bindFlags() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-plan-flag]'), function (el) { el.checked = plan.profile[el.dataset.planFlag] === '1'; });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-flag]'), function (el) {
        el.addEventListener('change', function () { plan.profile[el.dataset.planFlag] = el.checked ? '1' : ''; savePlan(); });
    });
    function bindFields() {
        bindFlags();
        Array.prototype.forEach.call(document.querySelectorAll('[data-plan-profile], [data-plan-section]'), function (el) {
            if (document.activeElement === el) return;
            var v = el.hasAttribute('data-plan-profile') ? plan.profile[el.dataset.planProfile] : plan.sections[el.dataset.planSection];
            el.value = v || '';
        });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-profile], [data-plan-section]'), function (el) {
        el.addEventListener('input', function () {
            var isP = el.hasAttribute('data-plan-profile'), k = isP ? el.dataset.planProfile : el.dataset.planSection;
            clearTimeout(timers[k]);
            timers[k] = setTimeout(function () { (isP ? plan.profile : plan.sections)[k] = el.value; savePlan(); }, 250);
        });
    });
    function updateStatuses() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-plan-status]'), function (st) {
            var k = st.dataset.planStatus, filled = (plan.sections[k] || '').trim().length > 0;
            st.textContent = filled ? '✓ Записано в плана' : 'Още не е записано в плана';
            st.classList.toggle('ok', filled);
        });
    }
    planListeners.push(updateStatuses);

    /* prompt boxes with {{profile.key|подсказка}} / {{sec.key|подсказка}} are filled from the plan */
    Array.prototype.forEach.call(document.querySelectorAll('.prompt-box'), function (box) {
        var tpl = box.textContent;
        if (tpl.indexOf('{{') < 0) return;
        var span = document.createElement('span'); span.className = 'pb-text';
        box.textContent = ''; box.appendChild(span);
        var render = function () {
            span.textContent = tpl.replace(/\{\{\s*(profile|sec)\.([a-z]+)\s*(?:\|([^}]*))?\}\}/g, function (m, kind, key, hint) {
                var v = ((kind === 'profile' ? plan.profile : plan.sections)[key] || '').trim();
                return v || '[' + (hint || key).trim() + ']';
            });
        };
        planListeners.push(render); render();
    });

    /* ── Chosen AI tool: 'chatgpt' | 'claude' | 'gemini' | 'all' (stored in the plan profile, so it follows the plan store) ── */
    function applyTool() { document.documentElement.dataset.tool = plan.profile.tool || 'all'; Array.prototype.forEach.call(document.querySelectorAll('[data-tool-set]'), function (b) { b.classList.toggle('on', b.dataset.toolSet === (plan.profile.tool || 'all')); }); }
    planListeners.push(applyTool);
    Array.prototype.forEach.call(document.querySelectorAll('[data-tool-set]'), function (b) {
        b.addEventListener('click', function () { plan.profile.tool = b.dataset.toolSet; savePlan(); });
    });
    applyTool();
    window.M4.getTool = function () { return plan.profile.tool || 'all'; };

    window.M4.plan = {
        sections: SECTIONS,
        get: function () { return plan; },
        onChange: function (f) { planListeners.push(f); },
        filled: function (k) { return (plan.sections[k] || '').trim().length > 0; },
        count: function () { return SECTIONS.filter(function (s) { return (plan.sections[s.key] || '').trim().length > 0; }).length; },
        clear: function () { plan = { profile: {}, sections: {}, ts: 0 }; savePlan(); bindFields(); },
        setAll: function (profile, sections) { plan.profile = JSON.parse(JSON.stringify(profile)); plan.sections = JSON.parse(JSON.stringify(sections)); savePlan(); bindFields(); },
        setProfile: function (obj) { Object.keys(obj).forEach(function (k) { plan.profile[k] = obj[k]; }); savePlan(); bindFields(); }
    };
    bindFields(); updateStatuses();

    /* ── Copy buttons for prompt boxes ── */
    Array.prototype.forEach.call(document.querySelectorAll('.prompt-box'), function (box) {
        var btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.textContent = 'Копирай';
        btn.addEventListener('click', function () {
            var text = box.cloneNode(true);
            var b = text.querySelector('.copy-btn');
            if (b) b.remove();
            var val = text.textContent.trim();
            var done = function () { btn.textContent = 'Копирано ✓'; setTimeout(function () { btn.textContent = 'Копирай'; }, 1600); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(val).then(done, function () {});
        });
        box.appendChild(btn);
    });

    /* ── Video slots: <div class="video-slot" data-src="https://www.youtube-nocookie.com/embed/ID"> ── */
    Array.prototype.forEach.call(document.querySelectorAll('.video-slot'), function (slot) {
        var src = slot.dataset.src;
        if (src) {
            slot.textContent = '';
            var f = document.createElement('iframe');
            f.src = src;
            f.title = slot.dataset.title || 'Видео';
            f.allow = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';
            f.allowFullscreen = true;
            slot.appendChild(f);
        }
    });

    /* ── Click-to-reveal cards: <div class="rev" role="button" tabindex="0">…<div class="rev-a">…</div></div> ── */
    Array.prototype.forEach.call(document.querySelectorAll('.rev'), function (el) {
        var toggle = function () {
            var open = el.classList.toggle('open');
            el.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        el.setAttribute('aria-expanded', 'false');
        el.addEventListener('click', toggle);
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });

    /* ── Quiz: .quiz > .quiz-opt[data-right] with data-fb feedback ── */
    Array.prototype.forEach.call(document.querySelectorAll('.quiz'), function (quiz) {
        var opts = quiz.querySelectorAll('.quiz-opt');
        var fb = quiz.querySelector('.quiz-fb');
        Array.prototype.forEach.call(opts, function (opt) {
            opt.addEventListener('click', function () {
                var right = opt.hasAttribute('data-right');
                opt.classList.add(right ? 'right' : 'wrong');
                if (right) Array.prototype.forEach.call(opts, function (o) { o.disabled = true; });
                if (fb) { fb.textContent = opt.dataset.fb || ''; fb.classList.add('on'); }
            });
        });
    });

    /* ── Checklist progress: [data-progress] holds checkboxes; .progress + .progress-label show the count ── */
    Array.prototype.forEach.call(document.querySelectorAll('[data-progress]'), function (box) {
        var inputs = box.querySelectorAll('input[type=checkbox]');
        var bar = box.querySelector('.progress > div');
        var label = box.querySelector('.progress-label');
        var update = function () {
            var n = box.querySelectorAll('input:checked').length;
            if (bar) bar.style.width = (100 * n / inputs.length) + '%';
            if (label) label.textContent = n === inputs.length ? 'Готово! Задачата е изпълнена ✓' : n + ' от ' + inputs.length + ' стъпки';
        };
        Array.prototype.forEach.call(inputs, function (i) { i.addEventListener('change', update); });
        update();
    });

    /* ── Interactive explainer player ──
       <div class="xp-wrap"><div class="xp"> <div class="xp-scene" data-dur="7000" data-cap="субтитри" [data-wait]> … </div> … </div>
       <div class="xp-ctl" data-xp-controls></div></div>
       Inside a scene: .xp-a[data-at=ms] fades in at that time; .xp-type[data-at][data-text] types its text;
       .xp-hot / .xp-day toggle .found on click. A scene with data-wait holds at its end until "Продължи". */
    var players = [];
    function createPlayer(root) {
        var stage = root.querySelector('.xp');
        var scenes = Array.prototype.slice.call(stage.querySelectorAll('.xp-scene'));
        var durs = scenes.map(function (s) { return parseInt(s.dataset.dur, 10) || 6000; });
        var total = durs.reduce(function (a, b) { return a + b; }, 0);
        var released = scenes.map(function () { return false; });
        var idx = 0, el = 0, playing = false, lastT = 0, raf = 0, shownIdx = -1, voiceOn = false;

        var cap = document.createElement('div'); cap.className = 'xp-cap'; stage.appendChild(cap);
        var cont = document.createElement('button'); cont.type = 'button'; cont.className = 'xp-continue'; cont.textContent = 'Продължи ▶'; stage.appendChild(cont);

        /* motion layer: kinetic titles, chapter pills, badge, cursor spotlight */
        function splitWords(node, c) {
            Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
                if (ch.nodeType === 3) {
                    var frag = document.createDocumentFragment();
                    ch.textContent.split(/(\s+)/).forEach(function (part) {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                        var w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', c.n++); w.textContent = part; frag.appendChild(w);
                    });
                    node.replaceChild(frag, ch);
                } else if (ch.nodeType === 1) splitWords(ch, c);
            });
        }
        Array.prototype.forEach.call(stage.querySelectorAll('.xp-t'), function (t) { t.classList.add('xp-kin'); splitWords(t, { n: 0 }); });
        var chap = document.createElement('div'); chap.className = 'xp-chap';
        var pills = scenes.map(function (s, k) {
            var i = document.createElement('i'); i.title = 'Сцена ' + (k + 1);
            i.addEventListener('click', function (e) { e.stopPropagation(); seek((before(k) + 1) / total); });
            chap.appendChild(i); return i;
        });
        stage.appendChild(chap);
        var badge = document.createElement('div'); badge.className = 'xp-badge'; badge.textContent = 'ЕДИХ · Интерактивно видео'; stage.appendChild(badge);
        stage.addEventListener('pointermove', function (e) {
            var r = stage.getBoundingClientRect();
            stage.style.setProperty('--mx', (100 * (e.clientX - r.left) / r.width) + '%');
            stage.style.setProperty('--my', (100 * (e.clientY - r.top) / r.height) + '%');
        });

        var ctl = root.querySelector('[data-xp-controls]');
        ctl.className = 'xp-ctl';
        ctl.innerHTML = '<button type="button" data-a="play" aria-label="Пауза/Пусни">❚❚</button><button type="button" data-a="restart" aria-label="От начало">↻</button><div class="xp-bar" role="slider" aria-label="Напредък"><div></div></div><div class="xp-time"></div><button type="button" data-a="voice" title="Озвучаване с глас на браузъра (ако има български)">🔊</button>';
        var bPlay = ctl.querySelector('[data-a=play]'), bRe = ctl.querySelector('[data-a=restart]'), bVoice = ctl.querySelector('[data-a=voice]');
        var barWrap = ctl.querySelector('.xp-bar'), bar = barWrap.firstChild, timeEl = ctl.querySelector('.xp-time');
        var fmt = function (ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };
        var before = function (i) { var t = 0; for (var k = 0; k < i; k++) t += durs[k]; return t; };

        function speak(text) {
            if (!voiceOn || !window.speechSynthesis) return;
            window.speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text); u.lang = 'bg-BG';
            var v = window.speechSynthesis.getVoices().filter(function (x) { return /^bg/i.test(x.lang); })[0];
            if (v) u.voice = v;
            window.speechSynthesis.speak(u);
        }
        function render() {
            var scene = scenes[idx];
            if (shownIdx !== idx) {
                scenes.forEach(function (s, k) { s.classList.toggle('on', k === idx); });
                Array.prototype.forEach.call(scene.querySelectorAll('.xp-a, .xp-type'), function (n) { n.classList.remove('in', 'xp-done'); if (n.classList.contains('xp-type')) n.textContent = ''; });
                cap.textContent = scene.dataset.cap || '';
                shownIdx = idx;
                speak(cap.textContent);
            }
            Array.prototype.forEach.call(scene.querySelectorAll('.xp-a'), function (n) {
                if (el >= (parseInt(n.dataset.at, 10) || 0)) n.classList.add('in'); else n.classList.remove('in');
            });
            Array.prototype.forEach.call(scene.querySelectorAll('.xp-type'), function (n) {
                var at = parseInt(n.dataset.at, 10) || 0, txt = n.dataset.text || '';
                var k = Math.max(0, Math.min(txt.length, Math.floor((el - at) / 28)));
                n.classList.toggle('in', el >= at);
                if (n.dataset.k !== String(k)) { n.textContent = txt.slice(0, k); n.dataset.k = String(k); }
                n.classList.toggle('xp-done', k >= txt.length);
            });
            Array.prototype.forEach.call(scene.querySelectorAll('.xp-count'), function (n) {
                var at = parseInt(n.dataset.at, 10) || 0, to = parseFloat(n.dataset.to) || 0, from = parseFloat(n.dataset.from) || 0, cd = parseInt(n.dataset.cdur, 10) || 1500;
                var q = Math.max(0, Math.min(1, (el - at) / cd)); q = 1 - Math.pow(1 - q, 3);
                n.textContent = (n.dataset.pre || '') + Math.round(from + (to - from) * q) + (n.dataset.suf || '');
            });
            Array.prototype.forEach.call(scene.querySelectorAll('.xp-meter:not(.auto)'), function (m) {
                var steps = m.querySelectorAll('.m-steps span'), at0 = parseInt(m.dataset.at, 10) || 0, gap = parseInt(m.dataset.gap, 10) || 900, n = 0;
                Array.prototype.forEach.call(steps, function (sp, k) { var on = el >= at0 + k * gap; sp.classList.toggle('on', on); if (on) n++; });
                m.style.setProperty('--w', n / steps.length);
                var out = m.querySelector('.xp-pct'); if (out) out.textContent = Math.round(100 * n / steps.length) + '%';
            });
            pills.forEach(function (pl, k) { pl.style.setProperty('--p', k < idx ? 1 : (k === idx ? Math.min(1, el / durs[idx]) : 0)); });
            var wait = scene.hasAttribute('data-wait') && !released[idx] && el >= durs[idx];
            cont.classList.toggle('on', wait);
            var g = before(idx) + el;
            bar.style.width = (100 * g / total) + '%';
            timeEl.textContent = fmt(g) + ' / ' + fmt(total);
            bPlay.textContent = playing ? '❚❚' : (g >= total ? '↻' : '▶');
        }
        function tick(now) {
            var dt = Math.min(100, now - lastT); lastT = now;
            if (playing) {
                el += dt;
                if (el >= durs[idx]) {
                    if (scenes[idx].hasAttribute('data-wait') && !released[idx]) { el = durs[idx]; }
                    else if (idx < scenes.length - 1) { idx++; el = 0; }
                    else { el = durs[idx]; playing = false; }
                }
            }
            render();
            raf = (playing || cont.classList.contains('on')) ? requestAnimationFrame(tick) : 0;
        }
        function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
        function atEnd() { return idx === scenes.length - 1 && el >= durs[idx] && (!scenes[idx].hasAttribute('data-wait') || released[idx]); }
        function play() { if (atEnd()) restart(); else { playing = true; kick(); } }
        function pause() { playing = false; if (window.speechSynthesis) window.speechSynthesis.cancel(); render(); }
        function restart() { released = scenes.map(function () { return false; }); Array.prototype.forEach.call(stage.querySelectorAll('.found'), function (n) { n.classList.remove('found'); }); idx = 0; el = 0; shownIdx = -1; playing = true; kick(); }
        function seek(frac) {
            var t = frac * total, k = 0;
            while (k < scenes.length - 1 && t >= before(k) + durs[k]) k++;
            for (var i = k; i < scenes.length; i++) released[i] = false;
            idx = k; el = Math.max(0, t - before(k)); shownIdx = -1; kick(); render();
        }
        bPlay.addEventListener('click', function () { if (playing) pause(); else play(); });
        bRe.addEventListener('click', restart);
        barWrap.addEventListener('click', function (e) { var r = barWrap.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); });
        cont.addEventListener('click', function () {
            released[idx] = true;
            if (idx < scenes.length - 1) { idx++; el = 0; playing = true; } else { playing = false; }
            kick(); render();
        });
        bVoice.addEventListener('click', function () {
            if (!window.speechSynthesis) { bVoice.disabled = true; bVoice.title = 'Браузърът не поддържа озвучаване'; return; }
            voiceOn = !voiceOn; bVoice.classList.toggle('on', voiceOn);
            if (voiceOn) speak(cap.textContent); else window.speechSynthesis.cancel();
        });
        Array.prototype.forEach.call(stage.querySelectorAll('.xp-hot, .xp-day'), function (h) {
            h.addEventListener('click', function () { h.classList.add('found'); });
        });
        render();
        return {
            start: function () { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { restart(); pause(); } else restart(); },
            stop: function () { pause(); }
        };
    }
    Array.prototype.forEach.call(document.querySelectorAll('.xp-wrap'), function (w) { players.push({ root: w, p: createPlayer(w) }); });

    /* ── Auto-playing chat: messages appear one by one when the slide is shown ── */
    var chatTimers = [];
    function stopChats() { chatTimers.forEach(clearTimeout); chatTimers = []; }
    function playChat(chat) {
        var msgs = chat.querySelectorAll('.msg');
        var typing = chat.querySelector('.typing');
        Array.prototype.forEach.call(msgs, function (m) { m.classList.remove('shown'); });
        if (typing) typing.classList.remove('on');
        var t = 400;
        Array.prototype.forEach.call(msgs, function (m) {
            var isAi = m.classList.contains('ai');
            if (isAi && typing) {
                chatTimers.push(setTimeout(function () { chat.insertBefore(typing, m); typing.classList.add('on'); }, t));
                t += 1300;
            }
            chatTimers.push(setTimeout(function () { if (typing) typing.classList.remove('on'); m.classList.add('shown'); }, t));
            t += isAi ? 1800 : 900;
        });
    }
    function onSlide(slide) {
        stopChats();
        players.forEach(function (x) { if (!slide.contains(x.root)) x.p.stop(); });
        players.forEach(function (x) { if (slide.contains(x.root)) x.p.start(); });
        Array.prototype.forEach.call(slide.querySelectorAll('.chat.auto'), function (chat) {
            if (chat.offsetParent !== null) playChat(chat);   // skip the chat of the other profile
        });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.replay'), function (b) {
        b.addEventListener('click', function () { stopChats(); playChat(b.closest('.chat')); });
    });
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'profile') setTimeout(function () { onSlide(slides[current]); }, 50);
    });

    var startAt = parseInt(readStore('m4-pos-' + deckId), 10);
    show(document.body.dataset.resume === 'true' && startAt >= 0 && startAt < slides.length ? startAt : 0);
})();
