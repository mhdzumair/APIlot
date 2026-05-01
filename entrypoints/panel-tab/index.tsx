import { createRoot } from 'react-dom/client';
import '../../src/styles/globals.css';
import { PanelApp } from '../../src/components/panel/PanelApp';

const params = new URLSearchParams(window.location.search);
const tabId = parseInt(params.get('tabId') ?? '-1', 10);

createRoot(document.getElementById('root')!).render(<PanelApp tabId={tabId} />);
