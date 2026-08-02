'use client';

import { useState } from 'react';

import type { MessageTemplate } from '@/lib/messages';
import { formatMobile, waHref } from '@/lib/format';

import { Card } from '../ui/layout';

/**
 * §09 WhatsApp delivery — a composer, not a sender.
 *
 * It picks a template, lets the admin edit it, and opens `wa.me` so the message
 * goes from their own number. Nothing is sent by the server: no Business API,
 * no cost, no approval, and a human reads every message before a contractor
 * they know personally receives it.
 */
export function WhatsAppComposer({
  mobile,
  templates,
  title = 'Send a message',
}: {
  mobile: string;
  templates: MessageTemplate[];
  title?: string;
}) {
  const [selected, setSelected] = useState(templates[0]?.id ?? '');
  const [text, setText] = useState(templates[0]?.text ?? '');
  const [copied, setCopied] = useState(false);

  function choose(template: MessageTemplate) {
    setSelected(template.id);
    setText(template.text);
    setCopied(false);
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-ink-2">{formatMobile(mobile)}</span>
      </div>

      {templates.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => choose(template)}
              aria-pressed={template.id === selected}
              className={`tap rounded-xl border px-3 text-sm font-medium ${
                template.id === selected
                  ? 'border-steel bg-steel-soft text-steel'
                  : 'border-rule bg-card text-ink-2'
              }`}
            >
              {template.label}
            </button>
          ))}
        </div>
      )}

      <label htmlFor="wa-text" className="mb-1 block text-sm font-medium text-ink-2">
        Message
      </label>
      <textarea
        id="wa-text"
        rows={6}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setCopied(false);
        }}
        className="mb-3 w-full rounded-xl border border-rule bg-card px-3 py-2 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
      />

      <div className="flex flex-wrap gap-2">
        <a
          href={waHref(mobile, text)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
        >
          Open WhatsApp
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
          className="tap inline-flex items-center rounded-xl border border-rule bg-card px-4 py-2 font-medium"
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
      </div>

      <p className="mt-3 text-xs text-ink-3">
        This opens WhatsApp with the message ready. Nothing is sent until you tap send there.
      </p>
    </Card>
  );
}
