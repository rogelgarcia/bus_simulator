// Bounded colored porch glazing alongside the unchanged BF2 showcase building.
import { bindThinGlassTransport } from '/src/graphics/illumination/receiver_lightmaps/ThinGlassTransportBinding.js';
import { createWindowMeshMaterials } from '/src/graphics/engine3d/buildings/window_mesh/WindowMeshMaterials.js';

export async function createThinGlassShowcaseFixture({ engine, THREE, url }) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Glass transport load failed: ${response.status}`);
    const bake = await response.json(), profile = bake.profile;
    const group = new THREE.Group();
    group.name = 'ai549_transmitted_sunlight';
    group.position.set(0, 0.25, 32);
    const b = profile.receiver.bounds;
    const receiver = new THREE.Mesh(new THREE.PlaneGeometry(b[2] - b[0], b[3] - b[1]), new THREE.MeshStandardMaterial({ color: 0xcbbca2, roughness: 0.82 }));
    receiver.rotation.x = -Math.PI / 2;
    receiver.position.set((b[0] + b[2]) / 2, profile.receiver.y, (b[1] + b[3]) / 2);
    receiver.receiveShadow = true;
    group.add(receiver);
    const panes = [], resources = [];
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x242b30, roughness: 0.4, metalness: 0.5 });
    for (const pane of profile.panes) {
        const [x0, y0, x1, y1] = pane.bounds;
        const tint = new THREE.Color().setRGB(...pane.transmittance);
        const materials = createWindowMeshMaterials({ glass: { tintHex: tint.getHex(), reflection: { coatingReflectance: pane.f0, roughness: 0.025, envMapIntensity: 1 } } });
        resources.push(...Object.values(materials));
        materials.glassMat.color.setRGB(...pane.transmittance);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), materials.glassMat);
        mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, pane.z);
        mesh.castShadow = true;
        group.add(mesh); panes.push(mesh);
        for (const [x, y, w, h] of [[x0, (y0 + y1) / 2, .045, y1 - y0], [x1, (y0 + y1) / 2, .045, y1 - y0], [(x0 + x1) / 2, y0, x1 - x0, .045], [(x0 + x1) / 2, y1, x1 - x0, .045]]) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, .07), frameMat);
            frame.position.set(x, y, pane.z); frame.castShadow = true; group.add(frame);
        }
    }
    engine.scene.add(group);
    const binding = bindThinGlassTransport({ bake, profile, receiver, panes, scene: engine.scene, offset: [group.position.x, group.position.z] });
    let enabled = true;
    const current = () => ({ ...profile, sunDirection: engine.context.city.sun.position.clone().sub(engine.context.city.sun.target.position).normalize().toArray(),
        receiver: { ...profile.receiver, y: receiver.position.y,
            bounds: [receiver.position.x - receiver.geometry.parameters.width / 2, receiver.position.z - receiver.geometry.parameters.height / 2,
                receiver.position.x + receiver.geometry.parameters.width / 2, receiver.position.z + receiver.geometry.parameters.height / 2] },
        panes: panes.map((pane, i) => ({ ...profile.panes[i], z: pane.position.z,
            bounds: [pane.position.x - pane.geometry.parameters.width * pane.scale.x / 2, pane.position.y - pane.geometry.parameters.height * pane.scale.y / 2,
                pane.position.x + pane.geometry.parameters.width * pane.scale.x / 2, pane.position.y + pane.geometry.parameters.height * pane.scale.y / 2],
            transmittance: pane.material.color.toArray(), f0: pane.material.userData.architecturalGlass.coatingReflectance })) });
    return { group, receiver, panes, profile, binding,
        update() {
            const moved = group.position.x !== 0 || group.position.y !== .25 || group.position.z !== 32
                || group.rotation.x !== 0 || group.rotation.y !== 0 || group.rotation.z !== 0
                || group.scale.toArray().some(v => v !== 1) || receiver.rotation.x !== -Math.PI / 2
                || receiver.rotation.y !== 0 || receiver.rotation.z !== 0 || receiver.scale.toArray().some(v => v !== 1)
                || panes.some(p => p.rotation.toArray().slice(0, 3).some(v => v !== 0));
            binding.update(moved ? { ...profile, model: 'changed-transform' } : current(), enabled);
        },
        setEnabled(value) { enabled = value; this.update(); },
        dispose() { binding.dispose(); group.removeFromParent(); group.traverse(o => o.geometry?.dispose()); for (const m of resources) m.dispose(); frameMat.dispose(); receiver.material.dispose(); }
    };
}
