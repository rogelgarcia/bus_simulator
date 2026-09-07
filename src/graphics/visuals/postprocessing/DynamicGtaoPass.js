// Uses the installed Three GTAO implementation on an alpha-aware, bounded scene depth buffer.
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export class DynamicGtaoPass {
    constructor(scene, camera, depthTexture, denoiseNoise = null) {
        this.pass = new GTAOPass(scene, camera, 1, 1);
        this.pass.setGBuffer(depthTexture);
        this.pass.output = GTAOPass.OUTPUT.Off;
        if (denoiseNoise) {
            this.pass.pdNoiseTexture.dispose();
            this.pass.pdNoiseTexture = denoiseNoise.clone();
            this.pass.pdNoiseTexture.needsUpdate = true;
            this.pass.pdMaterial.uniforms.tNoise.value = this.pass.pdNoiseTexture;
        }
        this.pass.updateGtaoMaterial({ distanceExponent: 1, distanceFallOff: 1, scale: 1, screenSpaceRadius: false });
        this.pass.updatePdMaterial({ radius: 2, samples: 8, rings: 2, radiusExponent: 1 });
        this.pass.gtaoRenderTarget.depthBuffer = false;
        this.pass.pdRenderTarget.depthBuffer = false;
    }

    render(renderer, camera, target, settings, reach) {
        const pass = this.pass;
        pass.camera = camera;
        if (pass.width !== target.width || pass.height !== target.height) pass.setSize(target.width, target.height);
        const samples = { low: 8, medium: 16, high: 32 }[settings.quality];
        pass.updateGtaoMaterial({ radius: settings.radius, samples, thickness: settings.radius });
        pass.setSceneClipBox(reach);
        pass.render(renderer, null, null);
        return pass.gtaoMap;
    }

    dispose() { this.pass.gtaoMaterial.dispose(); this.pass.blendMaterial.dispose(); this.pass.dispose(); }
}
