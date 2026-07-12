import { useEffect } from 'react';
import { installContentWidthMeasurer } from '@web/contentWidthMeasurer';
import { useClient } from '../client/ClientContext';
import GameLog from './GameLog';

/**
 * The output column. Also owns the width measurer: the client is DOM-free, so it
 * can't size its own terminal column — this feeds it the character-cell count
 * from `#main_text_output_msg_wrapper` / `#content-width-measure`. The effect
 * runs after mount, so both elements exist when the measurer queries them.
 */
export default function World() {
    const client = useClient();

    useEffect(() => {
        installContentWidthMeasurer(client);
    }, [client]);

    return (
        <div className="world">
            <GameLog />
            <span id="content-width-measure">M</span>
        </div>
    );
}
