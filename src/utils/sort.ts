/**
 * Natural sort comparator for construction document IDs.
 * Handles mixed alphanumeric strings like "M1-01A", "E2.101", "23 09 00"
 */

export interface SortToken {
  type: 'alpha' | 'numeric';
  value: string | number;
}

/**
 * Tokenize a string into alternating alpha and numeric segments
 */
export function tokenize(str: string): SortToken[] {
  const tokens: SortToken[] = [];
  let current = '';
  let currentType: 'alpha' | 'numeric' | null = null;

  for (const char of str) {
    const isDigit = /\d/.test(char);
    const type: 'alpha' | 'numeric' = isDigit ? 'numeric' : 'alpha';

    if (currentType === null) {
      currentType = type;
      current = char;
    } else if (currentType === type) {
      current += char;
    } else {
      // Type changed, push current token and start new one
      tokens.push({
        type: currentType,
        value: currentType === 'numeric' ? parseInt(current, 10) : current,
      });
      currentType = type;
      current = char;
    }
  }

  if (current) {
    tokens.push({
      type: currentType!,
      value: currentType === 'numeric' ? parseInt(current, 10) : current,
    });
  }

  return tokens;
}

/**
 * Compare two strings using natural ordering:
 * - Numeric segments compared numerically
 * - Alpha segments compared lexicographically
 * - Numbers come before letters when comparing different types
 */
export function naturalCompare(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  const maxLen = Math.max(tokensA.length, tokensB.length);

  for (let i = 0; i < maxLen; i++) {
    const tokenA = tokensA[i];
    const tokenB = tokensB[i];

    if (tokenA === undefined) return -1;
    if (tokenB === undefined) return 1;

    // Different types: numeric < alpha
    if (tokenA.type !== tokenB.type) {
      return tokenA.type === 'numeric' ? -1 : 1;
    }

    // Same type: compare values
    if (tokenA.type === 'numeric') {
      const numA = tokenA.value as number;
      const numB = tokenB.value as number;
      if (numA !== numB) {
        return numA - numB;
      }
    } else {
      const strA = tokenA.value as string;
      const strB = tokenB.value as string;
      const cmp = strA.localeCompare(strB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }

  return 0;
}

/**
 * Sort an array of strings using natural ordering
 */
export function naturalSort(arr: string[]): string[] {
  return [...arr].sort(naturalCompare);
}
