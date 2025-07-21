import './App.css'
import {useState} from "react";
import {Tabs, Tab} from 'react-bootstrap';
import SettingsForm from "./Settings.tsx";
import Guilds from "./Guilds";
import Npc from "./Npc.tsx";
import SettingsFile from "./SettingsFile";
import Binds from "./Binds";
import Scripts from "./Scripts";
import Recordings from "./Recordings";
import Shortcuts from "./Shortcuts";


function App() {
    const [tab, setTab] = useState<'settings' | 'guilds' | 'npc' | 'file' | 'binds' | 'scripts' | 'recordings' | 'shortcuts'>('settings')

    return (
        <div className="p-2 d-flex flex-column h-100">
            <Tabs activeKey={tab} onSelect={(k) => k && setTab(k as any)} className="mb-2" variant={"pills"}>
                <Tab eventKey="settings" title="Ustawienia">
                    <SettingsForm />
                </Tab>
                <Tab eventKey="guilds" title="Gildie">
                    <Guilds />
                </Tab>
                <Tab eventKey="npc" title="Odbiorcy paczek">
                    <Npc />
                </Tab>
                <Tab eventKey="file" title="Plik ustawień">
                    <SettingsFile />
                </Tab>
                <Tab eventKey="binds" title="Bindowanie">
                    <Binds />
                </Tab>
                <Tab eventKey="scripts" title="Skrypty">
                    <Scripts />
                </Tab>
                <Tab eventKey="recordings" title="Nagrania">
                    <Recordings />
                </Tab>
                <Tab eventKey="shortcuts" title="Skr\u00f3ty">
                    <Shortcuts />
                </Tab>
            </Tabs>
        </div>
    )
}

export default App
