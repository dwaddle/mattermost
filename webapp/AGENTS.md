# AGENTS.md

Guidance for coding agents working inside `webapp/`.

## Coding Standards

Follow `webapp/STYLE_GUIDE.md` for canonical style, accessibility, and testing standards.

## UI components (Compass)

- **Catalog / APIs**: inspect `@mattermost/compass-ui` (package exports / component types) before inventing UI or props.
- **New UI**: prefer `@mattermost/compass-ui` when a published (on npm) component exists. Import via subpaths:
  `import {Button} from '@mattermost/compass-ui/components/button';`
  Do not use the root barrel. Do not recreate Compass primitives.
- **Button**: use Compass UI for text-based button UI. Do not use `@mattermost/shared` `Button` (removed); `buttonClassNames` from `@mattermost/shared/components/button` remains for menu triggers and similar class-only cases. Sizes: `x-small` / `small` / `medium` / `large`. Use `destructive` (boolean) and `appearance="inverted"` for those styles. For link-styled CTAs, use `asChild` with a single `<a>` or router `Link` child instead of nesting a button.
- **Do not mass-migrate** existing UI components to Compass. Only switch when building new UI or when the task is an intentional migration of the code you are already changing.
- **`@mattermost/compass-proto`**: prototyping package not published to npm (shells, call composites, hardcoded menu recipes, proto `WithTooltip`). Not for Mattermost webapp product code — do not add the dependency or import from it unless explicitly adopting that package. Prefer existing webapp / shared / MUI stacks for those surfaces.
- **Exceptions (keep current stacks)**: icons → `@mattermost/compass-icons`; emoji → `Emoji` (`@mattermost/shared`); modals → existing shared / `GenericModal`; menus → existing MUI menus. Do not switch Modal/Menu to compass-ui yet.
- **Icon slots**: when passing icons into compass-ui (`leadingIcon`, `trailingIcon`, `icon`), wrap the compass-icons glyph in Compass `Icon` and omit `size`:
  `import {Icon} from '@mattermost/compass-ui/components/icon';`
- **Tooltips**: use `WithTooltip` from `@mattermost/shared` instead of wiring up Floating UI, compass-proto `WithTooltip`, or other tooltip primitives directly.
  `import {WithTooltip} from '@mattermost/shared/components/tooltip';`
- **Tokens**: Compass foundation CSS variables are global via `@mattermost/compass-ui/styles`. Prefer `var(--…)` over hard-coded radius/spacing/elevation/font/motion values. Theme colors stay on app semantic vars (`--center-channel-*`, etc.). For pills, use `var(--radius-pill)` — webapp `--radius-full` is `50%` and wins over Compass.
- **Standards**: `webapp/STYLE_GUIDE.md`.
- Always import via the full package name (`@mattermost/compass-ui/...`, `@mattermost/shared/...`), never via relative paths into the package (e.g. `platform/shared/` or `node_modules/@mattermost/compass-ui/`).

## Testids (generated Playwright page objects)

Testids are the contract between the webapp and its end-to-end tests: `@mattermost/test-surface` scans them into `channels/test-surface.json` and generates typed page objects for `@mattermost/playwright-lib`. Details: `platform/test-surface/README.md`.

