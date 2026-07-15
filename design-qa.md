# ONLYOFFICE Project Hub Design QA

- source visual truth path: `docs/assets/onlyoffice-hub-design.png`
- implementation screenshots:
  - `docs/evidence/hub-workspace.png`
  - `docs/evidence/hub-guides.png`
  - `docs/evidence/hub-workspace-mobile.png`
  - `docs/evidence/hub-guides-mobile.png`
- viewports: 1536×1024, 1024×768, 375×812
- state: light theme; empty document library; ready backend; Linux guide and quick-start guide loaded

## Full-view comparison evidence

The source board and the final desktop screenshots were opened together at the
same 1536×1024 viewport. The implementation preserves the selected direction's
white/light-gray/deep-green palette, compact navigation, three-column guide
layout, clear task toolbar, thin borders, restrained radii, and documentation
hierarchy. The implementation intentionally uses the approved product scope
instead of reproducing unsupported sidebar entries such as favorites, recycle
bin, labels, or storage quotas.

The workspace screenshot uses a real empty repository state, whereas the source
board shows populated example rows. The difference is expected and is covered
by the implemented recent-document, list/grid, search, filter, sort, and empty
states. At 1024×768 the command bar changes to a column layout and the guide
outline is removed. At 375×812 both pages have no horizontal overflow.

## Focused comparison evidence

Separate focused crops were not needed because the 1536×1024 screenshots keep
the toolbar, navigation, typography, icons, table borders, outline, and empty
state readable at native scale. The mobile screenshots provide a second focused
view of control stacking and navigation behavior. DOM checks also confirmed:

- the card-view control changes `aria-pressed` to `true` and sets the collection
  view to `grid`;
- filtering the guide navigation by `Windows` leaves only the Windows guide;
- the empty library hides the redundant recent-document section;
- desktop, tablet, and mobile document widths equal their viewport widths.

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: the initial Linux guide title was too large and wrapped into three
  heavy lines. It now uses a 2.4rem maximum with a 1.18 line height, preserving
  hierarchy without crowding the article.
- Spacing and layout rhythm: the empty recent section initially created a large
  blank gap. It is now hidden when there are no documents. Desktop guide columns,
  article padding, tables, dividers, and outline spacing match the source intent.
- Colors and visual tokens: white surfaces, light-gray boundaries, green active
  states, blue Word actions, and green Excel actions are consistent and have
  clear semantic roles. No gradients or decorative CSS art are used.
- Image quality and assets: visible UI icons are original Lucide or Simple Icons
  SVG assets with third-party notices. Word and Excel evidence screenshots are
  real local verification captures and remain sharp at their displayed size.
- Copy and content: labels describe real actions, security boundaries are
  explicit, and the local documentation provides task-based next steps.
- Accessibility and behavior: focus styles, labels, semantic controls, reduced
  motion, keyboard-reachable drop zone, responsive tables, and pressed states are
  present. No horizontal overflow was measured at the required breakpoints.

The small floating scissors button visible at the right edge of Chrome captures
is injected by a browser extension and is not part of the application DOM.

## Patches made since the previous QA pass

1. Hid the recent-document section when the repository is empty.
2. Reduced the long guide H1 scale and adjusted its line height.
3. Limited the mobile document directory to a scrollable 300px region so the
   article begins in the first viewport.
4. Added README status badges, FAQ, roadmap, and an explicit license boundary.
5. Re-ran desktop, tablet, and mobile overflow and interaction checks.

## Follow-up polish

The populated library state could receive a second screenshot after a user adds
documents, but this is a state-coverage enhancement rather than a blocking
fidelity issue; existing automated tests cover list derivation and controls.

final result: passed
