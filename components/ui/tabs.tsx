'use client';

import { useState, type ReactNode } from 'react';

/**
 * Tabs *inside* an entity screen — "Out now · To bill · Billed · Returned".
 *
 * The point of the redesign: a contractor's four questions are four views of
 * one person, not four destinations in the bottom bar. So they are tabs here,
 * under the name they belong to.
 *
 * Every panel is rendered on the server and handed in as a `ReactNode`. This
 * component only decides which one is on screen, which keeps D38 intact —
 * screens stay server components, and the one client component is the thing
 * that mutates, here a single index. It also means switching tabs costs no
 * round trip and works with no signal: the whole customer arrived with the
 * page.
 *
 * Not URL state, unlike `Segmented`. A tab here is *where you are looking*
 * rather than *what the screen is about* — nothing below it changes meaning,
 * and a search param per glance would put four entries in the back stack
 * between a contractor and the screen before them (D62).
 *
 * Hidden panels stay mounted, `hidden` rather than unrendered, so the browser
 * keeps their scroll position and Ctrl-F still finds a site name in a tab you
 * are not on.
 */
export interface TabPanel {
  label: string;
  /** Rendered as a small badge beside the label. Omit, or 0, to show nothing. */
  count?: number;
  panel: ReactNode;
}

export function Tabs({ tabs, initial = 0 }: { tabs: TabPanel[]; initial?: number }) {
  const [selected, setSelected] = useState(initial);

  return (
    <div>
      <div
        role="tablist"
        aria-label="View"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const active = index === selected;

          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              id={`tab-${index}`}
              aria-selected={active}
              aria-controls={`panel-${index}`}
              onClick={() => setSelected(index)}
              className={`tap flex shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-150 ${
                active
                  ? 'bg-steel text-white'
                  : 'bg-card text-ink-2 hover:text-ink active:bg-paper'
              }`}
            >
              {tab.label}
              {tab.count ? (
                <span
                  className={`tabular rounded-full px-1.5 text-xs font-semibold ${
                    active ? 'bg-white/20 text-white' : 'bg-steel-soft text-steel'
                  }`}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`panel-${index}`}
          aria-labelledby={`tab-${index}`}
          hidden={index !== selected}
          className="mt-3"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