- **Grammar**: `scope.name:key--role`. Words are `lower_snake_case`; the leading words are the scope (where it lives), the last is the name; runtime data only fills the key of the last word (`` `lhs.channel_list.channel:${channel.name}--link` ``); the role suffix is the element's ARIA role (`--button`, `--menuitem`, `--togglebutton`, `--textbox`, `--tab`…) or `--text` for read-only content; no suffix means a container (`channel_settings_modal.configuration`).
- **Plain elements** write the full testid. **Shared components** take a `testId` prop typed `TestId` (`import type {TestId} from '@mattermost/shared/utils/test_id';`) and append their role and parts: `<Button testId='channel_settings_modal.archive.archive_channel'/>` renders `…archive_channel--button`; `<GenericModal testId='channel_settings_modal'>` adds `channel_settings_modal.close--button`.
- **A component used in several places** takes its scope as a prop rather than hard-coding one, so each place gets its own testids (the composer renders `center.post_create.*` and `rhs.post_create.*`).
- **Plugin slots** (wrappers the webapp renders around plugin UI: channel header buttons, header menu items, settings tabs) are keyed by plugin: `` `channel_header.menu.plugin:${pluginTestKey(item.pluginId)}--menuitem` ``. Their templates are a published contract, `PLUGIN_SLOT_TEST_IDS` in `@mattermost/shared/utils/test_id`; the scan fails if the webapp stops rendering a listed slot or renders a plugin-keyed testid that isn't listed. Treat removing one like removing a published API.
- Don't build a whole testid from runtime data, don't let `undefined` reach one, and don't reuse a testid for two elements that can render together.
- After changing testids in a migrated area, run `npm run test-surface && npm run test-surface:generate` in `channels/` and commit the manifest and `e2e-tests/playwright/lib/src/ui/generated` with the change. CI fails while they are stale. `npm run test-surface:watch` keeps them current while you work; `npm run test-surface:install-hooks` adds the pre-commit lint and pre-push check.
- Migrated areas (errors there, warnings elsewhere) are listed in `channels/test-surface.config.json` (`checks.strictPaths`) and in the `testid-grammar` lint block of `channels/eslint.config.mjs`. Keep the two lists in sync when you migrate an area; then update its unit tests, the hand-written Playwright POM and specs in the same change (no aliases).

Reading a scan error: each one names the file and line, the rule, and the fix:

```
✗ channels/src/components/sidebar/sidebar_channel/channel_mention_badge.tsx:25  [grammar]
  "scheduled-post-badge" has the word "scheduled-post-badge", which is not lower_snake_case.
  Words match [a-z][a-z0-9_]*, e.g. "scheduled_post_badge". Suggested: "scheduled.post.badge".
```

The rules (`grammar`, `unscoped`, `undefined`, `role-fit`, `aria`, `duplicates`, `key-origin`, `unresolved`, `plugin-slots`, `collisions`) are described in `platform/test-surface/README.md`.

## Plugin-facing surface on `window.WebappUtils`

**Do not add new top-level `window.*` globals for plugins.** Publish new plugin-facing APIs as sub-namespaces of `window.WebappUtils` instead.

Two existing top-level globals are frozen legacy — do not extend them and do not use them as a model for new work:

- `window.Components` — internal-plugin-only, marked at `webapp/channels/src/plugins/export.ts` as subject to breaking changes outside major releases.
- `window.ProductApi` — a prototype for internal plugins pending module-federation migration, per the comment at the same file.

**Published sub-namespaces**

Each has a contract type in `@mattermost/shared/types/global/` and a build-time drift check in `webapp/channels/src/plugins/published_*.ts`. Third-party plugins pin against these via `min_server_version` — treat every entry like a public API.

- `window.WebappUtils.modals` — contract `PublishedModalUtils`; allowlist in `published_modals.ts`.
- `window.WebappUtils.editor` — contract `PublishedEditorUtils`; allowlist in `published_editor.ts`.
- `window.WebappUtils.components` — contract `PublishedComponents`; allowlist in `published_components.ts`.
- `window.WebappUtils.isolatedFrames` — contract `PublishedIsolatedFrameUtils`; allowlist in `published_isolated_frames.ts`. Backed by the message firewall in `channels/src/utils/isolated_frame_firewall.ts`, which `root.tsx` installs before any other module runs; keep it first.

**Adding an entry**

Follow all four steps in the same PR:

1. Add the type to `platform/shared/src/types/global/<file>.ts`. Do not import from `webapp/channels`; if you need a webapp-internal type, move its type portion to `@mattermost/types` or `platform/shared/src/types/global/` first.
2. Add the implementation to the corresponding `channels/src/plugins/published_<file>.ts` allowlist.
3. Add a unit test to `published_<file>.test.tsx`.
4. Wire it onto `window.WebappUtils.<sub-namespace>` in `channels/src/plugins/export.ts`.

**Contract drift**

Each allowlist file contains a `ContractHonored` type + `AssertPublished*Contract` type alias (and, for forwardRef components, `AssertsTrue<Handle extends PublishedHandle ? true : never>` handle assertions). **Do not remove these `type Assert*` aliases.** They look unused but are the only thing that makes `tsc` fail when a real component's props or handle drift from the published contract.

**Removing or changing an entry**

Mark it `@deprecated` in the shared type for at least two minor releases before deletion, and call it out in the PR description. Do not silently change a field's type or rename an entry — either breaks plugins pinned to an older `min_server_version`.
