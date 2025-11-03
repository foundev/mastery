export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

export function requireTemplate(id: string): HTMLTemplateElement {
  const element = document.getElementById(id);
  if (!element || !(element instanceof HTMLTemplateElement)) {
    throw new Error(`Missing required template: ${id}`);
  }
  return element;
}
