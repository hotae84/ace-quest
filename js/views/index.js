import { renderSetup } from './setup.js';
import { renderMap } from './map.js';
import { renderBattle } from './battle.js';
import { renderVerdict } from './verdict.js';
import { renderResult } from './result.js';

export function renderView(app) {
  const st = app.state;
  switch (st.view) {
    case 'setup': return renderSetup(app, { first: true });
    case 'settings': return renderSetup(app, { first: false });
    case 'battle': return st.round ? renderBattle(app) : renderMap(app);
    case 'verdict': return st.round ? renderVerdict(app) : renderMap(app);
    case 'result': return renderResult(app);
    default: return renderMap(app);
  }
}
