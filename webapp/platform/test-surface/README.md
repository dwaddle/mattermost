# @mattermost/test-surface

Reads the webapp's TypeScript program (not a browser, not webpack) and writes every `data-testid` it can render, with its ARIA role, what it opens, which API operation it can fire and when it renders, into one manifest: `webapp/channels/test-surface.json`. The generator turns that manifest into typed Playwright page objects in `@mattermost/playwright-lib`.

It is the OpenAPI → generated-client pattern applied to UI: the components are the spec, the manifest is the OpenAPI document, the page objects are the generated client.

## Commands

Each is `test-surface <command>` (the package's bin) run from `webapp/channels`; elsewhere pass `--config` or run from the config's directory:

```sh
npm run test-surface                # scan + checks, writes test-surface.json
npm run test-surface:generate       # writes e2e-tests/playwright/lib/src/ui/generated from the manifest
npm run test-surface:check          # scan + checks; exit 1 on errors or a stale manifest (CI)
npm run test-surface:report         # also writes reports/ (unknown effects, spec gaps, diagnostics by rule, unrendered test ids)
npm run test-surface:watch          # keeps a language service warm, rescans and regenerates (~2 s per changed file)
npm run test-surface:install-hooks  # opt-in git hooks: pre-commit lints testids, regenerates and adds the output to the commit; pre-push re-checks
```

Library mode, for a component library (compass-ui runs it as `npm run generate:test-parts`):

```sh
test-surface parts --config packages/compass-ui/test-surface.config.json   # writes test-parts.json
```

CI (`check-test-surface` in `.github/workflows/webapp-ci.yml`) runs the tool's tests, `check`, regenerates, fails if the committed manifest or generated page objects differ, and runs the golden-numbers check.

The tool runs from TypeScript source on Node 24 (native type stripping), so it has no build step. A whole-webapp program needs a bigger heap than Node's default: the bin reruns itself with `--max-old-space-size=8192` unless you set a size.

## The testid grammar

```
testid  := path [ ":" KEY ] [ "--" ROLE ]
path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
WORD    := [a-z][a-z0-9_]*
```

- Every testid has a scope: `center.post_create.send--button`, not `SendMessageButton`.
- Runtime data only fills the key of the last word: `` `lhs.channel_list.channel:${channel.name}--link` ``.
- The role suffix is the element's ARIA role (`--button`, `--switch`, `--tab`, `--menuitem`, `--textbox`…), or `--text` for read-only content. No suffix means a container.

## Reading a scan error

```
✗ channels/src/components/sidebar/sidebar_channel.tsx:52  [role-fit]
  "lhs.channel_list.channel.unread_badge--button" is on a <span> with no ARIA role.
  Render a native button or add role='button' (and its state attributes); for read-only content use --text.
```

Every diagnostic names the file and line, the rule, and the fix. Rules:

| Rule | What it checks |
|---|---|
| `grammar`, `unscoped` | the testid parses; it has a scope; runtime data only in the key |
| `undefined` | `undefined` can't flow into a testid (e.g. a prop some usage doesn't pass) |
| `role-fit` | the suffix matches the element's ARIA role (native, explicit `role=`, or what the component renders) |
| `aria` | an element that handles input has an ARIA role |
| `duplicates` | the same testid twice only in mutually exclusive branches of one component, with the same role |
| `key-origin` | keys come from a fixed set, an entity field (`channel.name`) or a typed value |
| `unresolved` | the testid can be read statically |
| `plugin-slots` | the published plugin slot contract (`pluginSlots` in the config: `PLUGIN_SLOT_TEST_IDS`) and the plugin-keyed testids the webapp renders agree, both ways; always errors |
| `collisions` | (generator) two testids in one scope don't produce the same member name |

Where checks are errors rather than warnings is set in `channels/test-surface.config.json` (`checks.strictScopes`, `checks.strictPaths`): migrated areas are strict, the rest of the webapp reports warnings until it is migrated. After a rename, `reports/unrendered_test_ids.txt` lists testids unit tests query that no template produces (mocks in the same file excluded): an absence check on one can never fail. A reviewed exception goes in `checks.allow` (`{"rule", "template", "reason"}`): that error becomes a warning carrying the reason, and an entry that stops matching is reported so the list doesn't go stale.

## How it works

