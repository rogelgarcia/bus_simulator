# Problem [DONE]

All buses feel underpowered and we want a consistent power bump across the
entire bus catalog.

# Request

Increase the engine power of each bus by 30% while keeping behavior consistent
and avoiding unintended changes to braking/steering stability.

Tasks:
- Identify which tuning fields control propulsion/engine output for each bus
  (e.g., engine torque and/or engine force parameters used by physics).
- Increase the effective engine output for every bus in the catalog by 30%
  (apply consistently across variants).
- Ensure the change affects gameplay driving (not just UI/demo simulations).
- Keep braking forces and steering limits unchanged unless strictly necessary
  to preserve controllability.
- Add/update browser-run tests validating that each bus spec's engine output
  value(s) are scaled by 1.3 compared to the previous baseline.

Constraints:
- Update the shared bus catalog in `src/app/vehicle/buses/BusCatalog.js`.
- Follow the comment policy in `PROJECT_RULES.md`.
- Keep changes minimal and focused on power scaling.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first
  line.
- Also rename the AI file to AI_#_title_DONE
- Provide a summary of the changes made in the AI document (very high level,
  one liner)

Summary: Scaled all bus `engineForce` caps and `engine.maxTorque` values by 1.3 in the shared bus catalog and added browser tests to assert the 30% power bump for every bus variant.
