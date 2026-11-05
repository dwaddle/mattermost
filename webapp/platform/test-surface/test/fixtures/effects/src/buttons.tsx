import React, {useCallback} from 'react';
import {connect} from 'react-redux';
import {bindActionCreators} from 'redux';

import {loadMe, makeJoin, patchChannel, restoreChannel} from './actions';

type Props = {channelId: string; actions: {patchChannel: typeof patchChannel}};

// connect + bindActionCreators: this.props.actions.x is the action creator
class SaveButton extends React.Component<Props> {
    handleClick = () => {
        this.props.actions.patchChannel(this.props.channelId, {name: 'x'});
    };
    render() {
        return (
            <button
                data-testid='effects.panel.save--button'
                onClick={this.handleClick}
            />
        );
    }
}
function mapDispatchToProps(dispatch: unknown) {
    return {actions: bindActionCreators({patchChannel}, dispatch)};
}
export const ConnectedSave = connect(null, mapDispatchToProps)(SaveButton);

// one shared button, two instances with different callbacks: each template gets its own effects
export function ActionButton({scope, onClick}: {scope: string; onClick: () => void}) {
    return (
        <button
            data-testid={`${scope}.action--button`}
            onClick={onClick}
        />
    );
}

export function Panel({channelId, onDone, registry}: {channelId: string; onDone: () => void; registry: Map<string, () => Promise<void>>}) {
    const handleMe = useCallback(() => {
        loadMe()();
    }, []);
    return (
        <div>
            <ActionButton
                scope='effects.me'
                onClick={handleMe}
            />
            <ActionButton
                scope='effects.join'
                onClick={makeJoin(channelId)}
            />
            <button
                data-testid='effects.panel.iife--button'
                onClick={() => (async () => {
                    await loadMe()();
                })()}
            />
            <button
                data-testid='effects.panel.done--button'
                onClick={() => onDone()}
            />
            <button
                data-testid='effects.panel.dynamic--button'
                onClick={() => registry.get(channelId)!()}
            />
            <form onSubmit={() => patchChannel(channelId, {})(() => null)}>
                <button data-testid='effects.form.submit--button'/>
                <button
                    type='button'
                    data-testid='effects.form.cancel--button'
                />
            </form>
            <ConnectedSave channelId={channelId}/>
        </div>
    );
}

// a shared dialog whose confirm button calls the instance's callback through a local handler, and only
// renders when the instance passes one
export function Dialog({scope, onConfirm}: {scope: string; onConfirm?: () => void}) {
    const handleConfirm = useCallback(() => {
        onConfirm?.();
    }, [onConfirm]);
    let confirm = null;
    if (onConfirm) {
        confirm = (
            <ActionButton
                scope={`${scope}.confirm`}
                onClick={handleConfirm}
            />
        );
    }
    return <div>{confirm}</div>;
}

export function Dialogs({channelId}: {channelId: string}) {
    return (
        <div>
            <Dialog
                scope='effects.me_dialog'
                onConfirm={() => loadMe()()}
            />
            <Dialog
                scope='effects.patch_dialog'
                onConfirm={() => patchChannel(channelId, {name: 'y'})}
            />
            <Dialog scope='effects.info_dialog'/>
        </div>
    );
}

// the click starts an animation; the request is sent when the animation ends (a reaction's count)
export class Reaction extends React.Component<{channelId: string}, {animating: boolean}> {
    handleClick = () => this.setState({animating: true});
    handleAnimationEnd = () => {
        patchChannel(this.props.channelId, {name: 'reacted'});
    };
    render() {
        return (
            <button
                data-testid='effects.reaction--button'
                onClick={this.handleClick}
            >
                <span onAnimationEnd={this.handleAnimationEnd}>{'1'}</span>
            </button>
        );
    }
}

export function RestoreButton({channelId}: {channelId: string}) {
    return (
        <button
            data-testid='effects.restore--button'
            onClick={() => restoreChannel(channelId)()}
        />
    );
}

// AdminConsole's shape: a connected parent destructures an action, puts it in an object a local render helper
// takes, and the helper spreads it onto a page whose save button calls the prop
class SavePage extends React.Component<{save: (id: string) => void; other?: string}> {
    handleSubmit = () => {
        this.props.save('c');
    };
    render() {
        return (
            <button
                data-testid='effects.console.save--button'
                onClick={this.handleSubmit}
            />
        );
    }
}

function ConsoleBase(props: {actions: {patchChannel: (id: string) => void}}) {
    const {patchChannel: save} = props.actions;
    const renderRoutes = (extraProps: {save: (id: string) => void}) => (
        <div>
            <SavePage
                {...extraProps}
                other='x'
            />
        </div>
    );
    const extraProps = {
        save,
    };
    return <div>{renderRoutes(extraProps)}</div>;
}
function mapConsoleDispatch(dispatch: unknown) {
    return {actions: bindActionCreators({patchChannel: (id: string) => patchChannel(id, {name: 'saved'})}, dispatch)};
}
export const Console = connect(null, mapConsoleDispatch)(ConsoleBase);

// one handler with a submit flag: typing leaves it at its default (false), the apply button passes true
export class FlagForm extends React.Component<{channelId: string}> {
    handleChange = (value: string, doSubmit = false) => {
        if (doSubmit) {
            patchChannel(this.props.channelId, {name: value});
        }
    };
    render() {
        return (
            <div>
                <input
                    data-testid='effects.flags.name--textbox'
                    onChange={(e) => this.handleChange(e.target.value)}
                />
                <button
                    data-testid='effects.flags.apply--button'
                    onClick={() => this.handleChange('x', true)}
                />
            </div>
        );
    }
}

// the testid is written by a render helper inside the component (Input's generateInput): each usage still fires only
// the callback it passed
export function HelperInput({scope, onChange}: {scope: string; onChange: () => void}) {
    const renderInput = () => (
        <input
            data-testid={`${scope}.value--textbox`}
            onChange={() => onChange()}
        />
    );
    return <div>{renderInput()}</div>;
}

export function HelperInputs({channelId}: {channelId: string}) {
    return (
        <div>
            <HelperInput
                scope='effects.helper_me'
                onChange={() => loadMe()()}
            />
            <HelperInput
                scope='effects.helper_patch'
                onChange={() => patchChannel(channelId, {name: 'x'})}
            />
        </div>
    );
}
