/**
 * Generate plural and singular variants of an English word.
 * Returns alternate forms that might match an entity name.
 */
export function pluralVariants(text: string): string[] {
  const variants: string[] = [];
  const lower = text.toLowerCase();

  // Plural → singular
  if (lower.endsWith('ies')) {
    variants.push(text.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ves')) {
    variants.push(text.slice(0, -3) + 'f');
    variants.push(text.slice(0, -3) + 'fe');
  }
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('zes') ||
      lower.endsWith('ches') || lower.endsWith('shes')) {
    variants.push(text.slice(0, -2));
  }
  if (lower.endsWith('s') && !lower.endsWith('ss')) {
    variants.push(text.slice(0, -1));
  }

  // Singular → plural
  if (lower.endsWith('y') && !/[aeiou]y$/i.test(lower)) {
    variants.push(text.slice(0, -1) + 'ies');
  }
  if (lower.endsWith('f')) {
    variants.push(text.slice(0, -1) + 'ves');
  }
  if (lower.endsWith('fe')) {
    variants.push(text.slice(0, -2) + 'ves');
  }
  if (lower.endsWith('ch') || lower.endsWith('sh') || lower.endsWith('x') ||
      lower.endsWith('z') || lower.endsWith('s')) {
    variants.push(text + 'es');
  }
  if (!lower.endsWith('s')) {
    variants.push(text + 's');
  }

  return variants;
}
