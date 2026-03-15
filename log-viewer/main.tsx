import 'bootswatch/dist/darkly/bootstrap.min.css';
import '../src/web/style.css';
import '../src/web/themes/fantasy.css';
import '../src/web/themes/forest.css';
import '../src/web/themes/ice-fire.css';
import '../src/web/themes/ice-fire-2.css';
import ReactDOM from 'react-dom/client';
import LogViewerApp from './LogViewerApp';
import './log-viewer.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<LogViewerApp />);
