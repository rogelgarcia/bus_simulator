// src/graphics/gui/texture_inspector/TextureInspectorView.js
// Orchestrates UI and 3D rendering for texture inspection.
import { TextureInspectorScene } from './TextureInspectorScene.js';
import { TextureInspectorUI } from './TextureInspectorUI.js';

export class TextureInspectorView {
    constructor(engine) {
        this.engine = engine;
        this.scene = new TextureInspectorScene(engine);
        this.ui = new TextureInspectorUI();
    }

    enter() {
        this.scene.enter();
        this.ui.mount();

        const collectionOptions = this.scene.getCollectionOptions();
        this.ui.setCollectionOptions(collectionOptions);
        this.ui.setSelectedCollection(this.scene.getSelectedCollectionMeta() ?? {});

        const options = this.scene.getTextureOptions();
        this.ui.setTextureOptions(options);
        this.ui.setSelectedTexture(this.scene.getSelectedTextureMeta() ?? {});
        this.ui.setBaseColorId('white');
        this.scene.setBaseColorHex(this.ui.getBaseColorHex());
        this.ui.setPreviewModeId('single');
        this.ui.setGridEnabled(true);
        this.ui.setTileGap(0.0);
        this.ui.setLighting(this.scene.getLighting());
        this.scene.setPreviewModeId(this.ui.getPreviewModeId());
        this.scene.setGridEnabled(this.ui.getGridEnabled());
        this.scene.setTileGap(0.0);

        this.ui.onCollectionIdChange = (id) => {
            this.scene.setSelectedCollectionId(id);
            this.ui.setSelectedCollection(this.scene.getSelectedCollectionMeta() ?? {});
            this.ui.setTextureOptions(this.scene.getTextureOptions());
            this.ui.setSelectedTexture(this.scene.getSelectedTextureMeta() ?? {});
        };

        this.ui.onTextureIdChange = (id) => {
            const prevCollectionId = this.scene.getSelectedCollectionMeta()?.id ?? null;
            this.scene.setSelectedTextureId(id);
            const nextCollection = this.scene.getSelectedCollectionMeta();
            if (nextCollection?.id && nextCollection.id !== prevCollectionId) {
                this.ui.setSelectedCollection(nextCollection ?? {});
                this.ui.setTextureOptions(this.scene.getTextureOptions());
            }
            this.ui.setSelectedTexture(this.scene.getSelectedTextureMeta() ?? {});
        };

        this.ui.onTexturePrev = () => {
            this.scene.setSelectedTextureIndex(this.scene.getSelectedTextureIndex() - 1);
            this.ui.setSelectedTexture(this.scene.getSelectedTextureMeta() ?? {});
        };

        this.ui.onTextureNext = () => {
            this.scene.setSelectedTextureIndex(this.scene.getSelectedTextureIndex() + 1);
            this.ui.setSelectedTexture(this.scene.getSelectedTextureMeta() ?? {});
        };

        this.ui.onBaseColorChange = (baseId) => {
            this.ui.setBaseColorId(baseId);
            this.scene.setBaseColorHex(this.ui.getBaseColorHex());
        };

        this.ui.onPreviewModeChange = (modeId) => {
            this.scene.setPreviewModeId(modeId);
        };

        this.ui.onGridEnabledChange = (enabled) => {
            this.scene.setGridEnabled(enabled);
        };

        this.ui.onTileGapChange = (gap) => {
            this.scene.setTileGap(gap);
        };

        this.ui.onLightingChange = (params) => {
            this.scene.setLighting(params);
        };
    }

    exit() {
        this.ui.onTextureIdChange = null;
        this.ui.onCollectionIdChange = null;
        this.ui.onTexturePrev = null;
        this.ui.onTextureNext = null;
        this.ui.onBaseColorChange = null;
        this.ui.onPreviewModeChange = null;
        this.ui.onGridEnabledChange = null;
        this.ui.onTileGapChange = null;
        this.ui.onLightingChange = null;

        this.ui.unmount();
        this.scene.dispose();
    }

    update() {
        this.scene.update();
    }
}
