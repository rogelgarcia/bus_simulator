// Writes a portable local review page alongside the unmodified Cycles PNGs.
// @ts-check
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

export async function writeGallery(directory, source, manifest, report) {
    const scene = path.relative(directory, path.join(source, manifest.scene)).replaceAll('\\', '/');
    const photographic = manifest.barkAppearance === 'photographic-pbr-v1';
    const surfaceNote = photographic ? '<p>Photographic PBR revision: clean reconstructed wood with scanned relief, plus solid leaves carrying photographed tissue. Some scans are anatomical proxies; see <a href="' + escape(path.relative(directory, path.join(source, 'material-approximations.json')).replaceAll('\\', '/')) + '">species source notes</a>. PBR scans: Poly Haven and ambientCG / Lennart Demes (CC0).</p>' : '';
    const cards = report.renders.map(render => {
        const plot = manifest.plots.find(plot => plot.species === render.species);
        const label = plot?.commonName ?? 'All five species';
        const pose = render.camera.label ?? (render.id.endsWith('_three_mature') ? 'Three mature variants' : render.id.endsWith('_three_quarter') ? 'Three-quarter view' : 'Complete arboretum layout');
        return `<figure><a href="${escape(render.file)}"><img loading="lazy" src="${escape(render.file)}" alt="${escape(label + ' — ' + pose)}"></a><figcaption><strong>${escape(label)}</strong><span>${escape(pose)}</span><small>${escape(plot?.botanicalName ?? '15 mature models · five separate plots')}</small></figcaption></figure>`;
    });
    const document = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mature vegetation · Cycles review</title><style>
*{box-sizing:border-box}body{margin:0;background:#121b19;color:#e7ebe4;font:16px/1.5 system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:44px 28px}header{margin-bottom:32px}h1{font-size:clamp(30px,4vw,52px);font-weight:500;letter-spacing:-.04em;margin:8px 0}p{color:#aabbb0;max-width:850px}.tag{font-size:12px;text-transform:uppercase;letter-spacing:.2em;color:#b8d299}a{color:#cbdfa9}nav{display:flex;gap:24px;flex-wrap:wrap;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;background:#1c2925;border-radius:8px;overflow:hidden}figure:first-child{grid-column:1/-1}img{width:100%;display:block;aspect-ratio:16/9;object-fit:contain}figcaption{padding:18px 22px;display:grid;grid-template-columns:1fr auto;gap:5px}small{color:#9fb1a5;grid-column:1/-1}span{color:#c0cfbf}footer{margin-top:32px;color:#94a69a;font-size:14px}@media(max-width:760px){.grid{grid-template-columns:1fr}figcaption{grid-template-columns:1fr}main{padding:24px 16px}}
</style><main><header><div class="tag">Original vegetation / October 2026</div><h1>The mature tree collection</h1><p>Three mature forms per species, organized into separate outdoor plots. Detailed trunks and fully modeled leaves under a photographed sky and matched sunlight, with the existing Brown Mud ground.</p>${surfaceNote}<nav><a href="${escape(scene)}">Editable packed Blender scene</a><a href="renders.json">Render details</a></nav><p>${report.size.join(' × ')} · Cycles / ${escape(report.devices.join(', '))} · ${report.samples} adaptive samples · AgX / denoised</p></header><div class="grid">${cards.join('\n')}</div><footer>Click any image for full resolution. Soil: Brown Mud by Rob Tuytel, Poly Haven (CC0). Sky: Kloofendal 43d Clear Pure Sky by Greg Zaal, Poly Haven (CC0). Original game assets are unchanged.</footer></main></html>`;
    await writeFile(path.join(directory, 'gallery.html'), document);
}
