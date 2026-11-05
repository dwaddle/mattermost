import React from 'react';

type PluginTestKey = string & {readonly __pluginTestKey: true};

function pluginTestKey(pluginId: string): PluginTestKey {
    return pluginId.toLowerCase().replace(/[^a-z0-9_]/g, '_') as PluginTestKey;
}

export const SLOTS = {
    header_button: 'checks.plugins.action:{plugin}--button',
    gone: 'checks.plugins.removed:{plugin}--button',
    unkeyed: 'checks.plugins.by_name:{plugin}--button',
} as const;

export function PluginButtons({plugs}: {plugs: Array<{pluginId: string; name: string}>}) {
    return (
        <div>
            {plugs.map((p) => (
                <React.Fragment key={p.pluginId}>
                    <button data-testid={`checks.plugins.action:${pluginTestKey(p.pluginId)}--button`}/>
                    <button data-testid={`checks.plugins.by_name:${p.name}--button`}/>
                    <button data-testid={`checks.plugins.extra:${pluginTestKey(p.pluginId)}--button`}/>
                </React.Fragment>
            ))}
        </div>
    );
}
