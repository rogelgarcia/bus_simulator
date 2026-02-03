# Windows — Builder Tabs and Control Reuse Spec

Status: **Proposed (draft)**  
Scope: **Window builder UI** (tabbed layout + control composition + shared model bindings).  
Non-goals: Window mesh generation, shader implementation, or final visual design polish.

This spec defines a first-pass redesign of the Window Builder UI to improve navigability by splitting a large, hard-to-scan screen into a **tabbed** experience while enforcing:
- **No duplicate state** (single source of truth for all window settings)
- **No duplicate UI** for shared controls (the same controls are reused across tabs)

Related specs:
- Sizes and positioning parameters: `specs/windows/WINDOWS_SIZE_AND_POSITIONING_SPEC.md`
- Materials and finish parameters: `specs/windows/WINDOWS_MATERIALS_AND_FINISH_SPEC.md`
- Feature-specific parameters (shade/glass/interior/wear): `specs/windows/WINDOWS_FEATURE_PARAMETERS_SPEC.md`
- Balcony feature: `specs/windows/WINDOWS_BALCONY_SPEC.md`

---

## 1. Goals

The Window Builder UI MUST:
- Present feature configuration via tabs so users can quickly find a topic.
- Use a **Feature** (master) tab that controls which window features are enabled.
- Keep feature tabs visible but **disabled** until the corresponding feature is enabled.
- Provide global tabs for:
  - **Sizes & Positioning**
  - **Materials/Finish**
- Avoid duplicated controls:
  - If a control exists in a global tab and a feature tab, it MUST be the **same control instance** reused across tabs (not two separate copies).
- Keep all UI and engine settings in sync:
  - Feature tabs and global tabs are different layouts over the same underlying model, so changing a value in one place must immediately reflect everywhere.

---

## 2. Tab Model

### 2.1 Tab list and ordering

Tabs MUST be shown in this order:
1) **Features** (master tab)
2) Feature tabs (shown but disabled until enabled):
   - Frame
   - Muntins
   - Shade
   - Glass
   - Sill
   - Balcony
   - Header/Lintel
   - Trim
   - Wear
   - Interior
3) **Sizes & Positioning** (always available)
4) **Materials/Finish** (always available)

### 2.2 Feature enablement behavior

In the **Features** tab:
- Each feature has an enable toggle.
- Toggling a feature **on**:
  - enables the corresponding feature tab (clickable)
  - enables the feature in the window model (so it affects rendering/mesh)
- Toggling a feature **off**:
  - disables the corresponding feature tab (not clickable)
  - disables the feature in the model (so it no longer affects rendering/mesh)
  - MUST NOT delete the feature’s configuration values (toggling back on restores previous settings)

### 2.3 Disabled tabs

Disabled feature tabs MUST:
- remain visible in the tab bar (so users see what’s available)
- have disabled styling
- ignore pointer/keyboard activation (no tab switch)

---

## 3. Single Source of Truth (No Duplicate State)

All window configuration MUST live in a single model object (or equivalent canonical state) for the active edit context (e.g., selected window/plane, selected style).

Rules:
- All UI controls bind directly to this model via a shared controller/binding layer.
- Tabs are strictly **views** over the same model; no tab-local caches or duplicated state are allowed.

---

## 4. Control Reuse (No Duplicate UI)

### 4.1 “Same controls in different layouts”

Some controls are relevant both globally and within a specific feature tab. Example:
- Frame material can be adjusted in:
  - **Materials/Finish** (grouped under “Frame”)
  - **Frame** tab (flat layout)

This MUST NOT create two separate UI copies. Instead:
- The **Frame Materials controls** are a single reusable control section instance.
- That section can be mounted into different tab containers depending on which tab is active.

### 4.2 Mounting rule (re-parenting)

When switching tabs, reusable control sections MUST be moved (re-parented) into the target container rather than duplicated.

This implies:
- A control section is a DOM subtree (or component instance) that supports being mounted/unmounted without losing bindings.
- Only one copy of each control section exists in the document at a time.

### 4.3 Global vs feature layouts

Global tabs use grouping; feature tabs use a flat layout.

- **Sizes & Positioning** tab:
  - Composes multiple feature-specific size/position control sections into one page.
  - Sections are grouped by feature (Frame, Glass, etc.) using headings/sections.
- **Materials/Finish** tab:
  - Composes multiple feature-specific material/finish control sections into one page.
  - Sections are grouped by feature (Frame, Glass, etc.).
- Feature tabs:
  - Display only the relevant feature’s control sections in a flat layout (no additional outer grouping).

---

## 5. Control Section Types

Each feature MAY define zero or more reusable control sections for:
- Sizes/Positioning (geometry-related controls)
- Materials/Finish (material selection + finish parameters)
- Feature-specific controls (e.g., “Muntins pattern”, “Shade type”, etc.)

The global tabs are compositors over these sections.

---

## 6. Interior / Wear / Materials Notes (First Pass)

This spec defines UI structure only. It does not mandate which exact parameters exist in each tab, but the UI system MUST support:
- An **Interior** feature tab (enablement-controlled)
- A **Wear** feature tab (enablement-controlled)
- A **Materials/Finish** global tab that can host per-feature material controls

---

## 7. Proposal (Implementation Guidance, Non-Normative)

- Implement a `WindowFeatureSectionsRegistry` that can provide:
  - `getSizeSections(featureId)`
  - `getMaterialSections(featureId)`
  - `getFeatureSections(featureId)`
- Each section is created once and exposes:
  - `root` (DOM)
  - `setEnabled(bool)`
  - `dispose()`
- Tabs switch by re-parenting sections into the active tab body.

---

## 8. Quick Verification Checklist

An implementation is considered compliant with this spec if:
- All tabs are visible; feature tabs start disabled until enabled in **Features**.
- Toggling a feature enables/disables its tab without losing configuration values.
- Frame (and any other overlapping controls) appear in both global and feature contexts without duplicating UI:
  - Switching between **Frame** tab and **Materials/Finish** does not create two separate Frame material controls.
- Changing a value in one tab immediately reflects in all tabs because the underlying model is shared.
