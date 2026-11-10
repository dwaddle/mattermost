import React from 'react';

import {keyed, part} from './utils/test_id';

// a component of the shared package that imports the helpers by path
export function Card({testId, tag}: {testId?: string; tag: string}) {
    return (
        <div data-testid={part(testId, 'card')}>
            <span data-testid={keyed(part(testId, 'card.tag'), tag, 'text')}/>
            <button data-testid={part(testId, 'card.close', 'button')}/>
        </div>
    );
}

export const Cards = () => (
    <Card
        testId='helpers.cards'
        tag='new'
    />
);
