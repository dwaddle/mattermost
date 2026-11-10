# @mattermost/eslint-plugin

An ESLint plugin containing the configuration used by Mattermost as well as support for custom rules specific to the Mattermost code base.

## Custom Rules

### no-dispatch-getstate

Prevents passing a [redux](https://redux.js.org/) store's `getState` into its `dispatch` as an unnecessary second argument.

We started doing this accidentally at some point because of a misunderstanding about how [redux-thunk](https://github.com/reduxjs/redux-thunk) worked, so this stops anyone from making that same mistake again.

Examples of **incorrect** code for this rule:
```javascript
export function someAction() {
    return (dispatch, getState) => {
        dispatch(doSomething(), getState);
    };
}
```

Examples of **correct** code for this rule:
```javascript
export function someAction() {
    return (dispatch) => {
        dispatch(doSomething());
    };
}
```

### no-redundant-admin-config-deps

Enforces that System Console settings in `admin_definition` files do not repeat `isDisabled` config/state checks already implied by a parent setting they depend on.

When setting B disables itself with `it.stateIsFalse('A')`, A is a bool setting, and A already includes condition C (for example `it.configIsTrue('ClusterSettings', 'Enable')`), repeating C on B is redundant and tends to drift. Keep the dependency on A and omit the duplicated checks. Inheritance only follows bool parents (disabled bools are forced false on save). Permission and license helpers are not treated as config dependencies.

The rule builds the full bool-parent dependency tree before reporting. If a setting lists both a parent and a grandparent, redundant conditions are attributed to the closest (most specific) parent — not whichever ancestor appears first in `isDisabled`.

Examples of **incorrect** code for this rule:
```javascript
{
    type: 'bool',
    key: 'EmailSettings.EnableEmailBatching',
    isDisabled: it.any(
        it.stateIsFalse('EmailSettings.SendEmailNotifications'),
        it.configIsTrue('ClusterSettings', 'Enable'),
    ),
},
{
    type: 'number',
    key: 'EmailSettings.EmailBatchingBufferSize',
    isDisabled: it.any(
        it.stateIsFalse('EmailSettings.SendEmailNotifications'),
        it.stateIsFalse('EmailSettings.EnableEmailBatching'),
        it.configIsTrue('ClusterSettings', 'Enable'),
    ),
},
```

Examples of **correct** code for this rule:
```javascript
{
    type: 'bool',
    key: 'EmailSettings.EnableEmailBatching',
    isDisabled: it.any(
        it.stateIsFalse('EmailSettings.SendEmailNotifications'),
        it.configIsTrue('ClusterSettings', 'Enable'),
    ),
},
{
    type: 'number',
    key: 'EmailSettings.EmailBatchingBufferSize',
    isDisabled: it.any(
        it.stateIsFalse('EmailSettings.EnableEmailBatching'),
    ),
},
```

### testid-grammar

Requires testids to follow the testid grammar, which is defined once in `@mattermost/types/test_id`:

```
testid  := path [ ":" KEY ] [ "--" ROLE ]
path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
WORD    := [a-z][a-z0-9_]*
```

The rule checks `data-testid` and the props and object properties that carry a testid (option `props`; by default
`dataTestId` and `*TestId` hold a full testid, `testId`, `testIdScope` and `*TestIdScope` a path without the role).
It checks every branch that can render (`?:`, `||`, `??`, the right of `&&`), rejects testids built with `+`, follows
same-file `const`s, and allows a composed prefix (`` `${testId}.close--button` ``) only from a testid prop or scope.
It also checks the arguments of the helpers in `@mattermost/shared/utils/test_id`: `part()`'s path is a literal of
lower_snake_case words, keys are runtime data (never literals), and roles are literal `TestIdRole`s.

Build testids from a scope with the helpers, so a missing scope renders no testid instead of a broken one:

```javascript
<span data-testid={part(postTestIdScope, 'only_visible_to_you', 'text')}/>                  // scope.only_visible_to_you--text
<li data-testid={part(testId, 'option', {key: option.id}, 'menuitemcheckbox')}/>            // testId.option:<id>--menuitemcheckbox
<button data-testid={keyed(testIdScope, status.id, 'button')}/>                             // testIdScope:<id>--button
<button data-testid={pluginSlotTestId('post_menu_item', plugin.id, testIdScope)}/>          // from PLUGIN_SLOT_TEST_IDS
```

Keys: what a list item is keyed by.

- Teams by id.
- Channels by name in a list of one team's channels (names are unique per team and are what fixtures know); by id
  in a list that can span teams.
- People by user id (a DM row is keyed by the other user's id, not the DM channel's).
- Settings by `settingTestKey(path)`, plugins by `pluginTestKey(id)`, suggestions by `suggestionTestKey(term)`.
- Positional keys (`:${index}`) only for lists the UI numbers (rules shown as "1.1", "1.2"); otherwise an index
  changes when the list reorders and the test targets the wrong row.
- Never translated text: it changes with the locale.

Lists: a keyed row is the container, and its parts are unkeyed children of it. Write
`admin.users.row:${user.id}` on the row and `admin.users.row.name--text` inside it (the generated page objects give
`row(id).nameText`), not a separately keyed `admin.users.name:${user.id}--text` for each cell.

Examples of **incorrect** code for this rule:

```javascript
<button data-testid='SendMessageButton'/>
<button data-testid={testId ? `${testId}--button` : 'legacy-send-button'}/>
<button data-testid={'center.post:' + post.id + '--button'}/>
<button data-testid={`${prefix}--button`}/>
<Button testId='center.send--button'/>
```

Examples of **correct** code for this rule:

```javascript
<button data-testid='center.post_create.send--button'/>
<button data-testid={withRole(testId, 'button')}/>
<a data-testid={`lhs.channel_list.channel:${channel.name}--link`}/>
<Button testId='center.post_create.send'/>
```

### testid-no-unscoped-data

Disallows testids made entirely of runtime data (`data-testid={setting.key}`, `data-testid={props.id}`): the scope and
name must be literal in the source, so the scanner can generate a page object for them. A value passed down from a
prop named like `testId` / `testIdScope`, or built with the testid helpers, is fine. Takes the same `props` option as
`testid-grammar`.

### e2e rules

Rules for the Playwright specs (`e2e-tests/playwright`):

- `e2e-no-literal-locators`: no hand-written selectors (literals, template literals, `const`s, `filter({hasText})`,
  `data-testid` selectors in `querySelector`/`evaluate`); reach elements through the generated page objects.
- `e2e-no-wait-for-timeout`: no fixed sleeps (`waitForTimeout`, `pw.wait`, timers wrapped in a promise).
- `e2e-commit-settles`: a click that saves goes through `commit()` / `submit()` / `settle()`. With the `generated`
  option it reads which elements save from the generated page objects' effects; without it, from the getter's name.
- `e2e-no-catalog-text`: no catalog English in text assertions; assert `Msg` messages with `toHaveMessage`.
- `e2e-no-locator-action`: act through the driver (`x.click()`), not its raw locator (`x.locator.click()`).
- `e2e-named-timeouts`: timeouts use the lib's named durations (`duration.half_min`).
- `e2e-no-instant-check`: no one-shot reads (`expect(await x.isDisabled())`) right after an action; use the retrying
  matchers.
- `e2e-no-expect-in-page-objects`: page objects and flows locate and act; specs assert.

### use-external-link

Ensures that any link which opens a URL outside of Mattermost using `target="_blank"` uses the `ExternalLink` component.

Examples of **incorrect** code for this rule:
```javascript
export function SomeLink() {
    return (
        <a
            href="https://example.com"
            target="_blank"
            rel="noopener noreferrer"
        />
    );
}
```

Examples of **correct** code for this rule:
```javascript
import ExternalLink from 'components/external_link';

export function SomeLink() {
    return <ExternalLink href="https://example.com"/>;
}
```
