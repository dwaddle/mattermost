import React from 'react';

type SettingTestKey = string & {readonly __settingTestKey: true};

function settingTestKey(path: string): SettingTestKey {
    return path.replace(/[.:]/g, '_') as SettingTestKey;
}

// a System Console setting row: keyed by its config path, through a wrapper's key prop
function Row({id, testIdKey}: {id: string; testIdKey?: SettingTestKey}) {
    return (
        <div data-testid={testIdKey ? `values.setting:${testIdKey}` : undefined}>
            <input
                id={id}
                data-testid='values.setting.value--textbox'
            />
        </div>
    );
}

export function SiteUrl() {
    return (
        <Row
            id='ServiceSettings.SiteURL'
            testIdKey={settingTestKey('ServiceSettings.SiteURL')}
        />
    );
}

// a page's own setting, whose id is not a config path: its literal id is a key beside the config paths
export function LocalToggle() {
    return (
        <Row
            id='bannerEnabled'
            testIdKey={settingTestKey('bannerEnabled')}
        />
    );
}

// settings rendered from a definition list: each entry is one kind of a union, and a renderer takes one kind. Its
// `setting.key` reads the `key` of every definition of that kind: a page's own keys, dotted or not (a toggle's key
// isn't one: the discriminant types that entry as the other kind)
type TextDefinition = {type: 'text'; key: string};
type ToggleDefinition = {type: 'bool'; key: string};
type SettingDefinition = TextDefinition | ToggleDefinition;

const definitions: SettingDefinition[] = [
    {type: 'text', key: 'openidType'},
    {type: 'text', key: 'GitLabSettings.Url'},
    {type: 'bool', key: 'EnableGitLab'},
];

function renderText(setting: TextDefinition) {
    return (
        <Row
            key={setting.key}
            id={setting.key}
            testIdKey={settingTestKey(setting.key)}
        />
    );
}

export function DefinedSettings() {
    return <>{definitions.map((d) => (d.type === 'text' ? renderText(d) : null))}</>;
}

// a page that extends a kind where it uses it (a button and its action) and renders it from a member of its props.
// Its list is typed by its own union of the kinds, which the checker flattens, so the kinds no longer carry their
// names: the button's key is found by its `type` and by the page's kind fitting the list's
type ButtonDefinition = {type: 'button'; key: string};
type PageDefinition = (TextDefinition | ButtonDefinition) & {moreInfo?: string};
type PageButton = ButtonDefinition & {action: () => void};

const pageDefinitions: PageDefinition[] = [
    {type: 'button', key: 'LdapSettings.TestConnection'},
];

function PageButtonRow(props: {setting: PageButton}) {
    return (
        <Row
            id={props.setting.key}
            testIdKey={settingTestKey(props.setting.key)}
        />
    );
}

export function PageButtons() {
    return <>{pageDefinitions.map((d) => (d.type === 'button' ? <PageButtonRow setting={{...d, action: () => undefined}}/> : null))}</>;
}

// rows for runtime entries (custom profile attributes): an id made of a literal and the entry's name is any id that shape
export function AttributeSettings({attributes}: {attributes: Array<{name: string}>}) {
    return (
        <>
            {attributes.map((a) => (
                <Row
                    key={a.name}
                    id={`custom_attribute-${a.name}`}
                    testIdKey={settingTestKey(`custom_attribute-${a.name}`)}
                />
            ))}
        </>
    );
}
