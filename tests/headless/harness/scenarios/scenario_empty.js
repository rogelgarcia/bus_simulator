// Empty deterministic scene scenario.
export const scenarioEmpty = {
    id: 'empty',
    async create({ engine, THREE }) {
        engine.clearScene();

        const sun = new THREE.DirectionalLight(0xffffff, 1.0);
        sun.position.set(30, 60, 40);
        engine.scene.add(sun);
        engine.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

        engine.camera.position.set(0, 10, 18);
        engine.camera.lookAt(0, 0, 0);
        return {
            update() {},
            getMetrics() { return { sceneChildren: engine.scene.children.length }; },
            dispose() { engine.clearScene(); }
        };
    }
};
