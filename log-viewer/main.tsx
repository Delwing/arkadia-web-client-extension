import 'bootswatch/dist/darkly/bootstrap.min.css';
import '../src/web/style.css';
import ReactDOM from 'react-dom/client';
import LogViewerApp from './LogViewerApp';
import './log-viewer.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<LogViewerApp />);
