import React from 'react';

// Guarded templates that src/helper.tsx writes with part(): a hook's (called with a prop and with a literal), and a
// scope passed down to a list whose spinner falls back to its own testid where no scope reaches it. The two files
// must scan the same, instance for instance (scopes `tpl` here, `hlp` there; the lines line up, so the exact
// locations differ only in the file name).

function Icon({testId}: {testId?: string}) {
    return <i data-testid={testId}/>;
}

// a hook given its scope by two callers: a component's prop, and a literal
function useIcon(scope?: string) {
    return <Icon testId={scope ? `${scope}.icon` : undefined}/>;
}

function Item({testIdScope}: {testIdScope?: string}) {
    const icon = useIcon(testIdScope);
    return <div>{icon}</div>;
}

function Overflow() {
    const icon = useIcon('tpl.menu.item');
    return <li>{icon}</li>;
}

export function Bar() {
    return (
        <>
            <Item testIdScope='tpl.bar.item'/>
            <Item/>
            <Overflow/>
        </>
    );
}

// a spinner whose own testid is the fallback where no scope reaches it
function Spinner({testId}: {testId?: string}) {
    return <span data-testid={testId ?? 'tpl_spinner'}/>;
}

function List({testId}: {testId?: string}) {
    return <Spinner testId={testId ? `${testId}.loading` : undefined}/>;
}

function Select({testIdScope}: {testIdScope?: string}) {
    return <List testId={testIdScope ? `${testIdScope}.list` : undefined}/>;
}

function Field({testIdScope}: {testIdScope?: string}) {
    return <Select testIdScope={testIdScope ? `${testIdScope}.select` : undefined}/>;
}

export function Form({names}: {names: string[]}) {
    return (
        <>
            <Field testIdScope='tpl.form'/>
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
