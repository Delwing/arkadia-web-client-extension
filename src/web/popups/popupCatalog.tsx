import type { ComponentType } from 'react';

import AssistantPopup from '../AssistantPopup';
import CarriagesPopup from '../CarriagesPopup';
import CechyPopup from '../CechyPopup';
import ChatPopup from '../ChatPopup';
import ClockPopup from '../ClockPopup';
import CombatPopup from '../CombatPopup';
import CombatStatusPopup from '../CombatStatusPopup';
import ContractsPopup from '../ContractsPopup';
import DataSourcesPopup from '../DataSourcesPopup';
import DepositsPopup from '../DepositsPopup';
import FishingPopup from '../FishingPopup';
import HerbManager from '../herbs/HerbManager';
import HerbTextWindow from '../herbs/HerbTextWindow';
import KnowledgeDetailsReport from '../KnowledgeDetailsReport';
import KnowledgeReport from '../KnowledgeReport';
import LetterViewPopup from '../LetterViewPopup';
import LootPopup from '../LootPopup';
import ObjectListDemoPopup from '../ObjectListDemoPopup';
import OswajaniePopup from '../OswajaniePopup';
import PackageReceiverPopup from '../PackageReceiverPopup';
import PeopleBrowser from '../PeopleBrowser/PeopleBrowser';
import PocztaPopup from '../PocztaPopup';
import Postepy2Popup from '../Postepy2Popup';
import PostepyPopup from '../PostepyPopup';
import ProfessionPopup from '../ProfessionPopup';
import RoomInfoPopup from '../RoomInfoPopup';
import SkrotyPopup from '../SkrotyPopup';
import StatPopup from '../StatPopup';
import SunTrackerPopup from '../SunTrackerPopup';
import TransportRoutePopup from '../TransportRoutePopup';
import TransportTimesDebugPopup from '../TransportTimesDebugPopup';
import TripPlannerPopup from '../TripPlannerPopup';
import WorldTimePopup from '../WorldTimePopup';
import WalkerPopup from '../WalkerPopup';
import Zabici2Popup from '../Zabici2Popup';
import ZabiciPopup from '../ZabiciPopup';
import ZlomPopup from '../ZlomPopup';

/**
 * A single self-contained dockable popup, keyed by the registry id it
 * publishes through `usePopup`/`useDockablePopup`. Popups are headless until
 * their open event fires, so simply mounting one is inert.
 */
export interface PopupCatalogEntry {
    /** Registry id the popup registers under (e.g. "popup:skroty"). */
    id: string;
    /** The popup component. */
    Component: ComponentType;
}

/**
 * Single source of truth for the standard, single-instance dockable popups.
 *
 * Both UIs render from this list so they never drift: the stock UI maps it to
 * bare `<Component />` mounts (docking/geometry handled by its WindowManager),
 * while forge-ui pairs each with a `FloatingPopupHost` to show it as a plain
 * floating window. Ids match each popup's internal `POPUP_ID`.
 *
 * Only genuinely non-catalog popups are excluded (they don't use the shared
 * popupRegistry / DockablePopupWrapper): the multi-instance static-map manager
 * (dynamic per-map ids), the transport debug popup and the letter composer
 * (both portal straight to the body with their own chrome), and plugin popups.
 * They are mounted separately by each host.
 */
export const POPUP_CATALOG: PopupCatalogEntry[] = [
    { id: 'popup:clock', Component: ClockPopup },
    { id: 'popup:worldTime', Component: WorldTimePopup },
    { id: 'popup:contracts', Component: ContractsPopup },
    { id: 'popup:carriages', Component: CarriagesPopup },
    { id: 'popup:fishing', Component: FishingPopup },
    { id: 'popup:herb', Component: HerbManager },
    { id: 'popup:herb-text', Component: HerbTextWindow },
    { id: 'popup:peopleBrowser', Component: PeopleBrowser },
    { id: 'popup:knowledgeReport', Component: KnowledgeReport },
    { id: 'popup:knowledgeDetails', Component: KnowledgeDetailsReport },
    { id: 'popup:chat', Component: ChatPopup },
    { id: 'popup:combat', Component: CombatPopup },
    { id: 'popup:combatStatus', Component: CombatStatusPopup },
    { id: 'popup:postepy', Component: PostepyPopup },
    { id: 'popup:cechy', Component: CechyPopup },
    { id: 'popup:postepy2', Component: Postepy2Popup },
    { id: 'popup:zabici', Component: ZabiciPopup },
    { id: 'popup:zabici2', Component: Zabici2Popup },
    { id: 'popup:skroty', Component: SkrotyPopup },
    { id: 'popup:tripPlanner', Component: TripPlannerPopup },
    { id: 'popup:objectListDemo', Component: ObjectListDemoPopup },
    { id: 'popup:walker', Component: WalkerPopup },
    { id: 'popup:poczta', Component: PocztaPopup },
    { id: 'popup:letter-view', Component: LetterViewPopup },
    { id: 'popup:roomInfo', Component: RoomInfoPopup },
    { id: 'popup:deposits', Component: DepositsPopup },
    { id: 'popup:packageReceiver', Component: PackageReceiverPopup },
    { id: 'popup:loot', Component: LootPopup },
    { id: 'popup:profession', Component: ProfessionPopup },
    { id: 'popup:sunTracker', Component: SunTrackerPopup },
    { id: 'popup:transport-route', Component: TransportRoutePopup },
    { id: 'popup:transport-times-debug', Component: TransportTimesDebugPopup },
    { id: 'popup:zlom', Component: ZlomPopup },
    { id: 'popup:stat', Component: StatPopup },
    { id: 'popup:oswajanie', Component: OswajaniePopup },
    { id: 'popup:dataSources', Component: DataSourcesPopup },
    { id: 'popup:assistant', Component: AssistantPopup },
];
