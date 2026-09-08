import './styles/themes.css';
import './styles/base.css';
import './styles/shelf.css';
import './styles/reader.css';
import './styles/overlays.css';
import { ReaderApp } from './app.ts';

void new ReaderApp(import.meta.env.BASE_URL).start();
