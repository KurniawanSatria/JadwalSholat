// API primer: muslim-api sendiri (offline, CORS terbuka). Fallback: myquran + proxy.
const PRIMARY_API = 'https://islamic-api.vercel.app';
const FALLBACK_API = 'https://api.myquran.com/v3';
// Kandidat endpoint dicoba berurutan sampai ada yang ok
const API_CANDIDATES = [
    path => PRIMARY_API + path,                                              // muslim-api langsung
    path => FALLBACK_API + path,                                             // myquran langsung
    path => `https://corsproxy.io/?url=${encodeURIComponent(FALLBACK_API + path)}`,
    path => `https://api.allorigins.win/raw?url=${encodeURIComponent(FALLBACK_API + path)}`,
];

async function apiFetch(path) {
    for (const buildUrl of API_CANDIDATES) {
        try {
            const res = await fetch(buildUrl(path), { signal: AbortSignal.timeout(7000) });
            if (res.ok) return res;
        } catch (e) { /* coba kandidat berikutnya */ }
    }
    throw new Error('Semua API gagal');
}

let currentKota = null;
let currentDate = todayStr();
let countdownInterval = null;
let allKota = [];
let activeDescendantIdx = -1;

const PRAYERS = [
    { key: 'subuh', name: 'Subuh', en: 'Fajr', bg: 'rgba(26,92,90,0.1)', icon: 'moon', color: '#1a5c5a' },
    { key: 'dzuhur', name: 'Dzuhur', en: 'Dhuhr', bg: 'rgba(200,150,62,0.12)', icon: 'sun', color: '#c8963e' },
    { key: 'ashar', name: 'Ashar', en: 'Asr', bg: 'rgba(230,160,40,0.12)', icon: 'sun-medium', color: '#e0960a' },
    { key: 'maghrib', name: 'Maghrib', en: 'Maghrib', bg: 'rgba(200,80,60,0.1)', icon: 'sunset', color: '#c85040' },
    { key: 'isya', name: 'Isya', en: 'Isha', bg: 'rgba(60,60,130,0.1)', icon: 'star', color: '#4040aa' },
];

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Yield to main thread to keep INP < 50ms (performance guide)
async function yieldToMain() {
    if ('scheduler' in window && 'yield' in scheduler) {
        return await scheduler.yield();
    }
    return new Promise(resolve => setTimeout(resolve, 0));
}

function debounce(fn, wait = 180) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function refreshIcons(root) {
    if (window.lucide?.createIcons) {
        try {
            if (root) lucide.createIcons({ attrs: { 'aria-hidden': 'true' }, nodes: [root] });
            else lucide.createIcons({ attrs: { 'aria-hidden': 'true' } });
        } catch (e) { /* icons are decorative, ignore */ }
    }
}

// ── Load semua kota saat init (StaleWhileRevalidate lite) ─────────────
async function loadAllKota() {
    const status = document.getElementById('searchStatus');
    const input = document.getElementById('searchInput');
    input.placeholder = 'Memuat daftar kota...';
    input.disabled = true;

    // Serve stale cache instantly, revalidate in background
    try {
        const cached = localStorage.getItem('jadwalsholat:kota:v2');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed.data) && parsed.data.length) {
                allKota = parsed.data;
                input.placeholder = `Cari dari ${allKota.length} kota / kabupaten...`;
                input.disabled = false;
            }
        }
    } catch (e) { /* ignore corrupt cache */ }

    try {
        const res = await apiFetch('/sholat/kabkota/semua');
        const data = await res.json();
        allKota = data.data || [];
        try {
            localStorage.setItem('jadwalsholat:kota:v2', JSON.stringify({ data: allKota, ts: Date.now() }));
        } catch (e) { /* quota, ignore */ }
        input.placeholder = `Cari dari ${allKota.length} kota / kabupaten...`;
        input.disabled = false;
        if (!cachedHadData()) input.focus({ preventScroll: true });
        status.textContent = `✓ ${allKota.length} kota tersedia`;
        setTimeout(() => { if (status.textContent.startsWith('✓')) status.textContent = ''; }, 3500);
    } catch (e) {
        if (!allKota.length) {
            input.placeholder = 'Gagal memuat kota — coba refresh halaman';
            input.disabled = false;
            status.textContent = '⚠ Gagal terhubung ke API';
        } else {
            status.textContent = `✓ ${allKota.length} kota tersedia (offline)`;
        }
    }

    function cachedHadData() { return allKota.length > 0; }
}

