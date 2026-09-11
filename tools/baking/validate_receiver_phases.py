"""Exercises actual Cycles pass entry points against a tiny injected resolved-scene fixture."""
import json
import sys
from contextlib import contextmanager
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/receiver_lightmaps'))
sys.path.insert(0, str(ROOT / 'tools/receiver_lightmaps/blender'))
from ReceiverTestFixture import source_fixture
import bake
import bake_surface
import consolidate_passes
from pass_files import verify_pass, file_identity

destination = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
destination.mkdir(parents=True, exist_ok=True)
archive = json.loads((ROOT / 'tools/illumination_bake_compiler/toolchain.v1.json').read_text())['archive']['officialSha256']


@contextmanager
def fixture_package(*_args):
    package = source_fixture()
    package.manifest['lightingProfiles'] = [
        {'id': 'sun.default', 'intensity': 3, 'colorLinearSrgb': [1, 1, 1], 'angularDiameterDegrees': .53,
         'directionThree': [.5792279653, .5735764364, .5792279653]},
        {'id': 'hemisphere.current', 'intensity': 1, 'groundColorLinearSrgb': [.15, .15, .15], 'skyColorLinearSrgb': [1, 1, 1]},
        {'id': 'environment.default', 'enabled': False, 'intensity': 0}]
    yield package


report = []
for module, enhanced in [(bake_surface, True), (bake, False)]:
    stage = destination / ('enhanced' if enhanced else 'preview')
    stage.mkdir(exist_ok=True)
    profile = {'pageSize': 64, 'padding': 4, 'texelSizeMeters': 2/55, 'threads': 2, 'samples': 64,
               'diffuseBounces': 4, 'mipLevels': 2, 'device': 'CPU', 'transportPolicy': 'declared-alpha-coverage-uv-v2',
               'directRepresentation': 'hybrid-sun-visibility-v1'}
    if enhanced:
        profile['irradianceRepresentation'] = 'surface-diffuse-v1'
    chart = {'id': 'floor', 'instanceId': 'floor', 'page': 0, 'x': 0, 'y': 0, 'min': [-1, -1],
             'texelsPerMeter': [27.5, 27.5], 'right': [1, 0, 0], 'up': [0, 0, -1], 'normal': [0, 1, 0],
             'triangles': [{'offset': 0, 'uv': [[-1, -1], [1, -1], [1, 1]]},
                           {'offset': 3, 'uv': [[-1, -1], [1, 1], [-1, 1]]}]}
    atlas = {'profile': profile, 'pageCount': 1, 'chartFile': 'charts.ndjson'} if enhanced else {'profile': profile, 'pageCount': 1, 'charts': [chart]}
    (stage / 'atlas.json').write_text(json.dumps(atlas))
    (stage / 'charts.ndjson').write_text(json.dumps(chart) + '\n')
    (stage / 'job.json').write_text(json.dumps({'archiveSha256': archive, 'packageSha256': 'fixture-loader'}))
    # Package semantic/authentication boundaries are exercised separately by the
    # BSIB regression suite. Here only the scene loader is injected; Cycles,
    # material reconstruction, pass selection, file authentication and assembly run normally.
    module.open_verified_package = fixture_package
    module.validate_resolved_city_contract = lambda *_args: None
    names = ['bounce', 'sky'] if enhanced else ['direct_receiver', 'bounce', 'sky']
    for name in names:
        sys.argv = ['fixture', '--', str(stage), '--pass', name]
        module.main()
        receipt = verify_pass(stage, name, file_identity(stage / 'job.json')['sha256'], 1)
        assert receipt['seconds'] > 0
        assert not (stage / 'receipt.json').exists(), 'Leaf silently consolidated sibling passes'
        values = np.load(stage / f'{name}.0.npy')
        assert np.isfinite(values).all() and values[:, :, 3].max() > .5
    sys.argv = ['fixture', '--', str(stage)]
    consolidate_passes.main()
    receipt = json.loads((stage / 'receipt.json').read_text())
    expected = np.load(stage / 'bounce.0.npy') + np.load(stage / 'sky.0.npy')
    expected[:, :, :3] *= np.pi
    expected[:, :, 3] = 1
    actual = np.fromfile(stage / 'indirect_irradiance.0.mip0.f32', dtype='<f4').reshape(64, 64, 4)
    np.testing.assert_array_equal(actual, expected)
    if enhanced:
        assert (stage / 'direct_receiver.0.mip0.f32').stat().st_size == 16
    corrupted = stage / 'sky.0.npy'
    saved = corrupted.read_bytes()
    corrupted.write_bytes(saved[:-1] + bytes([saved[-1] ^ 1]))
    try:
        consolidate_passes.main()
        raise AssertionError('Corrupted pass accepted')
    except ValueError:
        pass
    corrupted.write_bytes(saved)
    atlas_file = stage / 'atlas.json'
    original_atlas = atlas_file.read_bytes()
    altered = json.loads(original_atlas)
    altered['profile']['samples'] += 1
    atlas_file.write_text(json.dumps(altered))
    try:
        consolidate_passes.main()
        raise AssertionError('Passes from different sample settings accepted')
    except ValueError:
        pass
    atlas_file.write_bytes(original_atlas)
    sky_receipt = stage / 'sky.receipt.json'
    sky_receipt.rename(stage / 'sky.receipt.saved')
    try:
        consolidate_passes.main()
        raise AssertionError('Missing sibling pass accepted')
    except FileNotFoundError:
        pass
    (stage / 'sky.receipt.saved').rename(sky_receipt)
    report.append({'variant': stage.name, 'passes': names, 'seconds': receipt['seconds'],
                   'exactAssembly': True, 'corruptionRejected': True, 'changedSettingsRejected': True,
                   'missingPassRejected': True, 'loader': 'injected two-object fixture'})
(destination / 'verification.json').write_text(json.dumps(report, indent=2))
print('BAKE_FRAMEWORK_PHASES_PASS ' + json.dumps(report), flush=True)
