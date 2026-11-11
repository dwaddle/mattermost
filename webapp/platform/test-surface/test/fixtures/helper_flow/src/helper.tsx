import React from 'react';

import {part} from '@mattermost/shared/utils/test_id';

// src/template.tsx with part() for two of its guarded templates (the lines line up with that file's): see there
// for what the two cover.

function Icon({testId}: {testId?: string}) {
    return <i data-testid={testId}/>;
}

// a hook given its scope by two callers: a component's prop, and a literal
function useIcon(scope?: string) {
    return <Icon testId={part(scope, 'icon')}/>;
}

function Item({testIdScope}: {testIdScope?: string}) {
    const icon = useIcon(testIdScope);
    return <div>{icon}</div>;
}

function Overflow() {
    const icon = useIcon('hlp.menu.item');
    return <li>{icon}</li>;
}

export function Bar() {
    return (
        <>
            <Item testIdScope='hlp.bar.item'/>
            <Item/>
            <Overflow/>
        </>
    );
}

// a spinner whose own testid is the fallback where no scope reaches it
function Spinner({testId}: {testId?: string}) {
    return <span data-testid={testId ?? 'hlp_spinner'}/>;
}

function List({testId}: {testId?: string}) {
    return <Spinner testId={testId ? `${testId}.loading` : undefined}/>;
}

function Select({testIdScope}: {testIdScope?: string}) {
    return <List testId={testIdScope ? `${testIdScope}.list` : undefined}/>;
}

function Field({testIdScope}: {testIdScope?: string}) {
    return <Select testIdScope={part(testIdScope, 'select')}/>;
}

export function Form({names}: {names: string[]}) {
    return (
        <>
            <Field testIdScope='hlp.form'/>
            <Field/>
            {names.map((n) => (
                <Field
                    key={n}
                    testIdScope={n}
                />
            ))}
        </>
    );
}