// ── Wikipedia city info ────────────────────────────────────────────
const WIKI_TITLES = {
    'JAKARTA': 'Jakarta',
    'SURABAYA': 'Surabaya',
    'BANDUNG': 'Bandung',
    'MEDAN': 'Medan',
    'SEMARANG': 'Semarang',
    'YOGYAKARTA': 'Daerah Istimewa Yogyakarta',
    'JOGJA': 'Daerah Istimewa Yogyakarta',
    'MAKASSAR': 'Makassar',
    'PALEMBANG': 'Palembang',
    'PEKANBARU': 'Pekanbaru',
    'DENPASAR': 'Denpasar',
    'BALI': 'Bali',
    'MALANG': 'Kota Malang',
    'BOGOR': 'Kota Bogor',
    'DEPOK': 'Kota Depok',
    'TANGERANG': 'Kota Tangerang',
    'BEKASI': 'Kota Bekasi',
    'ACEH': 'Banda Aceh',
    'LOMBOK': 'Lombok',
    'MANADO': 'Manado',
    'PONTIANAK': 'Pontianak',
    'SAMARINDA': 'Samarinda',
    'BALIKPAPAN': 'Balikpapan',
    'KEDIRI': 'Kota Kediri',
    'SOLO': 'Surakarta',
    'SURAKARTA': 'Surakarta',
    'PADANG': 'Padang, Sumatera Barat',
    'MATARAM': 'Mataram',
    'JAYAPURA': 'Jayapura',
    'KUPANG': 'Kupang',
    'CIREBON': 'Cirebon',
    'TASIKMALAYA': 'Tasikmalaya',
    'SERANG': 'Serang',
    'BATAM': 'Batam',
};

const FALLBACK_GRADIENTS = [
    'linear-gradient(160deg,#0d3320,#1a5c5a)',
    'linear-gradient(160deg,#1a2a3a,#2d5a6b)',
    'linear-gradient(160deg,#2a1a10,#6b3a1a)',
    'linear-gradient(160deg,#1a1a2a,#3a2d6b)',
    'linear-gradient(160deg,#0d2020,#1a4040)',
];

async function loadCityInfo(lokasi) {
    const bg = document.getElementById('locationBg');
    const desc = document.getElementById('locationDesc');
    const wlink = document.getElementById('locationWikiLink');
    const prov = document.getElementById('locationProvince');
    if (!bg) return;

    bg.removeAttribute('style');
    bg.style.position = 'absolute';
    bg.style.inset = '0';
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.transition = 'filter 0.6s ease';
    bg.style.backgroundImage = 'none';
    bg.style.filter = 'none';
    desc.textContent = '';
    wlink.hidden = true;
    if (prov) prov.textContent = '';

    const upper = lokasi.toUpperCase();
    let wikiTitle = Object.entries(WIKI_TITLES).find(([k]) => upper.includes(k))?.[1];
    if (!wikiTitle) {
        wikiTitle = lokasi
            .replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, '')
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    const idx = lokasi.charCodeAt(0) % FALLBACK_GRADIENTS.length;
    bg.style.backgroundImage = FALLBACK_GRADIENTS[idx];

    try {
        const url = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();

        const imgUrl = data.thumbnail?.source || data.originalimage?.source;
        if (imgUrl) {
            const hiRes = imgUrl.replace(/\/\d+px-/, '/800px-');
            const tryLoad = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.decoding = 'async';
                img.onload = () => resolve(src);
                img.onerror = reject;
                img.src = src;
            });

            const src = await tryLoad(hiRes).catch(() => tryLoad(imgUrl)).catch(() => null);
            if (src) {
                bg.style.backgroundImage = `url('${src}')`;
                bg.style.filter = 'brightness(0.55) saturate(0.75)';
            }
        }

        if (data.extract) {
            const clean = data.extract.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
            desc.textContent = clean.length > 220 ? clean.slice(0, 220).replace(/\s\S+$/, '') + '…' : clean;
        }

        if (data.description && prov) prov.textContent = data.description;

        if (data.content_urls?.desktop?.page) {
            wlink.href = data.content_urls.desktop.page;
            wlink.hidden = false;
            refreshIcons(wlink);
        }

    } catch (e) {
        desc.textContent = `${lokasi} — data Wikipedia tidak tersedia.`;
    }
}

