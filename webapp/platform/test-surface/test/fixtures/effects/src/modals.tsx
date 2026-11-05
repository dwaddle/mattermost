import React, {useCallback} from 'react';

import {loadMe, patchChannel} from './actions';

// redux plumbing, as in the webapp: openModal puts {dialogType, dialogProps} in the store and a
// controller renders dialogType with dialogProps; dispatch is the store's
type ModalData = {modalId: string; dialogType: React.ComponentType<any>; dialogProps?: Record<string, unknown>};
export function openModal(modalData: ModalData) {
    return {type: 'MODAL_OPEN', ...modalData};
}
function useDispatch() {
    return (action: unknown) => action;
}

// a shared confirmation, wrapped once (like ConfirmModalRedux around ConfirmModal)
function ConfirmDialog({testId, onConfirm}: {testId: string; onConfirm: () => void}) {
    const handleConfirm = () => {
        onConfirm();
    };
    return (
        <button
            data-testid={`${testId}.confirm--button`}
            onClick={handleConfirm}
        />
    );
}
export function ConfirmDialogRedux({onConfirm, ...rest}: {testId: string; onConfirm: () => void}) {
    return (
        <ConfirmDialog
            {...rest}
            onConfirm={() => onConfirm()}
        />
    );
}

// two openers, each with its own testid and callback: the click opens the dialog (it doesn't
// delete), and each dialog's confirm fires only its own opener's callback
export function DeleteHookLink({channelId}: {channelId: string}) {
    const dispatch = useDispatch();
    const onClick = useCallback(() => {
        dispatch(openModal({
            modalId: 'delete_hook',
            dialogType: ConfirmDialogRedux,
            dialogProps: {
                testId: 'effects.delete_hook_modal',
                onConfirm: () => patchChannel(channelId, {name: 'deleted'}),
            },
        }));
    }, [dispatch, channelId]);
    return (
        <button
            data-testid='effects.hooks.delete--button'
            onClick={onClick}
        />
    );
}
export function LeaveLink() {
    const dispatch = useDispatch();
    return (
        <button
            data-testid='effects.leave--button'
            onClick={() => dispatch(openModal({
                modalId: 'leave',
                dialogType: ConfirmDialogRedux,
                dialogProps: {testId: 'effects.leave_modal', onConfirm: () => loadMe()()},
            }))}
        />
    );
}

// a callback passed down through an `actions` object and a styled() wrapper (the channel info panel's edit buttons)
const styled = (_component: unknown) => (_css: TemplateStringsArray) => (_props: any) => null;
function AreaBase({testId, onEdit}: {testId: string; onEdit: () => void}) {
    return (
        <button
            data-testid={`${testId}.edit--button`}
            onClick={onEdit}
        />
    );
}
const Area = styled(AreaBase)`color: red;`;
function About({actions}: {actions: {editName: () => void}}) {
    return (
        <Area
            testId='effects.about.name'
            onEdit={actions.editName}
        />
    );
}
function AboutSection({actions}: {actions: {editName: () => void}}) {
    return <About actions={actions}/>;
}
export function Info({channelId}: {channelId: string}) {
    const editName = () => {
        patchChannel(channelId, {name: 'renamed'});
    };
    return <AboutSection actions={{editName}}/>;
}

// a hook that returns a click handler held in a `let`, assigned only on one branch (a file bookmark opens a preview)
function FilePreview() {
    return <div/>;
}
function useOpener(isFile: boolean) {
    const dispatch = useDispatch();
    const openPreview = () => {
        dispatch(openModal({modalId: 'preview', dialogType: FilePreview}));
    };
    let onClick: (() => void) | undefined;
    if (isFile) {
        onClick = openPreview;
    }
    return {onClick};
}
export function FileLink({isFile}: {isFile: boolean}) {
    const {onClick} = useOpener(isFile);
    return (
        <a
            href='#'
            data-testid='effects.file--link'
            onClick={onClick}
        />
    );
}

// a modal whose root container sits under another scope (`effects.graph.grant_modal` inside `effects.graph`): the modal is
// that container's scope, not its parent's
function GrantModal({onConfirm}: {onConfirm: () => void}) {
    return (
        <div data-testid='effects.graph.grant_modal'>
            <button
                data-testid='effects.graph.grant_modal.confirm--button'
                onClick={onConfirm}
            />
        </div>
    );
}
export function GrantLink() {
    const dispatch = useDispatch();
    return (
        <button
            data-testid='effects.graph.grant--button'
            onClick={() => dispatch(openModal({modalId: 'grant', dialogType: GrantModal, dialogProps: {onConfirm: () => {}}}))}
        />
    );
}

// one delete link component used by two lists, each passing its own callback: the confirmation is one shared
// scope, and what its confirm sends depends on which list's link opened it
function DeleteRowLink({testId, onDelete}: {testId: string; onDelete: () => void}) {
    const dispatch = useDispatch();
    const onClick = () => {
        dispatch(openModal({modalId: 'delete_row', dialogType: ConfirmDialogRedux, dialogProps: {testId: 'effects.delete_row_modal', onConfirm: onDelete}}));
    };
    return (
        <button
            data-testid={`${testId}.delete--button`}
            onClick={onClick}
        />
    );
}
export function ChannelRows({channelId}: {channelId: string}) {
    return (
        <DeleteRowLink
            testId='effects.channels.row'
            onDelete={() => patchChannel(channelId, {name: 'gone'})}
        />
    );
}
export function MeRows() {
    return (
        <DeleteRowLink
            testId='effects.me_rows.row'
            onDelete={() => loadMe()()}
        />
    );
}
