// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import MuiMenuList from '@mui/material/MenuList';
import React from 'react';
import type {MouseEvent} from 'react';
import {useSelector} from 'react-redux';

import {GenericModal} from '@mattermost/components';

import {getTheme} from 'mattermost-redux/selectors/entities/preferences';

import CompassDesignProvider from 'components/compass_design_provider';

import type {MenuButtonProps, MenuProps, Props} from './menu';

/** The menu as a modal, in mobile view: one modal for every menu, so its scope is `menu_modal`. */
export interface MenuModalProps {
    menuButtonId: MenuButtonProps['id'];
    menuId: MenuProps['id'];
    menuAriaLabel: MenuProps['aria-label'];
    className: MenuProps['className'];
    onModalClose: (modalId: MenuProps['id']) => void;
    children: Props['children'];
    onKeyDown?: MenuProps['onKeyDown'];
    menuHeader?: Props['menuHeader'];
    menuFooter?: Props['menuFooter'];
}

export default function MenuModal(props: MenuModalProps) {
    const theme = useSelector(getTheme);

    function closeMenuModal() {
        props.onModalClose(props.menuId);
    }

    function handleModalClickCapture(event: MouseEvent<HTMLDivElement>) {
        if (event && event.currentTarget.contains(event.target as Node)) {
            for (const currentElement of event.currentTarget.children) {
                if (currentElement.contains(event.target as Node) && !currentElement.ariaHasPopup) {
                    // We check for property ariaHasPopup because we don't want to close the menu
                    // if the user clicks on a submenu item or menu item which open modal. And let submenu component handle the click.
                    closeMenuModal();
                    break;
                }
            }
        }
    }

    function handleKeydown(event?: React.KeyboardEvent<HTMLDivElement>) {
        if (event && props.onKeyDown) {
            props.onKeyDown(event, closeMenuModal);
        }
    }

    return (
        <CompassDesignProvider theme={theme}>
            <GenericModal
                id={props.menuId}
                className='menuModal'
                testId='menu_modal'
                backdrop={true}
                ariaLabel={props.menuAriaLabel}
                onExited={closeMenuModal}
                enforceFocus={false}
                handleKeydown={handleKeydown}
            >
                <MuiMenuList // serves as backdrop for modals
                    component='div'
                    data-testid='menu_modal.list'
                    aria-labelledby={props.menuButtonId}
                    onClick={handleModalClickCapture}
                    className={props.className}
                >
                    {props.menuHeader}
                    {props.children}
                    {props.menuFooter}
                </MuiMenuList>
            </GenericModal>
        </CompassDesignProvider>
    );
}
