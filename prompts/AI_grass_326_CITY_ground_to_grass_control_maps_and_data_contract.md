#Problem

After substrate blending, grass still needs reliable placement and behavior inputs. There is no single, explicit ground-to-grass control contract for density, exclusion, humidity, and blend behavior.

# Request

Define and implement the ground-to-grass control model that drives where and how low-cut grass appears.

Tasks:
- Introduce control maps/fields that represent at least density, exclusion/masking, and humidity for grass-capable areas.
- Define a clear data contract between ground/substrate outputs and grass rendering inputs.
- Ensure control data supports natural boundary behavior (soft transitions rather than hard cuts where appropriate).
- Keep control data deterministic and stable so scene reloads and camera motion do not cause random visual shifts.
- Ensure compatibility with existing city/terrain configuration flows and debugging tools.
- Document expected ranges and semantics for each control channel.

## On completion
- When complete mark the AI document as DONE by adding a marker in the first line
- Rename the file in `prompts/` to:
  - `prompts/AI_DONE_grass_326_CITY_ground_to_grass_control_maps_and_data_contract_DONE.md` on non-main branches
- Do not move to `prompts/archive/` automatically.
- Completion is not enough to move a prompt; move to `prompts/archive/` only when explicitly requested by the user.
- Provide a summary of the changes made in the AI document (very high level, one liner for each change)
