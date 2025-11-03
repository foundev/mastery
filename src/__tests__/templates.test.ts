import { describe, expect, it } from 'vitest';
import { GOAL_TEMPLATES } from '../templates';

describe('goal templates', () => {
  it('has many templates defined', () => {
    expect(GOAL_TEMPLATES.length).toBeGreaterThan(20);
  });

  it('ensures template integrity', () => {
    const ids = new Set<string>();
    for (const template of GOAL_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z0-9-]+$/);
      expect(template.title.trim()).not.toHaveLength(0);
      expect(template.hours).toBeGreaterThan(0);
      expect(Array.isArray(template.keywords)).toBe(true);
      expect(template.keywords.length).toBeGreaterThan(0);
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
    }
  });
});
