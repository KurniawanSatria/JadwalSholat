const API_BASE = 'https://api.myquran.com/v3';
// CORS proxies — dicoba berurutan sampai berhasil
const PROXIES = [
    url => url,                                                    // direct
    url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function apiFetch(path) {
    for (const proxy of PROXIES) {
        try {
            const res = await fetch(proxy(API_BASE + path), { signal: AbortSignal.timeout(7000) });
            if (res.ok) return res;
        } catch (e) { /* coba proxy berikutnya */ }
    }
    throw new Error('Semua proxy gagal');
}

let currentKota = null;
let currentDate = todayStr();
let countdownInterval = null;
let allKota = [];

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

// ── Load semua kota saat init ──────────────────────────────────────
async function loadAllKota() {
    const status = document.getElementById('searchStatus');
    const input = document.getElementById('searchInput');
    input.placeholder = 'Memuat daftar kota...';
    input.disabled = true;
    try {
        const res = await apiFetch('/sholat/kabkota/semua');
        const data = await res.json();
        allKota = data.data || [];
        input.placeholder = `Cari dari ${allKota.length} kota / kabupaten...`;
        input.disabled = false;
        input.focus();
        status.textContent = `✓ ${allKota.length} kota tersedia`;
        setTimeout(() => status.textContent = '', 3500);
    } catch (e) {
        input.placeholder = 'Gagal memuat kota — coba refresh halaman';
        input.disabled = false;
        status.textContent = '⚠ Gagal terhubung ke API';
    }
}

// ── Wikipedia city info ────────────────────────────────────────────
// Mapping nama kota API → judul artikel Wikipedia Indonesia
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

    // Reset bersih — hanya pakai backgroundImage, JANGAN pakai background shorthand
    bg.removeAttribute('style');
    bg.style.position = 'absolute';
    bg.style.inset = '0';
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.transition = 'filter 0.6s ease';
    bg.style.backgroundImage = 'none';
    bg.style.filter = 'none';
    desc.textContent = '';
    wlink.style.display = 'none';
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

    // Gradient sementara selagi fetch
    const idx = lokasi.charCodeAt(0) % FALLBACK_GRADIENTS.length;
    bg.style.backgroundImage = FALLBACK_GRADIENTS[idx];

    try {
        const url = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();

        // Gambar — coba hi-res dulu, fallback ke thumbnail asli
        const imgUrl = data.thumbnail?.source || data.originalimage?.source;
        if (imgUrl) {
            const hiRes = imgUrl.replace(/\/\d+px-/, '/800px-');
            const tryLoad = (src) => new Promise((resolve, reject) => {
                const img = new Image();
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

        // Deskripsi
        if (data.extract) {
            const clean = data.extract.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
            desc.textContent = clean.length > 220 ? clean.slice(0, 220).replace(/\s\S+$/, '') + '…' : clean;
        }

        // Deskripsi singkat (kota/provinsi)
        if (data.description && prov) prov.textContent = data.description;

        // Link Wikipedia
        if (data.content_urls?.desktop?.page) {
            wlink.href = data.content_urls.desktop.page;
            wlink.style.display = 'inline-flex';
            lucide.createIcons({ nodes: [wlink] });
        }

    } catch (e) {
        desc.textContent = `${lokasi} — data Wikipedia tidak tersedia.`;
    }
}
function filterKota(q) {
    const norm = q.toLowerCase().replace(/\s+/g, ' ').trim();
    return allKota.filter(k =>
        k.lokasi.toLowerCase().includes(norm)
    ).slice(0, 8);
}

// ── Event listeners pencarian ──────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', function () {
    const q = this.value.trim();
    if (q.length < 1) { hideSuggestions(); return; }
    if (!allKota.length) return;
    const results = filterKota(q);
    showSuggestions(results, q);
});

document.getElementById('searchBtn').addEventListener('click', () => {
    const q = document.getElementById('searchInput').value.trim();
    if (!allKota.length || !q) return;
    const results = filterKota(q);
    showSuggestions(results, q);
});

document.addEventListener('click', e => {
    if (!document.getElementById('searchWrap').contains(e.target)) hideSuggestions();
});

// ── Keyboard navigation ───────────────────────────────────────────
document.getElementById('searchInput').addEventListener('keydown', function (e) {
    const box = document.getElementById('suggestions');
    if (box.style.display === 'none') return;
    const items = box.querySelectorAll('.suggestion-item');
    let idx = [...items].findIndex(el => el.classList.contains('focused'));
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        items.forEach(el => el.classList.remove('focused'));
        idx = (idx + 1) % items.length;
        items[idx]?.classList.add('focused');
        items[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        items.forEach(el => el.classList.remove('focused'));
        idx = (idx - 1 + items.length) % items.length;
        items[idx]?.classList.add('focused');
        items[idx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        const focused = box.querySelector('.suggestion-item.focused');
        if (focused) focused.click();
        else if (items.length === 1) items[0].click();
    } else if (e.key === 'Escape') {
        hideSuggestions();
    }
});

function highlightMatch(text, q) {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return text.slice(0, idx) +
        `<mark style="background:rgba(200,150,62,0.3);border-radius:3px;padding:0 1px">${text.slice(idx, idx + q.length)}</mark>` +
        text.slice(idx + q.length);
}

function showSuggestions(items, q = '') {
    const box = document.getElementById('suggestions');
    if (!items.length) {
        box.innerHTML = `<div class="suggestion-item" style="color:var(--muted);cursor:default">Kota tidak ditemukan</div>`;
        box.style.display = 'block';
        return;
    }
    box.innerHTML = items.map(item => `
    <div class="suggestion-item" data-id="${item.id}" data-lokasi="${item.lokasi}">
      <span>${highlightMatch(item.lokasi, q)}</span>
    </div>`).join('');
    box.querySelectorAll('.suggestion-item[data-id]').forEach(el => {
        el.addEventListener('click', () => selectCity({ id: el.dataset.id, lokasi: el.dataset.lokasi }));
    });
    box.style.display = 'block';
}

function hideSuggestions() {
    const box = document.getElementById('suggestions');
    box.style.display = 'none';
    box.querySelectorAll('.suggestion-item').forEach(el => el.classList.remove('focused'));
}

function selectCity(item) {
    currentKota = item;
    currentDate = todayStr();
    document.getElementById('searchInput').value = item.lokasi;
    hideSuggestions();
    document.getElementById('searchStatus').textContent = '';

    const topRow = document.getElementById('topRow');
    topRow.style.display = '';
    topRow.style.animation = 'fadeIn 0.3s ease both';
    document.getElementById('locationName').textContent = item.lokasi;
    document.getElementById('locationSub').textContent = `Kode: ${item.id}`;
    loadCityInfo(item.lokasi);

    buildDateStrip();
    loadSchedule();
}

// ── Date strip ─────────────────────────────────────────────────────
function buildDateStrip() {
    const strip = document.getElementById('dateStrip');
    strip.style.display = 'flex';
    strip.innerHTML = '';
    const today = new Date();
    [-1, 0, 1, 2, 3].forEach(offset => {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const btn = document.createElement('button');
        btn.className = 'date-btn' + (ds === currentDate ? ' active' : '');
        const dn = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
        btn.textContent = offset === 0 ? 'Hari Ini' : `${dn[d.getDay()]} ${d.getDate()}`;
        btn.onclick = () => {
            currentDate = ds;
            document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadSchedule();
        };
        strip.appendChild(btn);
    });
}

// ── Load jadwal ────────────────────────────────────────────────────
async function loadSchedule() {
    if (!currentKota) return;
    const content = document.getElementById('mainContent');
    content.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
    try {
        const isToday = currentDate === todayStr();
        const path = isToday
            ? `/sholat/jadwal/${currentKota.id}/today?tz=Asia%2FJakarta`
            : `/sholat/jadwal/${currentKota.id}/${currentDate}`;
        const res = await apiFetch(path);
        const data = await res.json();

        // Struktur: data.data.jadwal["YYYY-MM-DD"] = { subuh, dzuhur, ... }
        let jadwal = null;
        const raw = data?.data?.jadwal;

        if (raw && typeof raw === 'object') {
            // Cek apakah nested by date key (misal: { "2026-03-08": { subuh:... } })
            const keys = Object.keys(raw);
            if (keys.length > 0 && typeof raw[keys[0]] === 'object' && 'subuh' in raw[keys[0]]) {
                jadwal = raw[keys[0]]; // ambil value dari date key pertama
            } else if ('subuh' in raw) {
                jadwal = raw; // flat langsung
            }
        }

        if (!jadwal) {
            console.error('Struktur API tidak dikenali:', JSON.stringify(data).slice(0, 500));
            content.innerHTML = `<div class="state-msg"><p>Format data tidak dikenali.<br><small style="opacity:.6">Lihat console untuk detail.</small></p></div>`;
            return;
        }

        renderSchedule(jadwal, isToday);
    } catch (e) {
        content.innerHTML = '<div class="state-msg"><p>Gagal memuat data. Periksa koneksi internet.</p></div>';
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
    // Semua waktu sudah lewat → tampilkan Subuh (besok)
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

// ── Render ─────────────────────────────────────────────────────────
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
      <div class="next-label">${next.note ? 'Sholat Pertama Besok' : 'Sholat Berikutnya'}</div>
      <div class="next-prayer-name">${next.name}</div>
      <div class="next-prayer-time">${next.time}</div>
      <div class="next-countdown">
        <i data-lucide="clock" style="width:13px;height:13px;stroke:rgba(255,255,255,0.9);stroke-width:2.5;flex-shrink:0"></i>
        <span id="cdSpan">${next.dt ? formatCountdown(next.dt) : next.note ? 'Besok' : '—'}</span>
      </div>
    </div>`;
    } else {
        nextSlot.innerHTML = '';
    }

    let html = `<div class="date-header"><div class="date-main">${dateStr}</div></div>`;

    html += `<div class="prayers-grid">`;
    PRAYERS.forEach(p => {
        const t = jadwal[p.key]; if (!t) return;
        const isActive = activePrayer === p.key;
        html += `<div class="prayer-card ${isActive ? 'active-prayer' : ''}">
      <div class="prayer-icon" style="background:${p.bg}">
        <i data-lucide="${p.icon}" style="width:20px;height:20px;stroke:${p.color};stroke-width:1.8"></i>
      </div>
      <div class="prayer-info">
        <div class="prayer-name-en">${p.en}</div>
        <div class="prayer-name">${p.name}</div>
      </div>
      <div class="prayer-time">${t}</div>
      ${isActive ? '<div class="active-pip"></div>' : ''}
    </div>`;
    });
    html += `</div>`;

    const extras = [];
    if (jadwal.imsak) extras.push({ label: 'Imsak', val: jadwal.imsak });
    if (jadwal.terbit) extras.push({ label: 'Terbit', val: jadwal.terbit });
    if (jadwal.dhuha) extras.push({ label: 'Dhuha', val: jadwal.dhuha });
    if (extras.length) {
        html += `<div class="divider">
      <div class="divider-line">
        <div class="divider-ornament">❧ <i data-lucide="star" style="width:9px;height:9px;stroke:var(--gold);fill:var(--gold);stroke-width:1.5"></i> ❧</div>
      </div>
      <div class="divider-arabic">رَمَضَان الْمُبَارَك</div>
      <div class="divider-label">Waktu Ramadhan</div>
      <div class="divider-line">
        <div class="divider-ornament">❧ <i data-lucide="moon" style="width:9px;height:9px;stroke:var(--gold);fill:var(--gold);fill-opacity:0.5;stroke-width:1.5"></i> ❧</div>
      </div>
    </div><div class="prayers-grid">`;
        const extraIcons = { Imsak: 'moon', Terbit: 'sunrise', Dhuha: 'sun-dim' };
        extras.forEach(e => {
            const ic = extraIcons[e.label] || 'moon';
            html += `<div class="prayer-card">
        <div class="prayer-icon" style="background:rgba(200,150,62,0.08)">
          <i data-lucide="${ic}" style="width:20px;height:20px;stroke:var(--gold);stroke-width:1.8"></i>
        </div>
        <div class="prayer-info"><div class="prayer-name-en">Ramadhan</div><div class="prayer-name">${e.label}</div></div>
        <div class="prayer-time">${e.val}</div>
      </div>`;
        });
        html += `</div>`;
    }

    content.innerHTML = html;
    lucide.createIcons();

    if (isToday && next?.dt) {
        countdownInterval = setInterval(() => {
            const el = document.getElementById('cdSpan');
            if (el) el.textContent = formatCountdown(next.dt);
            else clearInterval(countdownInterval);
        }, 1000);
    }
}

// ── Boot ───────────────────────────────────────────────────────────
window.onload = () => {
    lucide.createIcons();
    loadAllKota();
    initMusic();
};

// ── Music ──────────────────────────────────────────────────────────
function initMusic() {
    const audio = document.getElementById('bgAudio');
    const bar = document.getElementById('musicBar');
    const btn = document.getElementById('musicToggle');
    const wave = document.getElementById('musicWave');

    Swal.fire({
        title: '<span style="font-family:Amiri,serif;font-size:1.4rem;color:#1a5c5a">🎵 Putar Musik?</span>',
        html: '<p style="font-size:0.88rem;color:#7a7060;margin:0">Ya Leel Ya Leel — Nasheed<br>akan diputar sebagai latar</p>',
        showCancelButton: true,
        confirmButtonText: 'Ya, Putar',
        cancelButtonText: 'Tidak',
        confirmButtonColor: '#1a5c5a',
        cancelButtonColor: '#c8963e',
        background: '#f5f0e8',
        borderRadius: '18px',
        customClass: { popup: 'swal-music-popup' },
        width: '320px',
    }).then(result => {
        if (result.isConfirmed) {
            audio.volume = 0.45;
            audio.play().then(() => {
                bar.style.display = 'flex';
                lucide.createIcons({ nodes: [btn] });
            }).catch(() => { });
        }
    });

    // Toggle play/pause
    btn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            updateMusicUI(true);
        } else {
            audio.pause();
            updateMusicUI(false);
        }
    });

    audio.addEventListener('play', () => updateMusicUI(true));
    audio.addEventListener('pause', () => updateMusicUI(false));

    function updateMusicUI(playing) {
        const icon = document.getElementById('musicIcon');
        wave.className = 'music-wave' + (playing ? '' : ' paused');
        icon.setAttribute('data-lucide', playing ? 'pause' : 'play');
        lucide.createIcons({ nodes: [icon] });
    }
}