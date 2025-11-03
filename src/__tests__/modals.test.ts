import { describe, expect, it } from 'vitest';
import { hideModal, showModal } from '../ui/modals';

describe('modal toggles', () => {
  it('shows and hides modal backdrop', () => {
    const backdrop = document.createElement('div');
    backdrop.style.display = 'none';
    backdrop.setAttribute('aria-hidden', 'true');

    showModal(backdrop);
    expect(backdrop.style.display).toBe('flex');
    expect(backdrop.getAttribute('aria-hidden')).toBe('false');

    hideModal(backdrop);
    expect(backdrop.style.display).toBe('none');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
  });
});
