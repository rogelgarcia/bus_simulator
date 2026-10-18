@echo off
rem Headless portal renders (3 angles) without opening Blender's UI.
rem Usage: render_portal.cmd [--eevee] [--samples N] [--size WxH] [--out DIR]
python "%~dp0..\..\common\run.py" bradbury/render/render_portal.py --blend bradbury/parts/bradbury_part_portal.blend -- %*
