/**
 * Message template engine.
 * Replaces placeholders like {location}, {time}, {date} with actual values.
 */

export interface TemplateVars {
  location: string;
  time?: string;
  date?: string;
  [key: string]: string | undefined;
}

/**
 * Default message template used when none is specified per-location.
 */
export const DEFAULT_TEMPLATE = 'Reached {location} at {time}.';

/**
 * Renders a message template by replacing {placeholder} tokens with values.
 */
export function renderTemplate(
  template: string,
  vars: TemplateVars
): string {
  const now = new Date();

  const defaults: Record<string, string> = {
    location: vars.location,
    time: vars.time || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    date: vars.date || now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
  };

  // Merge provided vars over defaults
  const merged = { ...defaults, ...vars };

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return merged[key] !== undefined ? merged[key] : match;
  });
}
