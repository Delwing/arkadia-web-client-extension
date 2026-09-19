// The design system's stylesheet, once, before anything that uses it. No
// Bootstrap and no bootswatch on this page: it is the first screen built
// entirely on the new system.
import "@design/css/index.css";
import "./log-viewer.css";

import ReactDOM from "react-dom/client";
import LogViewerApp from "./LogViewerApp";

ReactDOM.createRoot(document.getElementById("root")!).render(<LogViewerApp />);
