# Design System Specification: Les Partenaires DM

## 1. Overview & Creative North Star
### Creative North Star: "The Clinical Curator"
In the world of B2B facility management and professional cleaning, trust isn't built on flair—it's built on precision, hygiene, and absolute clarity. This design system moves away from generic "dashboard" templates to embrace a **Clinical Editorial** aesthetic. It prioritizes breathable negative space, authoritative typography scales, and a layered surface architecture that mimics the pristine quality of a freshly serviced environment. 

By leveraging intentional asymmetry and a "No-Line" philosophy, we create a mobile experience that feels more like a premium architectural journal than a utility app. The design avoids visual clutter to ensure that for a field professional, the data is the hero.

---

## 2. Colors: Tonal Architecture
The palette is rooted in a spectrum of professional blues, using deep saturation for authority and high-transparency tints for interface surfaces.

### Core Tones
*   **Primary (`#00236f` / `primary`):** Our foundation of trust. Used for high-level branding and active navigation states.
*   **Primary Container (`#1a3a8f`):** Used for large hero areas or primary action surfaces to provide depth without the harshness of black.
*   **Secondary (`#006398` / `secondary`):** Reserved for interactive elements and supportive highlights.
*   **Surface (`#f7f9ff`):** Our base "clean" canvas.

### The "No-Line" Rule
To maintain a high-end editorial feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries between content areas must be achieved through background shifts. For example, a `surface-container-low` section should sit directly on a `surface` background to define its edges.

### Signature Textures & Glassmorphism
*   **The Depth Gradient:** Main CTAs or top-level headers should utilize a subtle linear gradient from `primary` to `primary-container` (top-to-bottom) to add "soul" to the interface.
*   **Frosted Glass:** Floating navigation bars or modal headers should use `surface` at 80% opacity with a `20px` backdrop blur. This ensures the UI feels integrated and modern, allowing brand colors to bleed through softly.

---

## 3. Typography: The Editorial Hierarchy
We utilize **Inter** for its neutral, highly legible Swiss character. The system relies on extreme contrast between display sizes and labels to guide the eye.

| Level | Size | Weight | Color Token | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Display-MD** | 2.75rem | 700 | `on_surface` | Used for welcome screens and high-impact data. |
| **Headline-SM** | 1.5rem | 700 | `primary` | Standard page titles. Command presence. |
| **Title-MD** | 1.125rem | 600 | `on_surface` | Section headers within cards. |
| **Body-LG** | 1rem | 400 | `on_surface_variant` | Primary reading text. Increased line-height (1.6). |
| **Label-MD** | 0.75rem | 600 | `on_secondary_container` | **Uppercase Small Caps.** Used for metadata and badges. |

---

## 4. Elevation & Depth: Tonal Layering
Traditional shadows are "noise." This system replaces them with a **Layering Principle** based on Material surface-container tiers.

*   **Tonal Stacking:** Place a `surface-container-lowest` card (Pure White) on a `surface-container-low` background to create a natural lift.
*   **Ambient Shadows:** If a floating element (like a FAB) is required, use an extra-diffused shadow:
    *   *Offset:* 0px 8px | *Blur:* 24px | *Color:* `on_surface` at 6% opacity.
*   **The Ghost Border Fallback:** If accessibility requires a container edge, use the `outline_variant` at **15% opacity**. This creates a "suggestion" of a boundary rather than a hard cage.

---

## 5. Components: Precision Primitives

### Buttons
*   **Primary:** `8px` corner radius. Solid `primary` background. Typography: `Label-MD` (White).
*   **Secondary:** Ghost style. Transparent background with a `Ghost Border` and `primary` text.
*   **Interactive Sizing:** Minimum touch target of 48dp, even if the visual button is smaller.

### Pill Status Badges
Used for service status (e.g., "Cleaned," "Pending"). 
*   **Style:** Pill-shaped (`full` roundedness).
*   **Color:** Use a 12% opacity tint of the status color (`Success`, `Warning`, or `Secondary`) with 100% opaque text in the same hue.

### Cards & Lists
*   **The Rule of Space:** Forbid dividers. Separate list items using `16px` of vertical white space or a subtle shift from `surface` to `surface-container-high` on tap.
*   **Radius:** Cards use `xl` (1.5rem / 24px) for outer containers to feel friendly yet structured.

### Input Fields
*   **Style:** Filled containers using `surface_container_low`. 
*   **Indicator:** A 2px bottom-accent in `primary` appears only on focus. No full-box outlines.

---

## 6. Do's and Don'ts

### Do
*   **DO** use generous white space. If you think there is enough padding, add 8px more.
*   **DO** use the logo's broom icon as a subtle, large-scale watermark in the background of empty states (at 3% opacity).
*   **DO** align text to a strict baseline grid to maintain the editorial feel.

### Don't
*   **DON'T** use 100% black text. Use `on_surface` (`#181c21`) for better readability and a premium feel.
*   **DON'T** use standard Material shadows. They feel "stock." Use tonal shifts instead.
*   **DON'T** crowd the screen. This app is for professionals in high-stress environments; clarity is a functional requirement.
*   **DON'T** use sharp 90-degree corners. Everything should feel "human-centric" through our defined roundedness scale.