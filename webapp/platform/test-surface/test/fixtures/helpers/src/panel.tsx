import React from 'react';

import {keyed, part, pluginSlotPath, pluginSlotTestId} from '@mattermost/shared/utils/test_id';

type Item = {id: string; label: string};

function MenuItem({testId}: {testId?: string}) {
    return <li data-testid={testId && `${testId}--menuitem`}/>;
}

// testids built with the helpers: a scope's parts, keyed rows, a keyed scope, plugin slots
export function Panel({testId, items, pluginId, postScope}: {testId?: string; items: Item[]; pluginId: string; postScope?: string}) {
    return (
        <div data-testid={part(testId, 'body')}>
            <button data-testid={part(testId, 'save', 'button')}/>
            {items.map((it) => (
                <span
                    key={it.id}
                    data-testid={part(testId, 'list.row', {key: it.id}, 'text')}
                />
            ))}
            {items.map((it) => (
                <a
                    key={it.id}
                    data-testid={keyed(testId, it.id, 'link')}
                />
            ))}
            <button data-testid={pluginSlotTestId('app_bar_button', pluginId)}/>
            <button data-testid={pluginSlotTestId('post_menu_item', pluginId, postScope)}/>
            <MenuItem testId={pluginSlotPath('product_menu_item', pluginId)}/>
        </div>
    );
}

// one usage passes a scope; one passes none, so its parts render no testid at all
export function Panels() {
    return (
        <>
            <Panel
                testId='helpers.panel'
                items={[]}
                pluginId='com.example.one'
                postScope='helpers.post'
            />
            <Panel
                items={[]}
                pluginId='com.example.two'
            />
        </>
    );
}
