import { describe, it, expect } from 'vitest';
import { isReadParamsCoveredBy, SeenFilesTracker } from './coverage';

// ---------------------------------------------------------------------------
// isReadParamsCoveredBy
// ---------------------------------------------------------------------------

describe('isReadParamsCoveredBy', () => {
  describe('preview mode', () => {
    it('preview covers preview', () => {
      expect(isReadParamsCoveredBy({ preview: true }, { preview: true })).toBe(
        true,
      );
    });

    it('preview does not cover full read', () => {
      expect(isReadParamsCoveredBy({}, { preview: true })).toBe(false);
    });

    it('full read does not cover preview', () => {
      expect(isReadParamsCoveredBy({ preview: true }, {})).toBe(false);
    });

    it('preview=false is treated as non-preview (same as omitted)', () => {
      expect(isReadParamsCoveredBy({ preview: false }, {})).toBe(true);
    });

    it('preview with line ranges — preview wins over range check', () => {
      // Both preview → always covered regardless of line ranges
      expect(
        isReadParamsCoveredBy(
          { preview: true, startLine: 5, endLine: 10 },
          { preview: true, startLine: 1, endLine: 3 },
        ),
      ).toBe(true);
    });

    it('preview request is not covered by non-preview with same ranges', () => {
      expect(
        isReadParamsCoveredBy(
          { preview: true, startLine: 1, endLine: 10 },
          { startLine: 1, endLine: 10 },
        ),
      ).toBe(false);
    });
  });

  describe('line ranges', () => {
    it('unbounded covers any bounded range', () => {
      expect(isReadParamsCoveredBy({ startLine: 10, endLine: 20 }, {})).toBe(
        true,
      );
    });

    it('bounded does not cover unbounded', () => {
      expect(isReadParamsCoveredBy({}, { startLine: 1, endLine: 100 })).toBe(
        false,
      );
    });

    it('exact same range is covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 5, endLine: 15 },
          { startLine: 5, endLine: 15 },
        ),
      ).toBe(true);
    });

    it('sub-range is covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 10, endLine: 20 },
          { startLine: 5, endLine: 30 },
        ),
      ).toBe(true);
    });

    it('overlapping but extending range is not covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 10, endLine: 30 },
          { startLine: 5, endLine: 20 },
        ),
      ).toBe(false);
    });

    it('completely disjoint range is not covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 50, endLine: 60 },
          { startLine: 1, endLine: 10 },
        ),
      ).toBe(false);
    });

    it('open-ended start (existing) covers request starting at 1', () => {
      expect(
        isReadParamsCoveredBy({ startLine: 1, endLine: 50 }, { endLine: 100 }),
      ).toBe(true);
    });

    it('open-ended end (existing) covers request ending late', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 10, endLine: 999 },
          { startLine: 5 },
        ),
      ).toBe(true);
    });

    it('half-open request (only startLine) not covered by bounded existing', () => {
      // Request: startLine=5, no endLine → goes to end of file
      // Existing: startLine=1, endLine=100 → bounded
      expect(
        isReadParamsCoveredBy({ startLine: 5 }, { startLine: 1, endLine: 100 }),
      ).toBe(false);
    });

    it('half-open request (only endLine) not covered by bounded existing', () => {
      // Request: no startLine, endLine=50 → from beginning to line 50
      // Existing: startLine=10, endLine=100 → starts later
      expect(
        isReadParamsCoveredBy({ endLine: 50 }, { startLine: 10, endLine: 100 }),
      ).toBe(false);
    });

    it('half-open request (only endLine) covered by open-start existing', () => {
      expect(isReadParamsCoveredBy({ endLine: 50 }, { endLine: 100 })).toBe(
        true,
      );
    });

    it('request at line 1 is covered by unbounded existing', () => {
      expect(isReadParamsCoveredBy({ startLine: 1, endLine: 1 }, {})).toBe(
        true,
      );
    });

    it('single-line range is covered when within existing range', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 15, endLine: 15 },
          { startLine: 10, endLine: 20 },
        ),
      ).toBe(true);
    });

    it('single-line range is not covered when outside existing range', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 25, endLine: 25 },
          { startLine: 10, endLine: 20 },
        ),
      ).toBe(false);
    });

    it('adjacent but non-overlapping ranges are not covered', () => {
      // Existing: [1, 10], Request: [11, 20] — adjacent but not overlapping
      expect(
        isReadParamsCoveredBy(
          { startLine: 11, endLine: 20 },
          { startLine: 1, endLine: 10 },
        ),
      ).toBe(false);
    });

    it('existing range touching request boundary still covers', () => {
      // Existing: [1, 20], Request: [20, 20] — boundary line included
      expect(
        isReadParamsCoveredBy(
          { startLine: 20, endLine: 20 },
          { startLine: 1, endLine: 20 },
        ),
      ).toBe(true);
    });
  });

  describe('page ranges', () => {
    it('unbounded covers any page range', () => {
      expect(isReadParamsCoveredBy({ startPage: 2, endPage: 5 }, {})).toBe(
        true,
      );
    });

    it('sub-page-range is covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startPage: 3, endPage: 4 },
          { startPage: 1, endPage: 10 },
        ),
      ).toBe(true);
    });

    it('extending page range is not covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startPage: 5, endPage: 9 },
          { startPage: 1, endPage: 3 },
        ),
      ).toBe(false);
    });

    it('exact same page range is covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startPage: 2, endPage: 5 },
          { startPage: 2, endPage: 5 },
        ),
      ).toBe(true);
    });

    it('disjoint page ranges are not covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startPage: 10, endPage: 15 },
          { startPage: 1, endPage: 5 },
        ),
      ).toBe(false);
    });

    it('bounded pages do not cover unbounded page request', () => {
      expect(isReadParamsCoveredBy({}, { startPage: 1, endPage: 10 })).toBe(
        false,
      );
    });

    it('half-open page (only startPage) covered by unbounded', () => {
      expect(isReadParamsCoveredBy({ startPage: 3 }, {})).toBe(true);
    });
  });

  describe('mixed line + page ranges', () => {
    it('both axes must be covered', () => {
      // Lines covered, pages not
      expect(
        isReadParamsCoveredBy(
          { startLine: 1, endLine: 10, startPage: 5, endPage: 9 },
          { startPage: 1, endPage: 3 },
        ),
      ).toBe(false);
    });

    it('both axes covered → true', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 5, endLine: 10, startPage: 2, endPage: 3 },
          { startLine: 1, endLine: 20, startPage: 1, endPage: 5 },
        ),
      ).toBe(true);
    });

    it('pages covered but lines not → not covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 50, endLine: 60, startPage: 2, endPage: 3 },
          { startLine: 1, endLine: 10, startPage: 1, endPage: 5 },
        ),
      ).toBe(false);
    });

    it('lines unbounded, pages bounded and covered → covered', () => {
      expect(
        isReadParamsCoveredBy(
          { startPage: 2, endPage: 3 },
          { startPage: 1, endPage: 5 },
        ),
      ).toBe(true);
    });

    it('all three axes: line + page + depth must all be covered', () => {
      // All covered
      expect(
        isReadParamsCoveredBy(
          { startLine: 5, endLine: 10, startPage: 2, endPage: 3, depth: 1 },
          { startLine: 1, endLine: 20, startPage: 1, endPage: 5, depth: 3 },
        ),
      ).toBe(true);

      // Depth not covered → fails
      expect(
        isReadParamsCoveredBy(
          { startLine: 5, endLine: 10, startPage: 2, endPage: 3, depth: 5 },
          { startLine: 1, endLine: 20, startPage: 1, endPage: 5, depth: 3 },
        ),
      ).toBe(false);
    });
  });

  describe('depth', () => {
    it('default depth covers any specific depth', () => {
      expect(isReadParamsCoveredBy({ depth: 3 }, {})).toBe(true);
    });

    it('specific depth does not cover default depth', () => {
      expect(isReadParamsCoveredBy({}, { depth: 3 })).toBe(false);
    });

    it('deeper existing covers shallower request', () => {
      expect(isReadParamsCoveredBy({ depth: 2 }, { depth: 4 })).toBe(true);
    });

    it('equal depth is covered', () => {
      expect(isReadParamsCoveredBy({ depth: 3 }, { depth: 3 })).toBe(true);
    });

    it('shallower existing does not cover deeper request', () => {
      expect(isReadParamsCoveredBy({ depth: 5 }, { depth: 2 })).toBe(false);
    });

    it('default vs default is covered', () => {
      expect(isReadParamsCoveredBy({}, {})).toBe(true);
    });

    it('depth + line range must both be covered', () => {
      // Lines covered but depth not → not covered
      expect(
        isReadParamsCoveredBy(
          { startLine: 1, endLine: 10, depth: 5 },
          { depth: 2 },
        ),
      ).toBe(false);
      // Both covered → covered
      expect(
        isReadParamsCoveredBy(
          { startLine: 1, endLine: 10, depth: 2 },
          { depth: 4 },
        ),
      ).toBe(true);
    });

    it('depth 0 covers depth 0', () => {
      expect(isReadParamsCoveredBy({ depth: 0 }, { depth: 0 })).toBe(true);
    });

    it('depth 0 is covered by any positive depth', () => {
      expect(isReadParamsCoveredBy({ depth: 0 }, { depth: 1 })).toBe(true);
    });

    it('positive depth is not covered by depth 0', () => {
      expect(isReadParamsCoveredBy({ depth: 1 }, { depth: 0 })).toBe(false);
    });
  });

  describe('empty params (full read)', () => {
    it('empty covers empty (identical full reads)', () => {
      expect(isReadParamsCoveredBy({}, {})).toBe(true);
    });

    it('empty covers any bounded line range', () => {
      expect(isReadParamsCoveredBy({ startLine: 1, endLine: 50 }, {})).toBe(
        true,
      );
    });

    it('empty covers any bounded page range', () => {
      expect(isReadParamsCoveredBy({ startPage: 1, endPage: 5 }, {})).toBe(
        true,
      );
    });

    it('empty covers any specific depth', () => {
      expect(isReadParamsCoveredBy({ depth: 10 }, {})).toBe(true);
    });

    it('empty covers combined bounded request', () => {
      expect(
        isReadParamsCoveredBy(
          { startLine: 5, endLine: 10, startPage: 2, endPage: 3, depth: 2 },
          {},
        ),
      ).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// SeenFilesTracker
// ---------------------------------------------------------------------------

describe('SeenFilesTracker', () => {
  it('first encounter is never covered', () => {
    const tracker = new SeenFilesTracker();
    expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(false);
  });

  it('identical params on same path+hash → covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {});
    expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(true);
  });

  it('different hash → not covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {});
    expect(tracker.isCovered('w1/a.ts', 'h2', {})).toBe(false);
  });

  it('preview after full → not covered (different representation)', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {});
    expect(tracker.isCovered('w1/a.ts', 'h1', { preview: true })).toBe(false);
  });

  it('full after preview → not covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', { preview: true });
    expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(false);
  });

  it('sub-range after full → covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {});
    expect(
      tracker.isCovered('w1/a.ts', 'h1', {
        startLine: 10,
        endLine: 20,
      }),
    ).toBe(true);
  });

  it('extending range after partial → not covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {
      startLine: 1,
      endLine: 20,
    });
    expect(
      tracker.isCovered('w1/a.ts', 'h1', {
        startLine: 15,
        endLine: 40,
      }),
    ).toBe(false);
  });

  it('sub-range covered by one of multiple entries → covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {
      startLine: 1,
      endLine: 20,
    });
    tracker.record('w1/a.ts', 'h1', {
      startLine: 15,
      endLine: 40,
    });
    // Lines 10-18 covered by the first entry
    expect(
      tracker.isCovered('w1/a.ts', 'h1', {
        startLine: 10,
        endLine: 18,
      }),
    ).toBe(true);
  });

  it('different paths do not interfere', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/a.ts', 'h1', {});
    expect(tracker.isCovered('w1/b.ts', 'h1', {})).toBe(false);
  });

  it('pages: sub-range after full → covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/doc.pdf', 'h1', {
      startPage: 1,
      endPage: 10,
    });
    expect(
      tracker.isCovered('w1/doc.pdf', 'h1', {
        startPage: 2,
        endPage: 5,
      }),
    ).toBe(true);
  });

  it('pages: extending range → not covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/doc.pdf', 'h1', {
      startPage: 1,
      endPage: 3,
    });
    expect(
      tracker.isCovered('w1/doc.pdf', 'h1', {
        startPage: 5,
        endPage: 9,
      }),
    ).toBe(false);
  });

  it('depth: deeper request after shallow record → not covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/src', 'h1', { depth: 1 });
    expect(tracker.isCovered('w1/src', 'h1', { depth: 3 })).toBe(false);
  });

  it('depth: shallower request after deep record → covered', () => {
    const tracker = new SeenFilesTracker();
    tracker.record('w1/src', 'h1', { depth: 5 });
    expect(tracker.isCovered('w1/src', 'h1', { depth: 2 })).toBe(true);
  });

  it('truncation: effective params narrower than request → future range not falsely covered', () => {
    const tracker = new SeenFilesTracker();
    // Requested full file, but transformer truncated at line 300
    tracker.record('w1/big.ts', 'h1', {
      startLine: 1,
      endLine: 300,
    });
    // Lines 400-450 should NOT be covered
    expect(
      tracker.isCovered('w1/big.ts', 'h1', {
        startLine: 400,
        endLine: 450,
      }),
    ).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Two-phase flow simulation (isCovered → transform → record)
  // -----------------------------------------------------------------------

  describe('two-phase flow (isCovered + record)', () => {
    it('typical flow: check, transform, record, then duplicate is covered', () => {
      const tracker = new SeenFilesTracker();
      const params = { startLine: 1, endLine: 50 };

      // Phase 1: check → not covered
      expect(tracker.isCovered('w1/a.ts', 'h1', params)).toBe(false);

      // Phase 2: transform ran, record effective params
      tracker.record('w1/a.ts', 'h1', params);

      // Phase 3: same request again → now covered
      expect(tracker.isCovered('w1/a.ts', 'h1', params)).toBe(true);
    });

    it('flow with truncation: record narrower than request', () => {
      const tracker = new SeenFilesTracker();

      // Agent requests full file
      expect(tracker.isCovered('w1/big.ts', 'h1', {})).toBe(false);

      // Transformer truncated at line 200
      tracker.record('w1/big.ts', 'h1', { startLine: 1, endLine: 200 });

      // Full file request again → NOT covered (only lines 1-200 recorded)
      expect(tracker.isCovered('w1/big.ts', 'h1', {})).toBe(false);

      // But lines 50-100 → covered (sub-range of what was recorded)
      expect(
        tracker.isCovered('w1/big.ts', 'h1', { startLine: 50, endLine: 100 }),
      ).toBe(true);

      // Lines 150-250 → NOT covered (extends beyond recorded)
      expect(
        tracker.isCovered('w1/big.ts', 'h1', { startLine: 150, endLine: 250 }),
      ).toBe(false);
    });

    it('preview then full: both need separate injection', () => {
      const tracker = new SeenFilesTracker();

      // First: preview
      expect(tracker.isCovered('w1/a.ts', 'h1', { preview: true })).toBe(false);
      tracker.record('w1/a.ts', 'h1', { preview: true });

      // Second: full read — different representation, not covered
      expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(false);
      tracker.record('w1/a.ts', 'h1', {});

      // Now both are covered
      expect(tracker.isCovered('w1/a.ts', 'h1', { preview: true })).toBe(true);
      expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(true);
    });

    it('incremental line ranges: each new range is recorded independently', () => {
      const tracker = new SeenFilesTracker();

      // First read: lines 1-50
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 50 });

      // Request lines 30-40 → covered by first entry
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 30, endLine: 40 }),
      ).toBe(true);

      // Request lines 40-70 → NOT covered (extends beyond 50)
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 40, endLine: 70 }),
      ).toBe(false);

      // Record lines 40-100
      tracker.record('w1/a.ts', 'h1', { startLine: 40, endLine: 100 });

      // Now lines 40-70 → covered by second entry
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 40, endLine: 70 }),
      ).toBe(true);

      // Lines 1-100 → now covered by merged union of [1,50] ∪ [40,100] = [1,100].
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 1, endLine: 100 }),
      ).toBe(true);

      // Lines 1-101 → NOT covered (extends past recorded range).
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 1, endLine: 101 }),
      ).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-entry coverage (no merging — each entry checked independently)
  // -----------------------------------------------------------------------

  describe('multi-entry coverage (with range merging)', () => {
    it('two non-overlapping entries with a gap do not cover the gap', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 20 });
      tracker.record('w1/a.ts', 'h1', { startLine: 50, endLine: 80 });

      // Request that spans the gap → not covered even after merging
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 1, endLine: 80 }),
      ).toBe(false);

      // But each individual sub-range is covered
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 5, endLine: 15 }),
      ).toBe(true);
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 55, endLine: 70 }),
      ).toBe(true);
    });

    it('two contiguous entries cover a request spanning their boundary', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { startLine: 500, endLine: 999 });
      tracker.record('w1/a.ts', 'h1', { startLine: 1000, endLine: 1499 });

      // Spans the boundary — covered by merged union.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 700, endLine: 1100 }),
      ).toBe(true);

      // Fully within first entry.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 500, endLine: 999 }),
      ).toBe(true);

      // Fully within second entry.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 1000, endLine: 1499 }),
      ).toBe(true);

      // Beyond both entries.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 700, endLine: 1500 }),
      ).toBe(false);
    });

    it('two overlapping entries cover a request within their union', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 60 });
      tracker.record('w1/a.ts', 'h1', { startLine: 40, endLine: 100 });

      // Spans the overlap — covered by merged [1, 100].
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 30, endLine: 80 }),
      ).toBe(true);

      // Full union.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 1, endLine: 100 }),
      ).toBe(true);
    });

    it('three entries with gaps: merge covers contiguous pairs only', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 10 });
      tracker.record('w1/a.ts', 'h1', { startLine: 20, endLine: 30 });
      tracker.record('w1/a.ts', 'h1', { startLine: 50, endLine: 100 });

      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 60, endLine: 90 }),
      ).toBe(true); // covered by third entry

      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 25, endLine: 28 }),
      ).toBe(true); // covered by second entry

      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 15, endLine: 25 }),
      ).toBe(false); // spans gap between first and second
    });

    it('many contiguous entries cover the full union', () => {
      const tracker = new SeenFilesTracker();
      // Simulate reading a large file in 500-line chunks.
      for (let i = 0; i < 10; i++) {
        tracker.record('w1/a.ts', 'h1', {
          startLine: i * 500 + 1,
          endLine: (i + 1) * 500,
        });
      }

      // Request spanning multiple chunks.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', {
          startLine: 250,
          endLine: 3700,
        }),
      ).toBe(true);

      // Beyond the recorded range.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', {
          startLine: 4500,
          endLine: 5500,
        }),
      ).toBe(false);
    });

    it('preview entry + full entry: both are independently available', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { preview: true });
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 50 });

      expect(tracker.isCovered('w1/a.ts', 'h1', { preview: true })).toBe(true);
      expect(
        tracker.isCovered('w1/a.ts', 'h1', { startLine: 10, endLine: 30 }),
      ).toBe(true);
      // Unbounded still not covered (bounded entry only goes to 50)
      expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(false);
    });

    it('merged coverage respects page axis — incompatible pages are excluded', () => {
      const tracker = new SeenFilesTracker();
      // Two contiguous line ranges but with different page constraints.
      tracker.record('w1/a.ts', 'h1', {
        startLine: 1,
        endLine: 50,
        startPage: 1,
        endPage: 2,
      });
      tracker.record('w1/a.ts', 'h1', {
        startLine: 51,
        endLine: 100,
        startPage: 3,
        endPage: 4,
      });

      // Request with page range covered by first entry only → line merge
      // excludes second entry, so lines 51-100 aren't included.
      expect(
        tracker.isCovered('w1/a.ts', 'h1', {
          startLine: 25,
          endLine: 75,
          startPage: 1,
          endPage: 2,
        }),
      ).toBe(false);
    });

    it('unbounded line-range request is not satisfied by merged bounded entries', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', { startLine: 1, endLine: 500 });
      tracker.record('w1/a.ts', 'h1', { startLine: 501, endLine: 1000 });

      // Full-file request (no bounds) — cannot be satisfied by bounded entries.
      expect(tracker.isCovered('w1/a.ts', 'h1', {})).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Hash change scenarios
  // -----------------------------------------------------------------------

  describe('hash changes (file modifications)', () => {
    it('same path, new hash after file edit → not covered', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'hash-v1', {});

      // File was edited, hash changed
      expect(tracker.isCovered('w1/a.ts', 'hash-v2', {})).toBe(false);
    });

    it('recording new hash does not invalidate old hash coverage', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'hash-v1', {});
      tracker.record('w1/a.ts', 'hash-v2', {});

      // Both versions are independently tracked
      expect(tracker.isCovered('w1/a.ts', 'hash-v1', {})).toBe(true);
      expect(tracker.isCovered('w1/a.ts', 'hash-v2', {})).toBe(true);
    });

    it('sub-range of old hash still covered after new hash recorded', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'hash-v1', {});
      tracker.record('w1/a.ts', 'hash-v2', { startLine: 1, endLine: 50 });

      // Old version: full coverage
      expect(
        tracker.isCovered('w1/a.ts', 'hash-v1', { startLine: 10, endLine: 20 }),
      ).toBe(true);

      // New version: only partial coverage
      expect(
        tracker.isCovered('w1/a.ts', 'hash-v2', { startLine: 60, endLine: 70 }),
      ).toBe(false);
    });

    it('preview of changed file needs re-injection', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'hash-v1', { preview: true });

      // Same path, different hash → not covered even for preview
      expect(tracker.isCovered('w1/a.ts', 'hash-v2', { preview: true })).toBe(
        false,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Multiple independent files
  // -----------------------------------------------------------------------

  describe('independent file tracking', () => {
    it('different files with same hash are tracked independently', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'same-hash', {});

      // Different path, same hash → not covered
      expect(tracker.isCovered('w1/b.ts', 'same-hash', {})).toBe(false);
    });

    it('different mount prefixes are tracked independently', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/a.ts', 'h1', {});

      // Same relative path, different mount
      expect(tracker.isCovered('w2/a.ts', 'h1', {})).toBe(false);
    });

    it('att/ paths are tracked independently from workspace paths', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('att/abc123', 'h1', {});

      expect(tracker.isCovered('w1/abc123', 'h1', {})).toBe(false);
      expect(tracker.isCovered('att/abc123', 'h1', {})).toBe(true);
    });

    it('many files tracked simultaneously without interference', () => {
      const tracker = new SeenFilesTracker();
      const files = [
        { path: 'w1/a.ts', hash: 'h1' },
        { path: 'w1/b.ts', hash: 'h2' },
        { path: 'w1/c.ts', hash: 'h3' },
        { path: 'w2/a.ts', hash: 'h4' },
        { path: 'att/img.png', hash: 'h5' },
      ];

      for (const f of files) {
        tracker.record(f.path, f.hash, {});
      }

      // All should be covered
      for (const f of files) {
        expect(tracker.isCovered(f.path, f.hash, {})).toBe(true);
      }

      // None should be covered with wrong hash
      for (const f of files) {
        expect(tracker.isCovered(f.path, 'wrong-hash', {})).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Complex depth scenarios
  // -----------------------------------------------------------------------

  describe('depth coverage edge cases', () => {
    it('default depth recorded → any specific depth covered', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/src', 'h1', {}); // depth: undefined (default)

      expect(tracker.isCovered('w1/src', 'h1', { depth: 0 })).toBe(true);
      expect(tracker.isCovered('w1/src', 'h1', { depth: 1 })).toBe(true);
      expect(tracker.isCovered('w1/src', 'h1', { depth: 10 })).toBe(true);
      expect(tracker.isCovered('w1/src', 'h1', { depth: 100 })).toBe(true);
    });

    it('specific depth recorded → default depth request not covered', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/src', 'h1', { depth: 5 });

      // Default could be larger than 5
      expect(tracker.isCovered('w1/src', 'h1', {})).toBe(false);
    });

    it('depth with page range: both must be covered', () => {
      const tracker = new SeenFilesTracker();
      tracker.record('w1/archive.zip', 'h1', {
        startPage: 1,
        endPage: 5,
        depth: 3,
      });

      // Pages covered, depth covered → covered
      expect(
        tracker.isCovered('w1/archive.zip', 'h1', {
          startPage: 2,
          endPage: 4,
          depth: 2,
        }),
      ).toBe(true);

      // Pages covered, depth NOT covered → not covered
      expect(
        tracker.isCovered('w1/archive.zip', 'h1', {
          startPage: 2,
          endPage: 4,
          depth: 5,
        }),
      ).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Realistic conversation-like scenarios
  // -----------------------------------------------------------------------

  describe('realistic conversation scenarios', () => {
    it('scenario: user mentions file (preview) → agent reads full → agent reads sub-range', () => {
      const tracker = new SeenFilesTracker();

      // Step 1: User mentions file → preview injected
      expect(tracker.isCovered('w1/app.tsx', 'h1', { preview: true })).toBe(
        false,
      );
      tracker.record('w1/app.tsx', 'h1', { preview: true });

      // Step 2: Agent calls readFile (full) → not covered by preview
      expect(tracker.isCovered('w1/app.tsx', 'h1', {})).toBe(false);
      tracker.record('w1/app.tsx', 'h1', {});

      // Step 3: Agent calls readFile with line range → covered by full read
      expect(
        tracker.isCovered('w1/app.tsx', 'h1', { startLine: 50, endLine: 80 }),
      ).toBe(true);
      // No need to record again
    });

    it('scenario: user mentions file → file changes → user mentions again', () => {
      const tracker = new SeenFilesTracker();

      // Message 1: user mentions file
      tracker.record('w1/api.ts', 'hash-before-edit', { preview: true });

      // Message 2: agent edits the file (hash changes)
      // Message 3: user mentions same file again with new hash
      expect(
        tracker.isCovered('w1/api.ts', 'hash-after-edit', { preview: true }),
      ).toBe(false); // new hash → must re-inject
      tracker.record('w1/api.ts', 'hash-after-edit', { preview: true });
    });

    it('scenario: agent reads directory shallow then deep', () => {
      const tracker = new SeenFilesTracker();

      // First read: shallow (depth 1)
      tracker.record('w1/src', 'h1', { depth: 1 });

      // Second read: deeper (depth 3) → not covered
      expect(tracker.isCovered('w1/src', 'h1', { depth: 3 })).toBe(false);
      tracker.record('w1/src', 'h1', { depth: 3 });

      // Third read: shallow again (depth 1) → now covered by depth-3 entry
      expect(tracker.isCovered('w1/src', 'h1', { depth: 1 })).toBe(true);
    });

    it('scenario: agent reads PDF pages incrementally', () => {
      const tracker = new SeenFilesTracker();

      // Read pages 1-3
      tracker.record('w1/doc.pdf', 'h1', { startPage: 1, endPage: 3 });

      // Request page 2 → covered
      expect(
        tracker.isCovered('w1/doc.pdf', 'h1', { startPage: 2, endPage: 2 }),
      ).toBe(true);

      // Request pages 4-6 → not covered (different pages)
      expect(
        tracker.isCovered('w1/doc.pdf', 'h1', { startPage: 4, endPage: 6 }),
      ).toBe(false);
      tracker.record('w1/doc.pdf', 'h1', { startPage: 4, endPage: 6 });

      // Request pages 1-6 → NOT covered (no single entry covers full range)
      expect(
        tracker.isCovered('w1/doc.pdf', 'h1', { startPage: 1, endPage: 6 }),
      ).toBe(false);

      // But pages 5-6 → covered by second entry
      expect(
        tracker.isCovered('w1/doc.pdf', 'h1', { startPage: 5, endPage: 6 }),
      ).toBe(true);
    });

    it('scenario: multiple files in a single message, then same files again', () => {
      const tracker = new SeenFilesTracker();

      // Message 1: two files
      tracker.record('w1/a.ts', 'ha', { preview: true });
      tracker.record('w1/b.ts', 'hb', { preview: true });

      // Message 2: same two files, same hashes → both covered
      expect(tracker.isCovered('w1/a.ts', 'ha', { preview: true })).toBe(true);
      expect(tracker.isCovered('w1/b.ts', 'hb', { preview: true })).toBe(true);
    });

    it('scenario: large file truncated, then remainder requested', () => {
      const tracker = new SeenFilesTracker();

      // Full read requested, transformer truncated at line 300
      tracker.record('w1/huge.ts', 'h1', { startLine: 1, endLine: 300 });

      // Lines 200-250 → covered (within truncated range)
      expect(
        tracker.isCovered('w1/huge.ts', 'h1', { startLine: 200, endLine: 250 }),
      ).toBe(true);

      // Lines 280-350 → NOT covered (extends past truncation)
      expect(
        tracker.isCovered('w1/huge.ts', 'h1', { startLine: 280, endLine: 350 }),
      ).toBe(false);

      // Agent reads the remainder
      tracker.record('w1/huge.ts', 'h1', { startLine: 301, endLine: 500 });

      // Lines 400-450 → now covered
      expect(
        tracker.isCovered('w1/huge.ts', 'h1', { startLine: 400, endLine: 450 }),
      ).toBe(true);

      // Lines 1-500 → now covered by merged contiguous entries
      expect(
        tracker.isCovered('w1/huge.ts', 'h1', { startLine: 1, endLine: 500 }),
      ).toBe(true);

      // Lines 1-501 → NOT covered (extends past recorded range)
      expect(
        tracker.isCovered('w1/huge.ts', 'h1', { startLine: 1, endLine: 501 }),
      ).toBe(false);
    });
  });
});
