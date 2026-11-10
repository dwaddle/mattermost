import Client4 from '../client/client4';

// a cycle: each sends its own request and calls the other. Tracing the first button reaches `ping` again inside
// `pong`, where the cycle is cut; that cut result of `pong` mustn't stand for `pong` when the second button calls it.
function ping(n: number): unknown {
    Client4.getMe();
    return n > 0 ? pong(n - 1) : null;
}

function pong(n: number): unknown {
    Client4.patchChannel('c', {});
    return n > 0 ? ping(n - 1) : null;
}

export function Cycles() {
    return (
        <div>
            <button
                data-testid='effects.cycle.ping--button'
                onClick={() => ping(2)}
            />
            <button
                data-testid='effects.cycle.pong--button'
                onClick={() => pong(2)}
            />
        </div>
    );
}
