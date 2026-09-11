// Final comparisons use their own carousel; archived iterations never enter that sequence.
const data = await fetch('data.json').then(r => r.json());
const viewer = document.querySelector('#viewer');
let activePose = null, slides = [], index = 0;
const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
};
const button = (label, action) => {
    const node = element('button', label);
    node.addEventListener('click', action);
    return node;
};
function settings(card) {
    const m = card.metadata;
    return [m.sunDegrees ? `${m.sunDegrees}° sun` : null,
        m.EV !== undefined ? `${m.EV >= 0 ? '+' : ''}${m.EV.toFixed(3)} EV` : null,
        m.tone, m.grade ? `grade ${m.grade}` : null].filter(Boolean).join(' · ');
}
function finalComparisons(pose) {
    const uncalibrated = pose.cards.findLast(c => c.metadata.comparisonRole === 'uncalibrated_game_55');
    const original = uncalibrated ?? pose.cards.find(c => c.name === '000_baseline');
    const game = pose.cards.findLast(c => c.metadata.mode === 'baked' && c.metadata.sunDegrees === 55 && !c.metadata.acceptance);
    const cycles = pose.cards.find(c => c.metadata.comparisonRole === 'calibrated_cycles_55' || c.name.startsWith('Updated Cycles'));
    return [
        {card:original, name:uncalibrated ? 'Uncalibrated game · 55°' : 'Original game · 35°',
            detail:uncalibrated ? 'Original lighting settings · live lighting' : 'Historical original · baked lighting'},
        {card:game, name:'Calibrated game · 55°', detail:'Final game · matching baked indirect and shadows'},
        {card:cycles, name:'Calibrated Cycles · 55°', detail:'Blender ray-traced reference'}
    ].filter(s => s.card);
}
function show() {
    const slide = slides[index];
    const caption = document.querySelector('#caption');
    caption.replaceChildren(element('span', `${activePose.id} · ${slide.name}`),
        element('small', `${slide.detail} · ${settings(slide.card)}`, 'slide-settings'));
    const image = document.querySelector('#large');
    image.src = slide.card.image; image.alt = `${activePose.id} ${slide.name}`;
    document.querySelector('#thumbs').replaceChildren(...slides.map((slide, i) => {
        const node = button('', () => { index = i; show(); });
        const image = element('img'); image.src = slide.card.preview; image.alt = slide.name;
        node.append(image, element('span', slide.name)); node.title = slide.name;
        node.setAttribute('aria-label', slide.name);
        node.classList.toggle('selected', i === index);
        return node;
    }));
}
function step(delta) { index = (index + delta + slides.length) % slides.length; show(); }
document.querySelector('#previous').onclick = () => step(-1);
document.querySelector('#next').onclick = () => step(1);
document.querySelector('#close').onclick = () => viewer.close();
viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); step(event.key === 'ArrowLeft' ? -1 : 1);
    }
});
function costs(cards) {
    const details = element('details'), table = element('table');
    details.append(element('summary', 'Measured CPU, GPU and memory'));
    const head = element('tr');
    for (const label of ['Version', 'Resolution', 'CPU median / p95', 'GPU median / p95', 'Calls', 'JS heap']) head.append(element('th', label));
    table.append(head);
    const time = stats => stats?.count ? `${stats.median.toFixed(2)} / ${stats.p95.toFixed(2)} ms` : 'Unavailable';
    for (const card of cards) {
        const perf = card.metadata.metrics?.performance;
        if (!perf) continue;
        const row = element('tr'), viewport = card.metadata.viewport;
        for (const value of [card.displayName ?? card.name, viewport ? `${viewport.width} × ${viewport.height}` : 'Unavailable',
            time(perf.frameSubmissionCpuMs), time(perf.gpuMs), String(perf.drawCalls),
            perf.jsHeapBytes ? `${(perf.jsHeapBytes / 1048576).toFixed(0)} MiB` : 'Unavailable']) row.append(element('td', value));
        table.append(row);
    }
    details.append(element('p', '60 warm-up frames, 180 samples. CPU includes frame preparation and submission. GPU uses asynchronous queries. Live and baked lighting have different workloads.'), table);
    return details;
}
function regions(pose, selected) {
    const details = element('details'), choices = element('select'), grid = element('div', null, 'comparison crops');
    details.className = 'region-comparison';
    details.append(element('summary', 'Compare final canopy, shadows, interiors and materials'));
    const names = [...new Set(selected.flatMap(s => Object.keys(s.card.regions)))];
    for (const name of names) { const option = element('option', name.replaceAll('_', ' ')); option.value = name; choices.append(option); }
    choices.setAttribute('aria-label', pose.id + ' comparison region');
    const render = () => grid.replaceChildren(...selected.filter(s => s.card.regions[choices.value]).map(slide => {
        const fig = element('figure', null, 'card'), image = element('img');
        image.src = slide.card.regions[choices.value]; image.alt = `${pose.id} ${choices.value} ${slide.name}`; image.loading = 'lazy';
        fig.append(image, element('figcaption', slide.name)); return fig;
    }));
    choices.addEventListener('change', render); render(); details.append(choices, grid);
    return names.length ? details : null;
}
const intro = document.querySelector('body > header');
const hasSameAngleControl = data.poses.every(p => p.cards.some(c => c.metadata.comparisonRole === 'uncalibrated_game_55'));
intro.replaceChildren(element('h1', hasSameAngleControl ? 'Lighting comparison at 55°' : 'Calibrated lighting comparison'),
    element('p', hasSameAngleControl ? 'The sun is at 55° elevation and 45° azimuth in all three final versions. Cameras and bus positions match.' : 'Historical originals use 35° sunlight; calibrated versions use 55°. Cameras and bus positions match.'),
    element('p', hasSameAngleControl ? 'Uncalibrated uses the original light, sky and exposure settings with live lighting; its old 35° bake cannot apply at 55°. Calibrated game uses the matching 55° bake. Cycles uses the calibrated source and display settings.' : 'Calibrated game and Cycles use the same source and display settings. Earlier versions remain in the archive.'),
    element('p', 'Click any final image to compare only these three versions. Use ← / → or the labeled thumbnails. Earlier iterations are collapsed below each pose.'));
