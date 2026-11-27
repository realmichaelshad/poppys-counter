import '@fontsource/lilita-one/latin-400.css';
import '@fontsource-variable/figtree/wght.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-700.css';
import './styles.css';
import { render } from 'preact';
import { App } from './ui/App';
import { markAllSeen } from './ui/Kitchen';
import { ATTRACT, store } from './ui/state';
import { startAttract } from './ui/attract';
import { addLine, toOrder } from './domain/cart';
import { pickupSlots } from './domain/derive';
import { addToCart } from './ui/actions';

if (ATTRACT) startAttract();
else store.start();
markAllSeen();

render(<App />, document.getElementById('app')!);

// For the end-to-end tests and the screenshot script: read the shop, and dispatch like a tab would.
// `place` sends orders the way the menu does, so tests can fill the kitchen quickly.
function place(count: number, name = 'Test') {
  const items = ['everything', 'latte', 'egg-cheese', 'drip', 'sesame', 'the-poppy'];
  for (let i = 0; i < count; i++) {
    let c = addLine([], items[i % items.length], {}, 1 + (i % 2));
    if (i % 3 === 0) c = addLine(c, 'drip', {}, 1);
    const slot = pickupSlots(store.state.value, store.time()).slots.find((x) => !x.full);
    if (!slot) return;
    store.dispatch({ type: 'order.placed', order: toOrder(`t-${store.nextId()}`, c, count > 1 ? `${name} ${i + 1}` : name, slot.at) });
  }
}
(window as unknown as { __poppy: unknown }).__poppy = { store, place, addToCart };
