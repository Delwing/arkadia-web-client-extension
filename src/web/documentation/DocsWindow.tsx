import { useCallback, useState } from 'react';
import { type ClientEvents } from '@modules/core/eventBus';
import { DockablePopupWrapper } from '@web/layout/components/DockablePopupWrapper';
import { usePopup } from '@web/hooks/usePopup';
import { usePopupSetting } from '@web/hooks/usePopupSetting';
import DocsView from './DocsView';

export const DOCS_POPUP_ID = 'popup:docs';

export default function DocsWindow() {
    const [pageKey, setPageKey] = usePopupSetting(DOCS_POPUP_ID, 'page', 'overview');
    const [query, setQuery] = useState('');
    const onOpen = useCallback(
        (detail: ClientEvents['docs.popup.open']) => {
            if (detail && typeof detail === 'object' && detail.page) {
                setPageKey(detail.page);
                setQuery('');
            }
        },
        [setPageKey],
    );
    const { wrapperProps, isOpen } = usePopup(DOCS_POPUP_ID, { openEvent: 'docs.popup.open', onOpen });

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="docs"
            title="Dokumentacja"
            minWidth={320}
            minHeight={320}
            initialWidth={Math.min(1100, window.innerWidth - 16)}
            initialHeight={Math.min(window.innerHeight * 0.85, window.innerHeight - 32)}
            className="docs-window"
            bodyClassName="docs-window-body"
        >
            {/* Pages are parsed on first open, not at start-up. */}
            {isOpen && <DocsView pageKey={pageKey} onPageKey={setPageKey} query={query} onQuery={setQuery} />}
        </DockablePopupWrapper>
    );
}
