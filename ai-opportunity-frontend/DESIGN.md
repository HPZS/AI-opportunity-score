# AI Opportunity Frontend Design

This design guide is adapted for the AI Opportunity dashboard and is primarily inspired by the Mintlify style from `VoltAgent/awesome-design-md`.

## Design Direction

- Build a calm, information-dense workspace for reviewing opportunities, not a marketing landing page.
- Favor soft neutrals, sharp content hierarchy, and compact but readable cards.
- The interface should feel like a modern research console: trustworthy, precise, and operational.

## Visual Tone

- Primary mood: clean, warm, analytical.
- Avoid glossy gradients, loud saturation, or oversized hero visuals.
- Use restrained color only to communicate score, state, or call-to-action.

## Color System

- Page background: `#f4f6f1`
- Elevated panel: `#fbfcf8`
- Panel border: `#dbe3d6`
- Strong text: `#162018`
- Secondary text: `#607163`
- Muted text: `#7f8d82`
- Primary accent: `#2f6a46`
- Accent soft: `#e3efe6`
- High score: `#1f7a43`
- Medium score: `#9a6b19`
- Risk / warning: `#a14b31`

## Typography

- Headings: use a modern sans with firm weight and tight tracking.
- Body: prioritize readability for dense operational text.
- Data and URLs: use a monospace companion font.
- Chinese content should remain comfortable at 14px to 16px for body text.

## Layout Principles

- Use a dashboard layout with three layers:
  1. top summary strip
  2. primary work area
  3. detailed evidence sections
- The primary work area should clearly separate:
  - lead list and filters
  - selected lead detail
  - task and execution context
- Prefer sticky headers or sticky side panels where it improves scanning.

## Spacing

- Base spacing unit: `8px`
- Dense card internals: `12px` to `16px`
- Main panels: `20px` to `28px`
- Section gaps: `24px` to `32px`

## Radius And Shadows

- Small radius: `10px`
- Default card radius: `18px`
- Large panel radius: `24px`
- Shadow should be subtle and low contrast, closer to elevation than glow.

## Components

### Cards

- Use soft background contrast rather than dark borders.
- Keep borders thin and slightly tinted green-gray.
- Cards should stack cleanly and support dense content blocks.

### Buttons

- Primary button uses the green accent with white text.
- Secondary button uses a pale background with border.
- Status pills should feel informational, not decorative.

### Inputs

- Use rounded rectangles with soft backgrounds.
- Inputs should not look heavy; borders stay understated until focus.

### Lists

- Lead list items should feel selectable and active.
- Hover state should use a mild lift and border emphasis.
- Selected state should be immediately visible through border, background, and shadow.

### Score Display

- Composite score should be prominent and numeric.
- Sub-scores should use bars or compact stat rows rather than charts unless a chart adds clarity.

## Motion

- Use short transitions: `160ms` to `220ms`.
- Motion is functional: hover lift, panel fade-in, status update feedback.
- Avoid bouncy or playful animation.

## Content Priorities

- Always surface:
  - title
  - organization
  - current stage
  - status
  - composite score
  - latest recommended action
- Deep analysis should read like a structured analyst brief, not raw JSON.

## Anti-Patterns

- Do not mimic consumer SaaS landing pages.
- Do not use pure black text or stark white backgrounds everywhere.
- Do not overload the page with bright chips.
- Do not bury evidence and timeline below decorative content.
