import { createRoot } from 'react-dom/client';
import '../../src/styles/globals.css';
import { PanelApp } from '../../src/components/panel/PanelApp';

const tabId = (typeof chrome !== 'undefined' && chrome.devtools?.inspectedWindow?.tabId) ?? -1;
createRoot(document.getElementById('root')!).render(<PanelApp tabId={tabId} />);
