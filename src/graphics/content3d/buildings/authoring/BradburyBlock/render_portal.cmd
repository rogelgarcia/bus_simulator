@echo off
rem Headless portal renders (3 angles) without opening Blender's UI.
rem Usage: render_portal.cmd [--eevee] [--samples N] [--size WxH] [--out DIR]
set "BLENDER=C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
if not exist "%BLENDER%" (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do set "BLENDER=%%~D\blender.exe"
)
"%BLENDER%" -b "%~dp0..\..\..\..\..\..\tests\artifacts\blender\bradbury\portal_project\bradbury_portal.blend" -P "%~dp0render_portal.py" -- %*
