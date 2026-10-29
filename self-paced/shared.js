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