| Module | Does |
|---|---|
| `program.ts` | Builds the program from `channels/tsconfig.json`, overriding `paths` so `@mattermost/*` packages resolve to their source. Watch mode uses a language service. |
| `program_index.ts` | One pass: component usages (through aliases, HOCs, `React.lazy`), call sites, `dialogType` references (`openModal` descriptors and `<ToggleModalButton dialogType>`), `connect()` wrappers. Incremental in watch mode. |
| `values.ts` | Resolves an expression to the strings it can produce, with provenance (the chain of usages a value flowed through): props paths, defaults, spreads, rest props, `dialogProps`, constants, `useMemo`, helper returns, fixed lists behind `.map`. Runtime data becomes typed gaps (fixed set, entity field, number, string). |
| `roles.ts` | ARIA role of the element a testid lands on, following component props spreads to the DOM element or library component. |
| `conditions.ts` | Render conditions (`&&`, ternary arms, if/else, early returns), explained one level (`useSelector` inlined), classified (prop, permission, config, local state…). |
| `routes.ts` | `Client4` method → verb + path (route helpers evaluated) → OpenAPI operation; response body type from the method's TypeScript return type. |
| `effects.ts` | Handler → call graph → `Client4` operations, opened modals/popovers/menus, navigation. Follows `connect`/`bindActionCreators`, props callbacks per instance, hooks, IIFEs, factories; skips catch blocks and error logging. |
| `scan.ts` | Finds every emission point, follows component-level testids to where they land, groups values into manifest elements. |
| `pages.ts` | The route table: every `<…Route path>` (paths through constants and template literals; `component` or `render`), the component it renders, its params, and the scopes rendered under it. Page names and entity-typed params come from `pageNames` / `pageParams` in the config. `pageReady` names, per page, the elements whose showing means the app is up; the generated `goto` waits for one of them, since the load event comes before a single-page app has rendered. |
| `checks.ts` | The rules above. |
| `watch.ts` | Watch mode: incremental program + index, rescan, regenerate. |

### Component libraries (`parts.ts`)

A library such as compass-ui ships only built code, so the webapp scan can't follow a `testId` into it. Instead the library publishes `test-parts.json`, written by `test-surface parts` from its source: per exported component, the testids its `testId` prop derives (every `testIdPart(testId, '.close--button')` call, including those of children it forwards `testId` to), each part's role, the prop that gates it (`IconButton` `toggled` → `--togglebutton`), the callback props its click calls (`.close--button` → `onClose`), the key type of keyed parts, and the role a passed-through `data-testid` lands on.

The webapp scan reads it for each package in `libraries` (`channels/test-surface.config.json`). At `<Modal testId='channel_settings_modal' onClose={…}>` it emits `channel_settings_modal--dialog`, `channel_settings_modal.close--button` (with `onClose`'s effects) and the rest, so the generated POM covers new compass UI with no per-feature work. A library version without the file falls back to the built-in role table.

### The generator (`src/generate`)

Reads only the manifest (and `en.json` for `Msg`); only elements from migrated areas are generated (`checks.strictPaths`, or `generateScopes`).

| Output | What |
|---|---|
| `<top-level scope>.ts` | One class per testid scope. Element getters return the ARIA driver for the element's role with its metadata (testid, role, branded effects, source); verb methods per role; actions that open a generated scope return its page object; keyed elements take typed keys (entity `Pick<>`, fixed sets, numbers) with per-value getters and an `…Items` locator; forms get a `…Values` type with `fill()`/`read()`; repeated items with read-only parts get a `…Row` type and `read()` (`null` for parts that aren't rendered). |
| `shared.ts` | Classes for subtrees rendered at several roots (the composer at `center.post_create` and `rhs.post_create`), constructed with their scope. |
| `pages.ts` | One class per route (`ChannelsPage` for `/:team/:path(channels|messages)/:identifier/:postid?`) with a typed params object and `goto(params)`; entity params take the entity or its key (`team: Pick<Team, 'name'> \| string`), fixed-set params default to their first value, optional params drop their segment. `App` has a getter per page: `await app.channelsPage.goto({team, channel})`. |
| plugin slots | Keys of host plugin slots (`pluginTestKey(pluginId)`, type `PluginTestKey`) are typed `PluginKey`: the keys plugin test packages add to `PluginKeys` by declaration merging. |
| `app.ts` | `App`, the root (`login()` returns it as `app`), and the `Plugins` interface plugin test packages augment. |
| `api.ts`, `sets.ts`, `msg.ts` | `Api` (operations by `operationId`, typed bodies), fixed key sets, the i18n catalog. |
| `app-map.json` | Per scope: elements, roles, what they open and fire, when they render. For agents. |

