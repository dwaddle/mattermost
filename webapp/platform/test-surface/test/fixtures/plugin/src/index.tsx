import React from 'react';

type Registry = {
    registerChannelHeaderMenuAction: (text: string, action: () => void) => string;
    registerUserSettings: (setting: {id: string}) => void;
    registerGlobalComponent: (component: React.ComponentType) => string;
};

// plugin-drawn UI lives under `plugins.<key>`
export function Widget({onLeave}: {onLeave: () => void}) {
    return (
        <div data-testid='plugins.com_example_demo.widget'>
            <button
                data-testid='plugins.com_example_demo.widget.leave--button'
                onClick={onLeave}
            />
            <span data-testid='plugins.com_example_demo.widget.title--text'/>
            <span data-testid='widget.stray--text'/>
        </div>
    );
}

export default class Plugin {
    initialize(registry: Registry) {
        registry.registerChannelHeaderMenuAction('Demo', () => null);
        registry.registerUserSettings({id: 'demo'});
        registry.registerGlobalComponent(() => null);
    }
}
