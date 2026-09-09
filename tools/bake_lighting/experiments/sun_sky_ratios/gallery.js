// Pose-first comparisons keep selections bound to immutable saved images, including exposure.
const data = JSON.parse(document.getElementById('data').textContent);
const pose = document.getElementById('pose');
const mode = document.getElementById('mode');
const gallery = document.getElementById('gallery');
const dialog = document.getElementById('lightbox');
const layout = document.getElementById('layout');
const selected = new Set();
const references = data.references ?? [];
const items = new Map([...data.baselines, ...references, ...data.records].map(item => [item.file, item]));
let carousel = [], current = 0, selectionView = false;

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
const evText = value => `${value > 0 ? '+' : ''}${value.toFixed(2)} EV`;
const toneLabel = item => item.kind === 'reference' ? 'Visual target' : data.tones.find(tone => tone.id === item.tone).label;
const lightLabel = item => item.kind === 'reference' ? item.label : item.light ? data.variants.find(variant => variant.id === item.light).label : 'Game reference';
const exposureLabel = item => item.kind === 'reference' ? 'User supplied · uncalibrated' : item.exposureEV === undefined ? `Exposure ${item.exposure} · grading off` : `${item.mode === 'matched' ? 'Matched' : 'Fixed'} · ${evText(item.exposureEV)}${item.mode === 'matched' ? ` · adjustment ${evText(item.offset)}` : ''}`;
const caption = item => `${item.pose} · ${lightLabel(item)} · ${toneLabel(item)} · ${exposureLabel(item)}`;
const baseline = (id, tone) => data.baselines.find(item => item.pose === id && item.tone === tone);

function record(id, light, tone) {
    const offset = mode.value === 'fixed' ? 0 : Number(document.getElementById(tone + '-ev').value);
    return data.records.find(item => item.pose === id && item.light === light && item.tone === tone && item.mode === mode.value && item.offset === offset);
}

function tile(item, title) {
    return `<figure class="tile"><button class="open-image" data-file="${escapeHtml(item.file)}" aria-label="Open ${escapeHtml(caption(item))}"><img src="${escapeHtml(item.file)}" alt="${escapeHtml(title)}" loading="lazy" data-pose="${item.pose}" data-light="${item.light ?? 'game'}" data-tone="${item.tone}"></button><figcaption><span>${escapeHtml(title)}</span><span>${escapeHtml(exposureLabel(item))}</span></figcaption><label class="select-image"><input type="checkbox" data-select="${escapeHtml(item.file)}" ${selected.has(item.file) ? 'checked' : ''}> Select for comparison</label></figure>`;
}

function updateSelection() {
    document.getElementById('selection-count').textContent = `${selected.size} selected`;
    for (const id of ['compare-grid', 'compare-single', 'clear-selection']) document.getElementById(id).disabled = !selected.size;
    for (const checkbox of gallery.querySelectorAll('[data-select]')) checkbox.checked = selected.has(checkbox.dataset.select);
}

function update() {
    for (const tone of data.tones) {
        const slider = document.getElementById(tone.id + '-ev');
        slider.disabled = mode.value === 'fixed';
        document.getElementById(tone.id + '-value').textContent = evText(mode.value === 'fixed' ? 0 : Number(slider.value));
    }
    gallery.innerHTML = data.poses.filter(id => pose.value === 'all' || pose.value === id).map(id => `<section class="pose"><h2>${id}</h2><p><a href="${id}_comparison.png">Full comparison sheet</a></p><h3>Native game reference · existing baked lighting · grading off</h3><div class="grid">${data.tones.map(tone => tile(baseline(id, tone.id), 'Game · ' + tone.label)).join('')}</div>${data.variants.map(variant => `<h3>${variant.label} <span class="hint">· Sun ${variant.sunEnergy} · environment ${variant.environmentMultiplier * variant.radianceScale}× · ${variant.id}</span></h3><div class="grid">${data.tones.map(tone => tile(record(id, variant.id, tone.id), tone.label + ' · ' + variant.label)).join('')}</div>`).join('')}</section>`).join('');
    for (const section of gallery.querySelectorAll('.pose')) {
        const id = section.querySelector('h2').textContent;
        const targets = references.filter(item => item.pose === id);
        if (targets.length) section.querySelector('p').insertAdjacentHTML('afterend', `<h3>Visual target · supplied reference, not a calibrated render</h3><div class="grid">${targets.map(item => tile(item, item.label)).join('')}</div>`);
    }
    updateSelection();
}

