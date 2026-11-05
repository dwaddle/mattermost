import Client4 from '../client/client4';
import type {Channel} from '../types/channels';

export function logError(e: unknown) {
    return Client4.logClientError(String(e));
}

// a thunk: the request is inside the returned function; the catch path is not what the action does
export function patchChannel(channelId: string, patch: Partial<Channel>) {
    return async (dispatch: (a: unknown) => unknown) => {
        try {
            const c = await Client4.patchChannel(channelId, patch);
            dispatch({type: 'RECEIVED', c});
        } catch (e) {
            Client4.logClientError('failed');
        }
        return {};
    };
}

export function restoreChannel(channelId: string) {
    return async () => {
        const {data} = await Client4.restoreChannel(channelId);
        return {data};
    };
}

export function loadMe() {
    return async () => {
        await Client4.getMe().catch(logError);
    };
}

// a factory that returns a handler
export function makeJoin(channelId: string) {
    return () => Client4.requestJoinChannel(channelId);
}
