import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Modal } from './Modal';

describe('Modal focus stability', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('does not reset input focus when the parent rerenders with a new onClose callback', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const render = (value: string) => act(() => root?.render(
      <Modal open title="Konto hinzufügen" onClose={() => undefined}>
        <input aria-label="Anzeigename" value={value} readOnly />
      </Modal>,
    ));

    render('a');
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Anzeigename"]')!;
    input.focus();
    expect(document.activeElement).toBe(input);

    render('ab');
    expect(document.activeElement).toBe(input);
  });
});
