export function showModal(backdrop: HTMLElement): void {
  backdrop.style.display = 'flex';
  backdrop.setAttribute('aria-hidden', 'false');
}

export function hideModal(backdrop: HTMLElement): void {
  backdrop.style.display = 'none';
  backdrop.setAttribute('aria-hidden', 'true');
}