The runtime it targets is hand-written once in `@mattermost/playwright-lib`: `src/aria` (drivers, `Scope`, matchers, `Msg` formatting) and `src/settle.ts`.

Generated files import that runtime from `output.runtime` in the config: `@mattermost/playwright-lib` by default (a plugin's package), or a path to the runtime's source when the output is part of the lib itself, as the webapp's is (`"runtime": "../../e2e-tests/playwright/lib/src/aria"`, written as `'../../aria'`). The generator knows the runtime only by the names it imports.

### Plugins (plugin mode)

A plugin repo runs the same CLI with a `plugin` section in its config:

```json
{
    "root": "..",
    "tsconfig": "tsconfig.json",
    "include": ["src"],
    "plugin": {
        "manifest": "plugin.json",
        "hosts": [{"name": "11.0", "appMap": "e2e/hosts/11.0/app-map.json"}]
    },
    "output": {"manifest": "../test-surface.json", "generated": "../e2e/generated"}
}
```

- The plugin's testids live under `plugins.<key>`, its id normalized (`com.mattermost.calls` → `plugins.com_mattermost_calls.widget.leave--button`). Rule `plugin-scope` reports others.
- Its registry calls say which host slots it uses: each host's `app-map.json` lists its plugin slots with the registry methods that fill them (`PLUGIN_SLOT_REGISTRY_METHODS` in `@mattermost/shared/utils/test_id`), so `registerChannelHeaderMenuAction()` uses `channel_header_menu_item`. Rule `plugin-compat` fails when a host version in `hosts` doesn't render a slot the plugin uses. List one entry per supported server version (the `app-map.json` its `@mattermost/playwright-lib` ships).
- `generate` writes a package rooted at the plugin's class (`ComMattermostCalls`, its subtree named from the key on) that imports the runtime from `@mattermost/playwright-lib`, registers itself (`registerPluginSurface`) and adds itself to `Plugins` and its key to `PluginKeys` by declaration merging. Importing the package is enough: `app.plugins.comMattermostCalls.widget.clickLeaveButton()`, and host slots accept the key (`app.channelHeader.menu.plugin('com_mattermost_calls')`).

## Where things live

The manifest is the contract: the scanner writes it from the webapp's source, the generator reads nothing else (besides `en.json`), and each side changes without the other as long as the manifest's shape holds (`src/manifest_types.ts`).

| Piece | Where | Reviewed as part of |
|---|---|---|
| Scanner, checks, CLI, watch | `src/*.ts` | the webapp: it runs on the webapp's TypeScript program and its rules are the webapp's |
| Grammar | defined once in `@mattermost/types/test_id` (roles, words, the parser, the key helpers); the scanner (`src/grammar.ts`), the lint rules in `@mattermost/eslint-plugin` and the Playwright runtime import it, each wording its own messages; components import it through `@mattermost/shared/utils/test_id` | the webapp |
| Manifest | `webapp/channels/test-surface.json` (committed, CI-checked) | the change that moved the testids |
| Generator | `src/generate` (imports only the manifest types, the grammar and `src/compare.ts` from the rest of the package) | the e2e tests: its output is the API specs are written against |
| Generated page objects | `e2e-tests/playwright/lib/src/ui/generated` (committed, never edited) | the e2e tests |
| Runtime | `e2e-tests/playwright/lib/src/aria` | the e2e tests |

Scanner and generator ship as one package so a plugin repo runs one CLI (`scan`, then `generate`) against its own source, and `watch` rescans and regenerates in one process. A change to `src/generate` or to the runtime changes every spec's API: have someone who maintains the Playwright lib review it.

## Testing the tool

```sh
npm test                 # fixture projects under test/fixtures/<case>/ (tiny tsconfig + .tsx + expected snapshot)
UPDATE_SNAPSHOTS=1 npm test
npm run test:golden      # scans the real webapp; fails if coverage drops below golden.json
```

To add a resolver or tracer case, add files to a fixture (or a new fixture with its own `test-surface.config.json`), assert on the element in the matching `*.test.ts`, and accept the snapshot.
