// No Bootstrap and no bootswatch on this page: the viewer brings its own
// palette and its own controls, so the only stylesheet the page itself needs
// is the box the viewer fills.
import "./log-viewer.css";

import ReactDOM from "react-dom/client";
import LogViewerApp from "./LogViewerApp";

ReactDOM.createRoot(document.getElementById("root")!).render(<LogViewerApp />);
