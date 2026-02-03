// src/graphics/gui/shared/material_picker/materialThumb.js
// Shared helpers for setting material picker thumbnails.

const _warnedThumbUrls = new Set();

function isDevHost() {
    if (typeof window === 'undefined') return false;
    const host = String(window.location.hostname || '').toLowerCase();
    const protocol = String(window.location.protocol || '').toLowerCase();
    if (protocol === 'file:') return true;
    if (!host) return true;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
    if (host.endsWith('.localhost')) return true;

    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
}

export function setMaterialThumbToTexture(thumb, url, label, {
    imgClassName = 'building-fab-material-thumb-img',
    fallbackTextColor = '#e9f2ff',
    warnTag = ''
} = {}) {
    const el = thumb && typeof thumb === 'object' ? thumb : null;
    if (!el) return;

    el.textContent = '';
    el.replaceChildren();
    el.style.background = 'rgba(0,0,0,0.2)';
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundRepeat = '';
    el.style.backgroundPosition = '';
    el.style.color = '';
    el.classList.remove('has-image');

    const safeUrl = typeof url === 'string' ? url : '';
    const safeLabel = typeof label === 'string' ? label : '';

    if (safeUrl) {
        const img = document.createElement('img');
        img.className = typeof imgClassName === 'string' && imgClassName ? imgClassName : 'building-fab-material-thumb-img';
        img.alt = safeLabel;
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            const failedUrl = img.currentSrc || safeUrl;
            if (warnTag && isDevHost() && failedUrl && !_warnedThumbUrls.has(failedUrl)) {
                _warnedThumbUrls.add(failedUrl);
                console.warn(`[${warnTag}] Thumbnail failed to load: ${failedUrl}`);
            }
            el.classList.remove('has-image');
            el.textContent = safeLabel;
            el.style.color = fallbackTextColor;
        }, { once: true });
        img.src = safeUrl;
        el.classList.add('has-image');
        el.appendChild(img);
        return;
    }

    el.textContent = safeLabel;
    el.style.color = fallbackTextColor;
}

export function setMaterialThumbToColor(thumb, hex, { isDefaultRoof = false } = {}) {
    const el = thumb && typeof thumb === 'object' ? thumb : null;
    if (!el) return;

    el.textContent = '';
    el.replaceChildren();
    el.style.background = 'rgba(0,0,0,0.2)';
    el.style.backgroundImage = '';
    el.style.backgroundSize = '';
    el.style.backgroundRepeat = '';
    el.style.backgroundPosition = '';
    el.style.color = '';
    el.classList.remove('has-image');

    if (isDefaultRoof) {
        el.style.backgroundImage = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.85), rgba(255,255,255,0.85) 6px, rgba(0,0,0,0.12) 6px, rgba(0,0,0,0.12) 12px)';
        el.style.backgroundSize = 'auto';
        return;
    }

    const safe = Number.isFinite(hex) ? hex : 0xffffff;
    el.style.background = `#${safe.toString(16).padStart(6, '0')}`;
}

