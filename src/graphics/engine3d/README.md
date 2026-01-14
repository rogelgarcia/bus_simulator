# Engine 3D (`src/graphics/engine3d/`)

Reusable fabrication/creation code used by multiple content catalogs.

Put here:
- generators/builders/factories/loaders
- shared math/utilities
- runtime systems (e.g. lighting/IBL implementation)

Avoid:
- hardcoded project-specific catalog IDs
- content registries/options that exist primarily for selection/inspection