function show() {
    const item = carousel[current];
    const gridMode = layout.value === 'grid';
    const start = Math.floor(current / 4) * 4;
    const visible = gridMode ? carousel.slice(start, start + 4) : [item];
    const large = document.getElementById('large');
    large.hidden = gridMode;
    large.src = item.file;
    large.alt = caption(item);
    const grid = document.getElementById('comparison-grid');
    grid.hidden = !gridMode;
    grid.dataset.count = visible.length;
    grid.innerHTML = gridMode ? visible.map((entry, index) => `<figure class="comparison-tile ${start + index === current ? 'active' : ''}"><button data-focus="${start + index}" aria-label="Enlarge ${escapeHtml(caption(entry))}"><img src="${escapeHtml(entry.file)}" alt="${escapeHtml(caption(entry))}"></button><figcaption>${escapeHtml(caption(entry))}</figcaption></figure>`).join('') : '';
    document.getElementById('caption').textContent = gridMode ? `Images ${start + 1}–${start + visible.length} of ${carousel.length} · click an image to enlarge` : caption(item);
    document.getElementById('configuration').innerHTML = carousel.map((entry, index) => `<option value="${index}" ${index === current ? 'selected' : ''}>${index + 1}. ${escapeHtml(caption(entry))}</option>`).join('');
    document.getElementById('thumbnails').innerHTML = carousel.map((entry, index) => `<button class="thumbnail" data-index="${index}" aria-label="${escapeHtml(caption(entry))}" aria-current="${index === current ? 'true' : 'false'}"><img src="${escapeHtml(entry.file)}" alt="" loading="lazy"><span>${escapeHtml(entry.pose)} · ${escapeHtml(entry.light ?? 'Game')} · ${escapeHtml(toneLabel(entry))}</span><small>${escapeHtml(exposureLabel(entry))}</small></button>`).join('');
    document.getElementById('viewer-select').textContent = selected.has(item.file) ? 'Remove selection' : 'Select image';
    document.getElementById('viewer-select').setAttribute('aria-pressed', String(selected.has(item.file)));
    document.getElementById('viewer-count').textContent = `${current + 1} / ${carousel.length}${selectionView ? ' selected' : ''}`;
    for (const [id, label] of [['previous', 'Previous'], ['next', 'Next']]) {
        const button = document.getElementById(id);
        button.disabled = carousel.length <= (gridMode ? 4 : 1);
        button.setAttribute('aria-label', `${label} ${gridMode ? 'group' : 'image'}`);
    }
    document.querySelector('.thumbnail[aria-current="true"]').scrollIntoView({block:'nearest', inline:'nearest'});
}

function openComparison(entries, index, view, fromSelection) {
    carousel = entries;
    current = index;
    layout.value = view;
    selectionView = fromSelection;
    dialog.showModal();
    show();
    document.getElementById('close').focus();
}

function openSelected(view) {
    if (selected.size) openComparison([...selected].map(file => items.get(file)), 0, view, true);
}

function move(step) {
    if (layout.value === 'grid') {
        const groups = Math.ceil(carousel.length / 4);
        current = ((Math.floor(current / 4) + step + groups) % groups) * 4;
    } else current = (current + step + carousel.length) % carousel.length;
    show();
}

gallery.addEventListener('click', event => {
    const target = event.target.closest('[data-file]');
    if (!target) return;
    const item = items.get(target.dataset.file);
    const entries = [...data.tones.map(tone => baseline(item.pose, tone.id)), ...references.filter(entry => entry.pose === item.pose), ...data.variants.flatMap(variant => data.tones.map(tone => record(item.pose, variant.id, tone.id)))];
    openComparison(entries, entries.findIndex(entry => entry.file === item.file), 'single', false);
});
gallery.addEventListener('change', event => {
    const file = event.target.dataset.select;
    if (!file) return;
    if (event.target.checked) selected.add(file); else selected.delete(file);
    updateSelection();
});
document.getElementById('compare-grid').onclick = () => openSelected('grid');
document.getElementById('compare-single').onclick = () => openSelected('single');
document.getElementById('clear-selection').onclick = () => {selected.clear(); updateSelection();};
document.getElementById('previous').onclick = () => move(-1);
document.getElementById('next').onclick = () => move(1);
document.getElementById('close').onclick = () => dialog.close();
document.getElementById('configuration').onchange = event => {current = Number(event.target.value); show();};
document.getElementById('thumbnails').onclick = event => {
    const button = event.target.closest('[data-index]');
    if (button) {current = Number(button.dataset.index); show();}
};
document.getElementById('comparison-grid').onclick = event => {
    const button = event.target.closest('[data-focus]');
    if (button) {current = Number(button.dataset.focus); layout.value = 'single'; show();}
};
document.getElementById('viewer-select').onclick = () => {
    const file = carousel[current].file;
    if (selected.has(file)) selected.delete(file); else selected.add(file);
    updateSelection();
    if (selectionView) {
        carousel = [...selected].map(key => items.get(key));
        if (!carousel.length) {dialog.close(); return;}
        current = Math.min(current, carousel.length - 1);
    }
    show();
};
layout.onchange = show;
dialog.addEventListener('keydown', event => {
    if (event.target.matches('select, input, textarea')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1);
    }
});
pose.innerHTML = '<option value="all">All poses</option>' + data.poses.map(id => `<option value="${id}">${id}</option>`).join('');
pose.value = data.poses.includes('pose_02') ? 'pose_02' : data.poses[0];
pose.onchange = update;
mode.onchange = update;
for (const tone of data.tones) document.getElementById(tone.id + '-ev').oninput = update;
update();
