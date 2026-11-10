import React from 'react';

// a registry entry's action and a composer handle: calls through data whose targets the scan can't see. Both return
// nothing, but only the composer's `focus` is known to send no request (`effects.pureCalls`).
type Registered = {id: string; action: () => void};
type Composer = {focus: () => void};

declare function useRegistered(): Registered[];
declare function useComposer(): Composer;

export function Registry() {
    const items = useRegistered();
    const composer = useComposer();
    return (
        <div>
            {items.map((item) => (
                <button
                    key={item.id}
                    data-testid='effects.registry.action--button'
                    onClick={() => item.action()}
                />
            ))}
            <button
                data-testid='effects.registry.focus--button'
                onClick={() => composer.focus()}
            />
        </div>
    );
}
