export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  text: string;
}

/**
 * Line-based diff using a longest-common-subsequence algorithm.
 * Returns an ordered list of context / add / remove entries.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const n = oldLines.length;
  const m = newLines.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'context', text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', text: oldLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

export interface ChangeRange {
  from: number;
  to: number;
}

/**
 * Given a line diff and the new text, compute character-offset ranges
 * in the new document for every added/modified line.
 */
export function diffToChangeRanges(diff: DiffLine[], newText: string): ChangeRange[] {
  const ranges: ChangeRange[] = [];
  const newLines = newText.split('\n');
  let newLineIdx = 0;
  let charOffset = 0;

  for (const entry of diff) {
    if (entry.type === 'remove') continue;

    const lineLen = newLines[newLineIdx]?.length ?? 0;

    if (entry.type === 'add') {
      ranges.push({ from: charOffset, to: charOffset + lineLen });
    }

    charOffset += lineLen + 1;
    newLineIdx++;
  }

  return ranges;
}
