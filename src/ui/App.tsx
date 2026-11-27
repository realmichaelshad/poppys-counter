import { useEffect } from 'preact/hooks';
import { Mark } from '../art/Art';
import { kitchenTickets } from '../domain/derive';
import { KitchenView } from './Kitchen';
import { MenuView } from './Menu';
import { OwnerView } from './Owner';
import { CloseButton, Sheet } from './Sheet';
import { aboutOpen, attracting, kitchenVisited, myOrders, shop, store, view, wide, type View } from './state';
import { Finger } from './Finger';

const TABS: { id: View; label: string }[] = [
  { id: 'menu', label: 'Menu' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'owner', label: 'Owner' },
];

function About() {
  if (!aboutOpen.value) return null;
  const close = () => (aboutOpen.value = false);
  return (
    <Sheet label="About Poppy's Counter" onClose={close} class="about-sheet global">
      <div class="sheet-top">
        <h2 class="sheet-title">About this demo</h2>
        <CloseButton onClick={close} />
      </div>
      <p>
        Poppy's Counter is a working ordering app for a neighborhood bagel shop. The customer's phone, the kitchen screen and the owner's day all read the same list of
        orders, so a change in one shows in the others at once. Open the kitchen in a second tab and it follows along.
      </p>
      <p>
        The shop keeps its own clock, so a visit always lands at 8:20 in the morning. The orders from before you arrived were played from a seeded rush; the ones you send are
        yours.
      </p>
      <p>Concept project. Poppy's Counter is a fictional shop. Nothing is charged or sent, and nothing leaves this browser.</p>
      <p>
        <a href="https://michaelshadpour.com" target="_blank" rel="noopener">
          Design and build: Michael Shadpour
        </a>
      </p>
    </Sheet>
  );
}

export function App() {
  const v = view.value;
  const isWide = wide.value;
  useEffect(() => {
    const root = document.documentElement.classList;
    root.toggle('bg-ink', !isWide && v === 'kitchen');
    root.toggle('bg-paper', !isWide && v === 'owner');
  }, [v, isWide]);
  useEffect(() => {
    if (v === 'kitchen') kitchenVisited.value = true;
    if (!isWide) window.scrollTo(0, 0);
  }, [v]);

  if (isWide)
    return (
      <div class={`app wide${attracting.value ? ' attract' : ''}`}>
        <header class="top">
          <Mark size={44} />
          <div class="top-text">
            <h1 class="wordmark">Poppy's Counter</h1>
            <p class="tagline">A working ordering app. The phone, the kitchen and the owner share one set of orders.</p>
          </div>
          <button type="button" class="linkish about-btn" onClick={() => (aboutOpen.value = true)}>
            About
          </button>
        </header>
        <main class="cols">
          <section class="col col-phone" aria-label="The customer's phone">
            <p class="cap">The customer's phone</p>
            <div class="phone">
              <div class="phone-screen">
                <MenuView framed />
              </div>
            </div>
          </section>
          <section class="col col-kitchen" aria-label="The kitchen screen">
            <p class="cap">The kitchen screen</p>
            <div class="panel kitchen-panel">
              <KitchenView visible />
            </div>
          </section>
          <section class="col col-owner" aria-label="The owner's day">
            <p class="cap">The owner's day</p>
            <div class="panel owner-panel">
              <OwnerView />
            </div>
          </section>
        </main>
        <About />
        <Finger />
      </div>
    );

  const open = kitchenTickets(shop.value, store.now.value).length;
  const mine = myOrders.value.length > 0;
  const invite = mine && !kitchenVisited.value;
  return (
    <div class={`app single view-${v}${attracting.value ? ' attract' : ''}`}>
      <header class="top">
        <div class="brand">
          <Mark size={34} />
          <span class="wordmark">Poppy's Counter</span>
        </div>
        <nav class="tabs" role="tablist" aria-label="Screens">
          {TABS.map((t) => (
            <button
              type="button"
              role="tab"
              aria-selected={v === t.id}
              class={`tab${v === t.id ? ' on' : ''}`}
              data-tab={t.id}
              onClick={() => (view.value = t.id)}
            >
              {t.label}
              {t.id === 'kitchen' && open > 0 && <span class="badge num">{open}</span>}
              {t.id === 'kitchen' && invite && v !== 'kitchen' && <span class="invite-dot" aria-label="Your ticket is waiting" />}
            </button>
          ))}
        </nav>
      </header>
      <main class="single-main">
        {v === 'menu' && <MenuView framed={false} />}
        {v === 'kitchen' && <KitchenView visible />}
        {v === 'owner' && <OwnerView />}
      </main>
      <About />
      <Finger />
    </div>
  );
}
