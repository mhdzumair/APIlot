import { createRoot } from 'react-dom/client';
import '../../src/styles/globals.css';
import { PopupApp } from '../../src/components/popup/PopupApp';

createRoot(document.getElementById('root')!).render(<PopupApp />);
