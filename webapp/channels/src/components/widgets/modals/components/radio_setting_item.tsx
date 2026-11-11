// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ReactNode, JSX} from 'react';
import React from 'react';

import {Radio} from '@mattermost/compass-ui/components/radio';
import {part} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';

import type {BaseSettingItemProps} from './base_setting_item';
import BaseSettingItem from './base_setting_item';

export type FieldsetRadio = {
    options: Array<{
        title: ReactNode;
        name: string;
        key: string;
        value: string;
    }>;
};

type Props = BaseSettingItemProps & {
    className?: string;
    inputFieldData: FieldsetRadio;
    inputFieldValue: string;
    handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;

    /** The options' scope: each renders `<testIdScope>.option:<value>--radio`. */
    testIdScope: TestId;
};

function RadioSettingItem({
    title,
    description,
    className,
    inputFieldData,
    inputFieldValue,
    handleChange,
    dataTestId,
    testIdScope,
}: Props): JSX.Element {
    const fields = inputFieldData.options.map((option) => {
        return (
            <Radio
                key={option.key}
                id={option.key}
                data-testid={part(testIdScope, 'option', {key: option.value}, 'radio')}
                className='mm-modal-generic-section-item__label-radio'
                name={option.name}
                checked={option.value === inputFieldValue}
                value={option.value}
                onChange={handleChange}
            >
                {option.title}
            </Radio>
        );
    });

    const content = (
        <fieldset
            className='mm-modal-generic-section-item__fieldset-radio'
        >
            <legend className='hidden-label'>
                {title}
            </legend>
            {[...fields]}
        </fieldset>
    );
    return (
        <BaseSettingItem
            dataTestId={dataTestId}
            className={className}
            content={content}
            title={title}
            description={description}
        />
    );
}

export default RadioSettingItem;
