// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import Markdown from 'components/markdown';

import RadioOption from './radio_option';

import type {RadioSetting} from '../types';

type Props = {
    setting: RadioSetting;

    /** The currently selected value. */
    value: string;

    /** Called with the new value whenever the selection changes. */
    onChange: (value: string) => void;

    /** The group renders `<testIdScope>.setting:<name>`, each option `<testIdScope>.setting.option:<value>--radio`. */
    testIdScope?: TestId;
};

const markdownOptions = {mentionHighlight: false};

const Radio = ({
    setting,
    value,
    onChange,
    testIdScope,
}: Props) => {
    return (
        <fieldset
            key={setting.name}
            className='radio-option-list'
            data-testid={testIdScope ? `${testIdScope}.setting:${setting.name}` : undefined}
        >
            <legend className='form-legend hidden-label'>
                {setting.title || setting.name}
            </legend>
            <div className='settings-radio-group'>
                {setting.options.map((option) => (
                    <RadioOption
                        key={option.value}
                        name={setting.name}
                        option={option}
                        selectedValue={value}
                        onSelected={onChange}
                        testIdScope={testIdScope ? `${testIdScope}.setting` : undefined}
                    />
                ))}
            </div>
            {setting.helpText && (
                <div className='mt-5'>
                    <Markdown
                        message={setting.helpText}
                        options={markdownOptions}
                    />
                </div>
            )}
        </fieldset>
    );
};

export default Radio;
