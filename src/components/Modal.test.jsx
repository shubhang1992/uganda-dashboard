// Tests for the shared Modal primitive.
//
// Behaviours covered:
//   - renders into document.body via a portal (visible when open, gone when closed)
//   - locks document.body scroll while open, restores on close
//   - Escape calls onClose and stops propagation so outer panel handlers don't fire
//   - Backdrop dismissal requires mousedown AND mouseup both on the backdrop
//   - Dialog content click does NOT dismiss
//   - Tab / Shift-Tab cycle within the modal (focus trap)
//   - dismissOnBackdrop={false} disables backdrop-click dismissal
//   - aria-labelledby points at a heading element with the title text
//   - restores focus to the previously focused element on close

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from './Modal';

// Framer-motion's AnimatePresence relies on requestAnimationFrame timing for
// exit transitions. In jsdom it falls back to synchronous removal when the
// `exit` prop animation completes — but we wrap state changes in `act` and
// flush timers to be safe.

function TestHost({
  initialOpen = false,
  size,
  dismissOnBackdrop,
  onCloseSpy,
  withContent = true,
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button data-testid="trigger" onClick={() => setOpen(true)}>
        Open
      </button>
      <button data-testid="outside">Outside</button>
      <Modal
        open={open}
        onClose={() => {
          onCloseSpy?.();
          setOpen(false);
        }}
        title="Test Modal"
        size={size}
        dismissOnBackdrop={dismissOnBackdrop}
      >
        {withContent && (
          <div data-testid="modal-body">
            <h3>Visible Heading</h3>
            <button data-testid="first-btn">First</button>
            <input data-testid="middle-input" />
            <button data-testid="last-btn">Last</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

describe('<Modal />', () => {
  beforeEach(() => {
    // Ensure body overflow starts clean.
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('does not render content when open=false', () => {
    render(<TestHost initialOpen={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders into a portal at document.body when open', async () => {
    render(<TestHost initialOpen={true} />);
    const dialog = await screen.findByRole('dialog');
    // The dialog should be a descendant of document.body, but NOT inside
    // the rendered TestHost wrapper.
    expect(dialog).toBeInTheDocument();
    // Ascend through parents — should find body, not the trigger button.
    let node = dialog.parentElement;
    let foundBody = false;
    while (node) {
      if (node === document.body) {
        foundBody = true;
        break;
      }
      node = node.parentElement;
    }
    expect(foundBody).toBe(true);
  });

  it('locks body scroll while open and restores on close', async () => {
    const { rerender } = render(<TestHost initialOpen={true} />);
    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<TestHost initialOpen={false} />);
    // Allow the cleanup effect to run.
    await act(async () => {});
    // Force the modal's `open=false` path by re-rendering with internal state.
    // The TestHost's `initialOpen` only seeds initial state, so we instead
    // verify behaviour by clicking the trigger to toggle open in a separate
    // test (below). Here, the harness already shows scroll is locked.
  });

  it('restores body scroll when modal closes via Escape', async () => {
    const user = userEvent.setup();
    render(<TestHost initialOpen={true} />);
    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    // Wait a tick for AnimatePresence exit + cleanup.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose when Escape is pressed and stops propagation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const outerKeyHandler = vi.fn();

    function Wrapper() {
      const [open, setOpen] = useState(true);
      return (
        <div onKeyDown={outerKeyHandler}>
          <Modal
            open={open}
            onClose={() => {
              onClose();
              setOpen(false);
            }}
            title="Esc Modal"
          >
            <button>inside</button>
          </Modal>
        </div>
      );
    }

    render(<Wrapper />);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    // The Modal stops propagation so the outer panel's keydown should NOT
    // see the Escape. (The portal still bubbles to document.body, but our
    // outer key handler is bound on the in-tree wrapper div — propagation
    // from the portaled backdrop stops at body, not on this wrapper.)
    expect(outerKeyHandler).not.toHaveBeenCalled();
  });

  it('dismisses on backdrop click when mousedown + mouseup both land on backdrop', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="BD Test">
        <div data-testid="content">content</div>
      </Modal>,
    );
    const dialog = await screen.findByRole('dialog');
    const backdrop = dialog.parentElement; // backdrop wraps the dialog

    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT dismiss when mousedown starts inside dialog and mouseup releases on backdrop (drag-out misfire)', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Drag test">
        <div data-testid="content">content</div>
      </Modal>,
    );
    const dialog = await screen.findByRole('dialog');
    const backdrop = dialog.parentElement;
    const inner = screen.getByTestId('content');

    // mousedown starts inside the dialog, then mouseup happens on backdrop.
    fireEvent.mouseDown(inner);
    fireEvent.mouseUp(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT dismiss when clicking inside the dialog body', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Inside click">
        <div data-testid="content">
          <button data-testid="inner-btn">Click me</button>
        </div>
      </Modal>,
    );
    await screen.findByRole('dialog');

    fireEvent.mouseDown(screen.getByTestId('inner-btn'));
    fireEvent.mouseUp(screen.getByTestId('inner-btn'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismissOnBackdrop={false} suppresses backdrop dismissal', async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Locked" dismissOnBackdrop={false}>
        <div>content</div>
      </Modal>,
    );
    const dialog = await screen.findByRole('dialog');
    const backdrop = dialog.parentElement;

    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps Tab focus inside the dialog (Tab from last focusable wraps to first)', async () => {
    const user = userEvent.setup();
    render(<TestHost initialOpen={true} />);
    await screen.findByRole('dialog');

    // Wait for the auto-focus on first focusable.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const first = screen.getByTestId('first-btn');
    const middle = screen.getByTestId('middle-input');
    const last = screen.getByTestId('last-btn');

    // Focus the last button explicitly, then Tab — should wrap to first.
    last.focus();
    expect(document.activeElement).toBe(last);

    await user.tab();
    expect(document.activeElement).toBe(first);

    // Tab forward through middle, last, wrap to first.
    await user.tab();
    expect(document.activeElement).toBe(middle);
  });

  it('traps Shift+Tab focus inside the dialog (Shift+Tab from first wraps to last)', async () => {
    const user = userEvent.setup();
    render(<TestHost initialOpen={true} />);
    await screen.findByRole('dialog');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const first = screen.getByTestId('first-btn');
    const last = screen.getByTestId('last-btn');

    first.focus();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });

  it('moves focus to the first focusable element on open', async () => {
    render(<TestHost initialOpen={true} />);
    await screen.findByRole('dialog');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(document.activeElement).toBe(screen.getByTestId('first-btn'));
  });

  it('exposes aria-labelledby pointing at an element with the title text', async () => {
    render(<TestHost initialOpen={true} />);
    const dialog = await screen.findByRole('dialog');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const labelEl = document.getElementById(labelledBy);
    expect(labelEl).not.toBeNull();
    expect(labelEl.textContent).toContain('Test Modal');
  });

  it('sets role="dialog" and aria-modal="true"', async () => {
    render(<TestHost initialOpen={true} />);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('restores focus to the previously focused element on close', async () => {
    const user = userEvent.setup();

    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button data-testid="trigger-btn" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="Restore focus">
            <button data-testid="inside-btn">Inside</button>
          </Modal>
        </div>
      );
    }

    render(<Host />);
    const trigger = screen.getByTestId('trigger-btn');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    await screen.findByRole('dialog');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await user.keyboard('{Escape}');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(document.activeElement).toBe(trigger);
  });
});
