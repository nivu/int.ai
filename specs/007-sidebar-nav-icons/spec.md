# Feature Specification: Sidebar Navigation Icons

**Feature Branch**: `007-sidebar-nav-icons`
**Created**: 2026-10-20
**Status**: Draft
**Input**: The admin left menu (`frontend/app/(admin)/layout.tsx`) shows text labels only. Every menu item should have an icon so the menu is quicker to scan.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Sees an Icon on Every Menu Item (Priority: P1)

An admin, recruiter or hiring manager opens any page under the admin area. Each
item in the left menu shows an icon to the left of its label.

**Acceptance Scenarios**:
1. **Given** a signed-in team member on any admin page, **When** the page loads, **Then** each of the 6 menu items shows its icon from FR-001 to the left of its label.
2. **Given** the current page is a menu item's page or a page under it, **When** the menu renders, **Then** that item's icon and label share the existing active styling, as the label alone does today.
3. **Given** a menu item is clicked, **When** navigation is pending, **Then** the loading spinner from PR #117 still appears on the right of that item and the item does not shift in width or height.
4. **Given** a screen reader, **When** it reads the menu, **Then** each item is announced by its label only; the icon is not announced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each admin menu item MUST show this `lucide-react` icon:

  | Item | Route | Icon |
  |---|---|---|
  | Dashboard | `/dashboard` | `LayoutDashboard` |
  | Jobs | `/jobs` | `Briefcase` |
  | Candidates | `/candidates` | `Users` |
  | Templates | `/templates` | `FileText` |
  | Analytics | `/analytics` | `BarChart3` |
  | Settings | `/settings` | `Settings` |

- **FR-002**: Icons MUST be 16px (`h-4 w-4`), sit left of the label with a small
  gap, and inherit the item's text colour in both light and dark themes.
- **FR-003**: Icons MUST be decorative (`aria-hidden`); each link's accessible
  name stays its text label.
- **FR-004**: The labels, routes, menu order, active-item styling and pending
  spinner MUST stay unchanged.

## Success Criteria *(mandatory)*

- **SC-001**: On https://intai.nunnarilabs.com after deploy, all 6 admin menu items show their FR-001 icon.
- **SC-002**: `pnpm lint`, `tsc --noEmit` and `pnpm build` pass.

## Assumptions

- "Left panel" means the admin sidebar; the candidate portal and client portal have no left menu.
- `lucide-react`, already a dependency, is the icon set.

## Out of Scope

- A collapsible, icon-only sidebar.
- Icons anywhere other than the admin left menu.