function popularCities() {
    const wants = ['JAKARTA', 'BANDUNG', 'SURABAYA', 'MEDAN', 'MAKASSAR'];
    const found = [];
    for (const w of wants) {
        const hit = allKota.find(k => k.lokasi.toUpperCase().includes(w));
        if (hit && !found.some(f => f.id === hit.id)) found.push(hit);
    }
    for (const k of allKota) {
        if (found.length >= 5) break;
        if (!found.some(f => f.id === k.id)) found.push(k);
    }
    return found.slice(0, 5);
}

function filterKota(q) {
    const norm = q.toLowerCase().replace(/\s+/g, ' ').trim();
    return allKota.filter(k =>
        k.lokasi.toLowerCase().includes(norm)
    ).slice(0, 8);
}

// ── Search: combobox pattern (html + accessibility + forms guides) ──
function bindSearch() {
    const input = document.getElementById('searchInput');
    const form = document.getElementById('searchForm');
    const box = document.getElementById('suggestions');

    const doSearch = debounce(() => {
        const q = input.value.trim();
        if (q.length < 1) { hideSuggestions(); return; }
        if (!allKota.length) return;
        showSuggestions(filterKota(q), q);
    }, 180);

    input.addEventListener('input', () => {
        // Clear stale active descendant on new typing
        input.removeAttribute('aria-activedescendant');
        activeDescendantIdx = -1;
        doSearch();
    });

    // AJAX submit: prevent navigation, show best match (forms guide)
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!allKota.length || !q) return;
        const results = filterKota(q);
        if (results.length === 1) {
            selectCity(results[0]);
        } else if (results.length > 1) {
            showSuggestions(results, q);
            input.focus();
        } else {
            showSuggestions([], q);
        }
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('searchWrap').contains(e.target)) hideSuggestions();
    });

    // IME-safe + combobox keyboard (forms guide: check isComposing)
    input.addEventListener('keydown', function (e) {
        if (e.isComposing) return;
        if (box.hidden) return;
        const items = box.querySelectorAll('.suggestion-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(1, items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(-1, items);
        } else if (e.key === 'Enter') {
            const focused = box.querySelector('.suggestion-item.focused > button');
            if (focused) {
                e.preventDefault();
                focused.click();
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
            input.removeAttribute('aria-activedescendant');
        }
    });

    function moveFocus(delta, items) {
        items.forEach(el => { el.classList.remove('focused'); el.querySelector('button')?.setAttribute('aria-selected', 'false'); });
        activeDescendantIdx = (activeDescendantIdx + delta + items.length) % items.length;
        const el = items[activeDescendantIdx];
        el?.classList.add('focused');
        const btn = el?.querySelector('button');
        btn?.setAttribute('aria-selected', 'true');
        if (el?.id) input.setAttribute('aria-activedescendant', el.id);
        el?.scrollIntoView({ block: 'nearest' });
    }
}

function highlightMatch(text, q) {
    const safe = escapeHtml(text);
    if (!q) return safe;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return safe;
    return escapeHtml(text.slice(0, idx)) +
        `<mark style="background:rgba(200,150,62,0.3);border-radius:3px;padding:0 1px">${escapeHtml(text.slice(idx, idx + q.length))}</mark>` +
        escapeHtml(text.slice(idx + q.length));
}

function showSuggestions(items, q = '') {
    const box = document.getElementById('suggestions');
    const input = document.getElementById('searchInput');
    activeDescendantIdx = -1;
    input.removeAttribute('aria-activedescendant');
    if (!items.length) {
        // No-results dead-end fix (ux-pro-max: Search/No Results): tawarkan kota populer
        const popular = popularCities().slice(0, 5);
        const popularHtml = popular.length
            ? `<li class="suggestion-item" role="presentation" style="padding:8px 18px 0;color:var(--muted);font-size:0.75rem">Coba kota populer:</li>` +
              popular.map(item => `
    <li class="suggestion-item" role="option" id="suggestion-pop-${escapeHtml(item.id)}" aria-selected="false" data-id="${escapeHtml(item.id)}" data-lokasi="${escapeHtml(item.lokasi)}">
      <button type="button" tabindex="-1">${escapeHtml(item.lokasi)}</button>
    </li>`).join('')
            : '';
        box.innerHTML = `<li class="suggestion-item" role="presentation" style="padding:12px 18px;color:var(--muted)">Kota tidak ditemukan</li>${popularHtml}`;
        box.querySelectorAll('.suggestion-item[data-id] button').forEach(btn => {
            btn.addEventListener('click', () => {
                const li = btn.closest('.suggestion-item');
                selectCity({ id: li.dataset.id, lokasi: li.dataset.lokasi });
            });
        });
        box.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        return;
    }
    box.innerHTML = items.map((item, i) => `
    <li class="suggestion-item" role="option" id="suggestion-${i}" aria-selected="false" data-id="${escapeHtml(item.id)}" data-lokasi="${escapeHtml(item.lokasi)}">
      <button type="button" tabindex="-1">${highlightMatch(item.lokasi, q)}</button>
    </li>`).join('');
    box.querySelectorAll('.suggestion-item[data-id]').forEach(el => {
        el.querySelector('button').addEventListener('click', () => selectCity({ id: el.dataset.id, lokasi: el.dataset.lokasi }));
    });
    box.hidden = false;
    input.setAttribute('aria-expanded', 'true');
}

