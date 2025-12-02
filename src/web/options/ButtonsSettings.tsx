import { useState } from "react";
import MobileButtons from "./MobileButtons";
import DesktopButtons from "./DesktopButtons";

type Tab = 'mobile' | 'desktop';

function ButtonsSettings() {
    const [tab, setTab] = useState<Tab>('mobile');

    return (
        <div className="w-100 d-flex flex-column h-100" style={{ minHeight: 0 }}>
            <div className="mb-3 flex-shrink-0">
                <div className="d-flex gap-2">
                    <button
                        className={`btn btn-sm ${tab === 'mobile' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setTab('mobile')}
                    >
                        Przyciski mobilne
                    </button>
                    <button
                        className={`btn btn-sm ${tab === 'desktop' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setTab('desktop')}
                    >
                        Przyciski
                    </button>
                </div>
            </div>
            <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
                {tab === 'mobile' && <MobileButtons />}
                {tab === 'desktop' && <DesktopButtons />}
            </div>
        </div>
    );
}

export default ButtonsSettings;
