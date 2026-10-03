import { render } from 'preact';
import { App } from './components/App';
import { init } from './store';
import './styles.css';

render(<App />, document.getElementById('root')!);
void init();
