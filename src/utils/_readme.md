# src/utils/

## Contents

- `animate.js` - Animation tweening utilities with easing functions
- `screenFade.js` - Full-screen fade-in/fade-out transition effects

## Overview

This folder contains general-purpose utility functions used across the application.

**animate.js** provides a simple tweening system for smooth animations. It includes an `easeInOutCubic` easing function and a `tween()` function that uses `requestAnimationFrame` to interpolate values over a specified duration. The tween function accepts callbacks for per-frame updates and completion, and returns a stop function to cancel the animation early.

**screenFade.js** manages full-screen black overlay transitions for state changes. It creates a singleton fade overlay element and provides `fadeIn()`, `fadeOut()`, and `fadeTo()` functions. The overlay can optionally block user input during transitions. Uses `animate.js` internally for smooth opacity tweening.

## References

- `animate.js` is used by `../states/BusSelectState.js` for bus selection and camera focus animations
- `screenFade.js` is used by `../states/BusSelectState.js` for fade-out before state transition
- `screenFade.js` is used by `../states/GameModeState.js` for fade-in on entry
- Can be used by any module needing smooth value interpolation or screen transitions

