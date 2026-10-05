// Bind the exported-geometry diagrams to the selected species.
function refreshWire() {
    const species = document.getElementById('species').value;
    document.getElementById('wire-caption').textContent = window.REVISION_DATA.names[species] + ' / exported triangle edges';
    for (const [kind, suffix] of Object.entries({wire: 'mature_group_wireframe', core: 'roadside_cores', wood: 'trunk_wireframe'})) {
        const file = 'wireframes/' + species + '_' + suffix + '.png';
        document.getElementById(kind + '-image').src = file;
        document.getElementById(kind + '-link').href = file;
    }
}
document.getElementById('species').addEventListener('change', refreshWire);
refreshWire();

const costs = window.REVISION_DATA.resourceCosts;
const mib = value => (value / 1048576).toFixed(1) + ' MiB';
const rows = [
    ['Shared texture memory, full mipmaps', mib(costs.previous.compressedTextureBytesWithMips), mib(costs.revised.compressedTextureBytesWithMips)],
    ['Texture memory without shared loading', mib(costs.previous.independentGlbTextureBytesWithMips), mib(costs.revised.independentGlbTextureBytesWithMips)],
    ['Shared RGBA fallback memory', mib(costs.previous.rgbaTextureBytesWithMips), mib(costs.revised.rgbaTextureBytesWithMips)],
    ['Combined compressed GLB downloads', mib(costs.previous.glbBytes), mib(costs.revised.glbBytes)],
    ['Material draws before batching', costs.previousMaterialDraws, costs.revisedMaterialDraws]
];
document.getElementById('resource-costs').innerHTML = rows.map(row => '<tr>' + row.map(value => '<td>' + value + '</td>').join('') + '</tr>').join('');
