# Layout rules (Phase 0)

Every screen, now and in later phases, follows these rules. Phone portrait is the base layout and must not change;
tablets and desktops show **more** of the app, they do not make things **bigger**.

## Sizes

| Size | Width | What changes |
|------|-------|--------------|
| Phone | under 760 px | One column. The base CSS. Never changed by the wide rules. |
| Tablet portrait | 760–899 px | Phone layout, except the Designer, which already uses a side panel. |
| Tablet landscape / small laptop | 900 px and up | Forms flow into two columns; home has a side column; the Designer fills the screen. |
| Properties | 1000 px and up | List and selected property side by side. |
| Desktop | 1440 px and up | Same as above; nothing is stretched. |

Phone landscape gets no special treatment.

## Principles

1. **Never stretch.** A card, field or button keeps its normal width. A wider screen shows more of them side by side,
   centred, instead of widening them. Form tabs are two columns of 440 px.
2. **Tables and the plan may use the width.** The costing sheet and the Designer canvas are the exceptions: they
   are the work area. Controls above a table keep their normal size (`.content.wide` caps them at 720 px).
3. **Phone portrait is a contract.** Changes for wide screens go inside `@media (min-width: …)` blocks. A pixel
   comparison against the previous phone screenshots (`p0-test.mjs`) must stay under 0.2% difference.
4. **No sideways page scroll at any size.**

## How to build a screen

- **A normal form tab:** `h('div', { class: 'content' }, …)`. It flows into columns automatically on wide screens.
  Keep each block (card, field, heading) a direct child of `.content`; blocks never split across a column.
  Put `.complete-footer` last; it spans all columns.
- **A table / spreadsheet:** `h('div', { class: 'content wide' }, …)` with the table in `.calc-wrap`.
  Anything that should span the table (such as a total bar) is excluded in the `.content.wide > :not(…)` rule.
- **A list with a detail view** (the pattern in `propertyList.js`, `propertyPage.js`, `propertySplit.js`):
  build the list and the detail as functions, show them on separate pages on phones, side by side on wide screens.
  Use `history.replaceState` for in-place selection so the list keeps its scroll and search.
- **A work-area screen like the Designer:** a canvas that fills the window with a side panel
  (`planEditor.js`). The page is one flat column on phones and is re-arranged into panel + canvas by JavaScript
  when `matchMedia('(min-width: 760px)')` matches, so the phone DOM never changes.
- **Dialogs** are 440 px on phones and 520 px on wide screens. Do not size them to the window.
- **Hero / header content** is capped at 1180 px and centred.

## Designer panel

On tablet and desktop the Designer panel starts on the **left**. It can be dragged to the other side (handle at its
top), resized by dragging its edge (260–560 px), or hidden. The choice is saved in `localStorage` under
`voids.planPanel` and applies to every plan on that device. Keyboard: Ctrl+Z undo, Delete removes the selected item
or room, Esc cancels placing or deselects.

## Testing a new screen

Check it at phone portrait (390×844), tablet portrait (820×1180), tablet landscape (1180×820), desktop (1440×900)
and 1920×1080: no sideways page scroll, nothing stretched, phone portrait unchanged. `p0-test.mjs` shows how
(sizes, the seed, and the phone pixel comparison).
