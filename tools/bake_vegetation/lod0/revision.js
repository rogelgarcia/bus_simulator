// Show the same specimen/camera in all three representations with separate triangle counts.
const data = window.REVISION_DATA;
const element = id => document.getElementById(id);
const format = value => value.toLocaleString('en-US');
for (const [id, name] of Object.entries(data.names)) element('species').add(new Option(name, id));
for (const [id, name] of Object.entries(data.views)) element('view').add(new Option(name, id));
element('view').value = 'roadside';
function refresh() {
    const species = element('species').value, view = element('view').value;
    const rows = data.models.filter(row => row.id.startsWith(species + '/'));
    const shown = view === 'mature_group' ? rows : rows.slice(0, 1);
    const sum = key => shown.reduce((total, row) => total + row[key], 0);
    const counts = {reference: [sum('referenceWoodTriangles'), sum('referenceFoliageTriangles')], current: [sum('currentWoodTriangles'), sum('currentLeafTriangles')], revised: [sum('woodTriangles'), sum('canopyTriangles')]};
    const comparison = data.comparisons.find(row => row.id === species + '_' + view);
    element('caption').textContent = data.names[species] + ' / ' + data.views[view];
    for (const kind of ['reference', 'current', 'revised']) {
        element('image-' + kind).src = 'comparisons/' + comparison.files[kind];
        element('link-' + kind).href = element('image-' + kind).src;
        element('count-' + kind).textContent = 'Wood ' + format(counts[kind][0]) + ' · Leaves ' + format(counts[kind][1]) + ' triangles' + (view === 'mature_group' ? ' / group total' : '');
    }
    element('download-image').href = 'threeway/' + comparison.id + '.jpg';
    element('download-image').download = comparison.id + '.jpg';
    const metric = data.metrics.find(row => row.view === comparison.id);
    element('quality').textContent = metric?.available ? 'Coverage against sky: current ' + (metric.current.coverageRatio * 100).toFixed(1) + '% → new ' + (metric.coverageRatio * 100).toFixed(1) + '% of reference. Silhouette overlap: ' + (metric.current.silhouetteIoU * 100).toFixed(1) + '% → ' + (metric.silhouetteIoU * 100).toFixed(1) + '%. These diagnostics exclude the ground and shadows.' : 'Compare the canopy outline, leaf spacing and depth in the matched images. Sky-only coverage is unavailable for the low shrub and is not used for closeups.';
    element('models').innerHTML = rows.map(row => {
        const variant = row.id.split('/')[1], base = row.id + '/' + variant + '_lod0';
        return '<tr><td>' + variant.replace('_', ' ') + '</td>' + ['referenceWoodTriangles', 'referenceFoliageTriangles', 'currentWoodTriangles', 'currentLeafTriangles', 'woodTriangles', 'canopyTriangles'].map(key => '<td>' + format(row[key]) + '</td>').join('') + '<td><a href="' + base + '.glb" download>GLB</a> · <a href="' + base + '.blend" download>Blender</a></td></tr>';
    }).join('');
}
const totals = data.totals;
element('totals').innerHTML = '<div><b>' + ((1 - totals.newLeaves / totals.oldLeaves) * 100).toFixed(1) + '%</b><span>fewer leaf triangles across 15 models</span></div><div><b>' + format(totals.oldLeaves) + ' → ' + format(totals.newLeaves) + '</b><span>leaf triangles</span></div><div><b>' + (data.core ? format(totals.oldWood) + ' → ' : '') + format(totals.wood) + '</b><span>wood triangles' + (data.core ? '' : ', unchanged') + '</span></div>';
element('species').onchange = refresh;
element('view').onchange = refresh;
refresh();
