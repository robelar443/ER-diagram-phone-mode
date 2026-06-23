import { createRoot } from 'react-dom/client';
import { FluentProvider, webDarkTheme } from '@fluentui/react-components';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
    <FluentProvider theme={webDarkTheme} style={{ height: '100vh', width: '100vw', margin: 0, padding: 0 }}>
        <App />
    </FluentProvider>
);
