# 🚌 Vibe Bus Simulator (Three.js + Rapier)

A **browser-based**, **100% vibe-coded** city bus simulator built with:
- **Three.js** (rendering)
- **Rapier** (physics)

No backend. No engine. Just JavaScript + vibes.

---

## Run

```
cd /path/to/your/project
python3 -m http.server 8000

```

Open `index.html` in a modern browser.

> If your assets (like `.glb`) don’t load when opened via `file://`, serve the folder as a static site (any simple static server works).

---

## Assets

- `assets/public/` contains shareable assets (tracked in git).
- Everything else under `assets/` is treated as licensed/private and is not shared in the repository.

### Git LFS

Some files under `assets/public/` are stored with Git Large File Storage (LFS).

If you clone the repo without Git LFS installed, you may see small “pointer” text files instead of the real asset contents.

Setup:
- Install Git LFS: https://git-lfs.com/
- Run once (per machine): `git lfs install`
- If you already cloned: `git lfs pull`

---

## Buildings

- Shared building enums/options live in `src/app/buildings/` (styles, roof colors, belt colors, window styles).
- City building designs live in `src/app/city/buildings/` and are referenced by id from `src/app/city/CityMap.js`.
- Building generation code lives in `src/graphics/assets3d/generators/buildings/`.
- Building fabrication UI lives in `src/graphics/gui/building_fabrication/`.
- To add a new city building design: add a config file in `src/app/city/buildings/`, export it from `src/app/city/buildings/index.js`, then reference it via `configId` in `src/app/city/CityMap.js`.
