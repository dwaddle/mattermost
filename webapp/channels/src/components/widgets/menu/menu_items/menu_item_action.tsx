// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import menuItem from './menu_item';

type Props = {
    onClick: (e: React.MouseEvent) => void;
    text: React.ReactNode;
    extraText?: string;
    id?: string;
    buttonClass?: string;
    rightDecorator?: React.ReactNode;
    isDangerous?: boolean;
    disabled?: boolean;
    sibling?: React.ReactNode;
    iconClassName?: string;

    /** Renders `<testId>--button`; without it the button's testid is its id. */
    testId?: TestId;
};
export const MenuItemActionImpl = ({
    onClick,
    text,
    extraText,
    id,
    buttonClass,
    rightDecorator,
    isDangerous,
    disabled,
    sibling,
    iconClassName,
    testId,
}: Props) => (
    <>
        <button
            data-testid={testId ? `${testId}--button` : id}
            id={id}
            className={classNames('style--none', buttonClass, {
                'MenuItem__with-help': extraText,
                'MenuItem__with-sibling': sibling,
                disabled,
                MenuItem__dangerous: isDangerous,
            })}
            onClick={onClick}
            disabled={disabled}
        >
            {iconClassName && <i className={`icon ${iconClassName}`}/>}
            {text && <span className='MenuItem__primary-text'>{text}{rightDecorator}</span>}
            {extraText && <span className='MenuItem__help-text'>{extraText}</span>}
        </button>
        {sibling}
    </>

);

const MenuItemAction = menuItem(MenuItemActionImpl);
MenuItemAction.displayName = 'MenuItemAction';

export default MenuItemAction;