function hideSuggestions() {
    const box = document.getElementById('suggestions');
    const input = document.getElementById('searchInput');
    box.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeDescendantIdx = -1;
    box.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('focused'));
}

function selectCity(item) {
    currentKota = item;
    currentDate = todayStr();
    document.getElementById('searchInput').value = item.lokasi;
    hideSuggestions();
    document.getElementById('searchStatus').textContent = '';

    const topRow = document.getElementById('topRow');
    topRow.hidden = false;
    topRow.style.animation = 'fadeIn 0.3s ease both';
    document.getElementById('locationName').textContent = item.lokasi;
    document.getElementById('locationSub').textContent = `Kode: ${item.id}`;
    loadCityInfo(item.lokasi);

    buildDateStrip();
    loadSchedule();
    document.getElementById('mainContent').focus({ preventScroll: true });
}

// ── Date strip ─────────────────────────────────────────────────────
function buildDateStrip() {
    const strip = document.getElementById('dateStrip');
    strip.hidden = false;
    strip.innerHTML = '';
    const today = new Date();
    const dn = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    [-1, 0, 1, 2, 3].forEach(offset => {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'date-btn' + (ds === currentDate ? ' active' : '');
        if (ds === currentDate) btn.setAttribute('aria-current', 'date');
        btn.textContent = offset === 0 ? 'Hari Ini' : `${dn[d.getDay()]} ${d.getDate()}`;
        btn.addEventListener('click', () => {
            currentDate = ds;
            strip.querySelectorAll('.date-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
            btn.classList.add('active');
            btn.setAttribute('aria-current', 'date');
            loadSchedule();
        });
        strip.appendChild(btn);
    });
}

// ── Load jadwal (spinner ditunda 250ms anti-flash + aria-busy, ux-pro-max) ──
let loadToken = 0;
async function loadSchedule() {
    if (!currentKota) return;
    const content = document.getElementById('mainContent');
    const myToken = ++loadToken;
    content.setAttribute('aria-busy', 'true');
    const spinnerTimer = setTimeout(() => {
        if (myToken !== loadToken) return;
        content.innerHTML = `
            <div class="skel skel-card" style="margin-bottom:10px"></div>
            <div class="skel skel-card" style="margin-bottom:10px"></div>
            <div class="skel skel-card" style="margin-bottom:10px"></div>
            <div class="skel skel-card" style="margin-bottom:10px"></div>
            <div class="loading-wrap"><progress class="loading-spinner" aria-label="Memuat jadwal sholat"></progress></div>`;
    }, 250);
    try {
        const isToday = currentDate === todayStr();
        const path = isToday
            ? `/sholat/jadwal/${currentKota.id}/today?tz=Asia%2FJakarta`
            : `/sholat/jadwal/${currentKota.id}/${currentDate}`;
        const res = await apiFetch(path);
        const data = await res.json();
        if (myToken !== loadToken) return;

        let jadwal = null;
        const raw = data?.data?.jadwal;

        if (raw && typeof raw === 'object') {
            const keys = Object.keys(raw);
            if (keys.length > 0 && typeof raw[keys[0]] === 'object' && 'subuh' in raw[keys[0]]) {
                jadwal = raw[keys[0]];
            } else if ('subuh' in raw) {
                jadwal = raw;
            }
        }

        if (!jadwal) {
            console.error('Struktur API tidak dikenali:', JSON.stringify(data).slice(0, 500));
            clearTimeout(spinnerTimer);
            content.removeAttribute('aria-busy');
            content.innerHTML = `<div class="state-msg" role="alert"><p>Format data tidak dikenali.<br><small style="opacity:.6">Lihat console untuk detail.</small></p></div>`;
            return;
        }

        await yieldToMain();
        if (myToken !== loadToken) return;
        clearTimeout(spinnerTimer);
        content.removeAttribute('aria-busy');
        renderSchedule(jadwal, isToday);
    } catch (e) {
        if (myToken !== loadToken) return;
        clearTimeout(spinnerTimer);
        content.removeAttribute('aria-busy');
        content.innerHTML = '<div class="state-msg" role="alert"><p>Gagal memuat data. Periksa koneksi internet.</p></div>';
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function parseTime(t) {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
}
function getNextPrayer(jadwal) {
    const now = new Date();
    for (const p of PRAYERS) {
        const t = jadwal[p.key];
        if (t && typeof t === 'string' && t.includes(':')) {
            const dt = parseTime(t);
            if (dt > now) return { ...p, time: t, dt };
        }
    }
    const subuhTime = jadwal.subuh || jadwal.imsak || '—';
    return { ...PRAYERS[0], time: subuhTime, dt: null, note: 'besok' };
}
function getActivePrayer(jadwal) {
    const now = new Date();
    let last = null;
    for (const p of PRAYERS) {
        const t = jadwal[p.key];
        if (t && typeof t === 'string' && t.includes(':') && parseTime(t) <= now) last = p.key;
    }
    return last;
}
function formatCountdown(dt) {
    if (!dt) return '';
    const diff = dt - new Date();
    if (diff <= 0) return 'Sekarang';
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    if (h > 0) return `${h}j ${m}m lagi`;
    if (m > 0) return `${m}m ${s}s lagi`;
    return `${s}s lagi`;
}

// ── Render (semantic lists, time elements, polite live regions) ────
function renderSchedule(jadwal, isToday) {
    clearInterval(countdownInterval);
    const content = document.getElementById('mainContent');
    const next = isToday ? getNextPrayer(jadwal) : null;
    const activePrayer = isToday ? getActivePrayer(jadwal) : null;

    const dateObj = new Date(currentDate + 'T00:00:00');
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dateStr = `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    const nextSlot = document.getElementById('nextPrayerSlot');
    if (isToday && next) {
        nextSlot.innerHTML = `<div class="next-prayer-card">
      <p class="next-label">${next.note ? 'Sholat Pertama Besok' : 'Sholat Berikutnya'}</p>
      <h2 class="next-prayer-name">${escapeHtml(next.name)}</h2>
      <p class="next-prayer-time"><time datetime="${escapeHtml(next.time)}">${escapeHtml(next.time)}</time></p>
      <p class="next-countdown">
        <i data-lucide="clock" aria-hidden="true" style="width:13px;height:13px;stroke:rgba(255,255,255,0.9);stroke-width:2.5;flex-shrink:0"></i>
        <span id="cdSpan" aria-live="off">${next.dt ? escapeHtml(formatCountdown(next.dt)) : next.note ? 'Besok' : '—'}</span>
      </p>
    </div>`;
    } else {
        nextSlot.innerHTML = '';
    }

    let html = `<div class="date-header"><h2 class="date-main">${escapeHtml(dateStr)}</h2></div>`;

    html += `<ul class="prayers-grid" role="list" aria-label="Jadwal sholat">`;
    PRAYERS.forEach(p => {
        const t = jadwal[p.key]; if (!t) return;
        const isActive = activePrayer === p.key;
        html += `<li class="prayer-card ${isActive ? 'active-prayer' : ''}"${isActive ? ' aria-current="true"' : ''}>
      <span class="prayer-icon" aria-hidden="true" style="background:${p.bg}">
        <i data-lucide="${p.icon}" style="width:20px;height:20px;stroke:${p.color};stroke-width:1.8"></i>
      </span>
      <span class="prayer-info">
        <span class="prayer-name-en">${p.en}</span>
        <span class="prayer-name">${p.name}</span>
      </span>
      <time class="prayer-time" datetime="${escapeHtml(t)}">${escapeHtml(t)}</time>
      ${isActive ? '<span class="active-pip" aria-hidden="true"></span><span class="visually-hidden">(waktu saat ini)</span>' : ''}
    </li>`;
    });
    html += `</ul>`;

    const extras = [];
    if (jadwal.imsak) extras.push({ label: 'Imsak', val: jadwal.imsak });
    if (jadwal.terbit) extras.push({ label: 'Terbit', val: jadwal.terbit });
    if (jadwal.dhuha) extras.push({ label: 'Dhuha', val: jadwal.dhuha });
    if (extras.length) {
        html += `<div class="divider" aria-hidden="true">
      <div class="divider-line">
        <div class="divider-ornament">❧ <i data-lucide="star" style="width:9px;height:9px;stroke:var(--gold);fill:var(--gold);stroke-width:1.5"></i> ❧</div>
      </div>
      <div class="divider-arabic" lang="ar">رَمَضَان الْمُبَارَك</div>
      <div class="divider-label">Waktu Ramadhan</div>
      <div class="divider-line">
        <div class="divider-ornament">❧ <i data-lucide="moon" style="width:9px;height:9px;stroke:var(--gold);fill:var(--gold);fill-opacity:0.5;stroke-width:1.5"></i> ❧</div>
      </div>
    </div><ul class="prayers-grid" role="list" aria-label="Waktu tambahan">`;
        const extraIcons = { Imsak: 'moon', Terbit: 'sunrise', Dhuha: 'sun-dim' };
        extras.forEach(e => {
            const ic = extraIcons[e.label] || 'moon';
            html += `<li class="prayer-card">
        <span class="prayer-icon" aria-hidden="true" style="background:rgba(200,150,62,0.08)">
          <i data-lucide="${ic}" style="width:20px;height:20px;stroke:var(--gold);stroke-width:1.8"></i>
        </span>
        <span class="prayer-info"><span class="prayer-name-en">Ramadhan</span><span class="prayer-name">${escapeHtml(e.label)}</span></span>
        <time class="prayer-time" datetime="${escapeHtml(e.val)}">${escapeHtml(e.val)}</time>
      </li>`;
        });
        html += `</ul>`;
    }

    content.innerHTML = html;
    refreshIcons();

    if (isToday && next?.dt) {
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
        countdownInterval = setInterval(() => {
            const el = document.getElementById('cdSpan');
            if (el) el.textContent = formatCountdown(next.dt);
            else clearInterval(countdownInterval);
        }, reduceMotion ? 5000 : 1000);
    }
}

// ── Boot (deferred, DOM-ready) ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    refreshIcons();
    bindSearch();
    loadAllKota();
    initMusic();
});

// ── Music with native <dialog> (no SweetAlert dependency) ──────────
function initMusic() {
    const audio = document.getElementById('bgAudio');
    const bar = document.getElementById('musicBar');
    const btn = document.getElementById('musicToggle');
    const wave = document.getElementById('musicWave');
    const dialog = document.getElementById('musicDialog');
    if (!audio || !dialog) return;

    // Show once per session unless user already decided
    let decided = null;
    try { decided = sessionStorage.getItem('jadwalsholat:music'); } catch (e) { /* ignore */ }
    if (!decided && typeof dialog.showModal === 'function') {
        // Delay slightly so LCP isn't blocked
        setTimeout(() => {
            if (!sessionStorage.getItem('jadwalsholat:music')) dialog.showModal();
        }, 800);
    }

    dialog.addEventListener('close', () => {
        try { sessionStorage.setItem('jadwalsholat:music', dialog.returnValue || 'dismiss'); } catch (e) { /* ignore */ }
        if (dialog.returnValue === 'confirm') {
            audio.volume = 0.45;
            audio.play().then(() => {
                bar.hidden = false;
                refreshIcons(btn);
            }).catch(() => { /* autoplay blocked, stay hidden */ });
        }
    });

    btn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    });

    audio.addEventListener('play', () => updateMusicUI(true));
    audio.addEventListener('pause', () => updateMusicUI(false));

    function updateMusicUI(playing) {
        const icon = document.getElementById('musicIcon');
        wave.className = 'music-wave' + (playing ? '' : ' paused');
        btn.setAttribute('aria-pressed', String(playing));
        btn.setAttribute('aria-label', playing ? 'Jeda musik' : 'Putar musik');
        if (icon) {
            icon.setAttribute('data-lucide', playing ? 'pause' : 'play');
            refreshIcons(icon);
        }
    }
}