for (const current of data.poses) {
    const section = element('section'), selected = finalComparisons(current), comparison = element('div', null, 'comparison');
    section.append(element('h2', current.id + ' · ' + current.bus));
    selected.forEach((slide, i) => {
        const fig = element('figure', null, 'card'), image = element('img');
        image.src = slide.card.preview; image.alt = current.id + ' ' + slide.name; image.loading = 'lazy';
        const open = button('', () => { activePose = current; slides = selected; index = i; show(); viewer.showModal(); });
        open.setAttribute('aria-label', `Compare ${slide.name}`); open.append(image);
        const caption = element('figcaption', slide.name);
        caption.append(element('div', slide.detail, 'metadata'), element('div', settings(slide.card), 'metadata'));
        fig.append(open, caption); comparison.append(fig);
    });
    section.append(comparison);
    const crops = regions(current, selected); if (crops) section.append(crops);
    section.append(costs(selected.map(s => ({...s.card, displayName:s.name}))));
    const archive = element('details', null, 'history'), grid = element('div', null, 'cards');
    archive.append(element('summary', `Archived iterations and original targets (${current.cards.length} images)`));
    for (const card of current.cards) {
        const fig = element('figure', null, 'card'), image = element('img');
        image.src = card.preview; image.alt = current.id + ' ' + card.name; image.loading = 'lazy';
        const caption = element('figcaption', card.name), meta = card.metadata;
        caption.append(element('div', [meta.mode, settings(card), meta.comparison].filter(Boolean).join(' · '), 'metadata'));
        if (meta.note) caption.append(element('p', meta.note));
        if (meta.acceptance) caption.append(element('p', meta.acceptance));
        fig.append(image, caption); grid.append(fig);
    }
    archive.append(grid); section.append(archive); document.querySelector('#poses').append(section);
}
