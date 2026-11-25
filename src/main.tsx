import { createRoot } from 'react-dom/client';
import { AppRouter } from './client/AppRouter';
import './index.css';

createRoot(document.getElementById('root')!).render(<AppRouter />);
