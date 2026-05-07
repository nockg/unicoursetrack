import { beforeEach, describe, expect, test, vi } from 'vitest';

function installBrowserStubs() {
  const storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key) => storage.has(key) ? storage.get(key) : null),
    setItem: vi.fn((key, value) => storage.set(key, String(value))),
    removeItem: vi.fn((key) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  });

  const classList = {
    add: vi.fn(),
    remove: vi.fn(),
    toggle: vi.fn(),
    contains: vi.fn(() => false),
  };

  vi.stubGlobal('document', {
    readyState: 'loading',
    addEventListener: vi.fn(),
    getElementById: vi.fn(() => null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    createElement: vi.fn(() => ({
      className: '',
      dataset: {},
      style: {},
      classList,
      setAttribute: vi.fn(),
      addEventListener: vi.fn(),
      appendChild: vi.fn(),
    })),
    body: {
      classList,
      dataset: {},
      style: {
        setProperty: vi.fn(),
        removeProperty: vi.fn(),
      },
      appendChild: vi.fn(),
    },
  });

  vi.stubGlobal('window', {
    location: { origin: 'http://localhost' },
    addEventListener: vi.fn(),
    scrollTo: vi.fn(),
    saveCloudDebounced: vi.fn(),
  });
}

async function loadPolicyModules() {
  vi.resetModules();
  installBrowserStubs();
  const storeModule = await import('../../src/js/store.js');
  const policyModule = await import('../../src/js/degree-policy.js');
  return { store: storeModule.store, policy: policyModule };
}

function makeYear(id, label, modules, marks) {
  return {
    id,
    label,
    store: {
      modules,
      topics: {},
      coursework: marks,
      courseworkComponents: {},
      exams: {},
      finalGrades: {},
      majorModules: {},
      termOptions: [],
      notes: {},
      blackboard: {},
      formulas: {},
      relevantLinks: {},
      customLibraries: {},
      moduleColors: {},
      customExams: [],
      todos: [],
      archived: false,
    },
  };
}

function setBaseState(store, years) {
  store.state = {
    profile: { gradingSystem: 'uk', creditsTarget: 120 },
    years,
    ui: { currentYearId: Object.keys(years)[0], currentTermFilter: 'all' },
    setup: { templateChoiceMade: true },
  };
}

describe('degree policy', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  test('seeds first-run policies with useful equal weights', async () => {
    const { store, policy } = await loadPolicyModules();
    setBaseState(store, {
      year1: makeYear('year1', 'Year 1', [], {}),
      year2: makeYear('year2', 'Year 2', [], {}),
    });
    delete store.state.degreePolicy;

    const degreePolicy = policy.getDegreePolicy();

    expect(degreePolicy.presetId).toBe('equal');
    expect(degreePolicy.yearRules.year1.weight).toBe(50);
    expect(degreePolicy.yearRules.year2.weight).toBe(50);
  });

  test('auto output year follows academic label order instead of insertion order', async () => {
    const { store, policy } = await loadPolicyModules();
    setBaseState(store, {
      year3: makeYear('year3', 'Year 3', [], {}),
      year1: makeYear('year1', 'Year 1', [], {}),
      year2: makeYear('year2', 'Year 2', [], {}),
    });
    store.state.degreePolicy = {
      ...policy.getDefaultDegreePolicy(),
      yearRules: {
        year1: { ...policy.getDefaultYearRule(), weight: 33.33 },
        year2: { ...policy.getDefaultYearRule(), weight: 33.33 },
        year3: { ...policy.getDefaultYearRule(), weight: 33.33 },
      },
    };

    expect(policy.getDegreeOutputYear().id).toBe('year3');
  });

  test('forecast years live in degree policy, not real tracker years', async () => {
    const { store, policy } = await loadPolicyModules();
    setBaseState(store, {
      year1: makeYear('year1', 'Year 1', [], {}),
    });
    store.state.degreePolicy = {
      ...policy.getDefaultDegreePolicy(),
      forecastYears: {
        forecast1: { id: 'forecast1', label: 'Year 3', isForecast: true },
      },
      yearRules: {
        year1: { ...policy.getDefaultYearRule(), weight: 40 },
        forecast1: { ...policy.getDefaultYearRule(), status: 'manualConversion', weight: 60, convertedValue: 65 },
      },
    };

    expect(store.state.years.forecast1).toBeUndefined();
    expect(policy.getDegreeYears().forecast1).toBeTruthy();
    expect(policy.getDegreeOutputYear().id).toBe('forecast1');
  });

  test('confirmed prediction preserves omitted and missing context', async () => {
    const { store, policy } = await loadPolicyModules();
    setBaseState(store, {
      year1: makeYear(
        'year1',
        'Year 1',
        [{ credits: 60, cw: 100, exam: 0 }],
        { 0: 70 },
      ),
      year2: makeYear(
        'year2',
        'Year 2',
        [{ credits: 60, cw: 100, exam: 0 }],
        {},
      ),
    });
    store.state.degreePolicy = {
      ...policy.getDefaultDegreePolicy(),
      yearRules: {
        year1: { ...policy.getDefaultYearRule(), weight: 40 },
        year2: { ...policy.getDefaultYearRule(), weight: 60 },
      },
    };

    const confirmed = policy.calculateConfirmedPrediction();

    expect(confirmed.value).toBe(70);
    expect(confirmed.actualCredits).toBe(60);
    expect(confirmed.missingCredits).toBe(60);
    expect(confirmed.omittedYearCount).toBe(1);
    expect(confirmed.omittedWeight).toBe(60);
  });
});
