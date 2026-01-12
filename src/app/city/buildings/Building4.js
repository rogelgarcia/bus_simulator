// src/app/city/buildings/Building4.js
export const BUILDING_4_BUILDING_CONFIG = Object.freeze({
    id: "building_4",
    name: "building_4",
    layers: Object.freeze(
        [
            {
                "id": "floor_36",
                "type": "floor",
                "floors": 8,
                "floorHeight": 3.8,
                "planOffset": 0,
                "style": "default",
                "material": {
                    "kind": "color",
                    "id": "blue_tint"
                },
                "belt": {
                    "enabled": true,
                    "height": 1.2,
                    "extrusion": 1.37,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "windows": {
                    "enabled": true,
                    "typeId": "window.style.light_blue",
                    "params": {},
                    "width": 2.2,
                    "height": 3.1,
                    "sillHeight": 0.8,
                    "spacing": 1.8,
                    "spaceColumns": {
                        "enabled": true,
                        "every": 4,
                        "width": 1,
                        "material": {
                            "kind": "color",
                            "id": "offwhite"
                        },
                        "extrude": true,
                        "extrudeDistance": 1
                    }
                }
            },
            {
                "id": "roof_37",
                "type": "roof",
                "ring": {
                    "enabled": false,
                    "innerRadius": 0,
                    "outerRadius": 0.4,
                    "height": 0,
                    "material": {
                        "kind": "color",
                        "id": "offwhite"
                    }
                },
                "roof": {
                    "type": "Asphalt",
                    "material": {
                        "kind": "color",
                        "id": "default"
                    },
                    "color": "default"
                }
            }
        ]
    ),
    floors: 8,
    floorHeight: 3.8,
    style: "default",
    windows: Object.freeze({
        width: 2.2,
        gap: 1.8,
        height: 3.1,
        y: 0.8
    }),
});

export default BUILDING_4_BUILDING_CONFIG;
