const ORIGINAL_ENV = process.env;

function freshCalibrationService(envOverrides) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...envOverrides };
  return {
    calibrationService: require('../src/services/calibrationService'),
    calibrationRepository: require('../src/repository/calibrationRepository'),
  };
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

const defaultThresholds = {
  CALIBRATION_MIN_SAMPLE_SIZE: '5',
  CALIBRATION_RATING_THRESHOLD: '3.0',
  CALIBRATION_SLA_THRESHOLD: '0.7',
};

describe('generateReport - risk level recommendations', () => {
  it('flags a risk level with poor feedback rating above the sample size threshold', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'CRITICAL', feedbackCount: 10, avgRating: 2.1, resolvedCount: 0, slaMetRate: null },
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([]);
    const saveSpy = jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();

    expect(saveSpy).toHaveBeenCalled();
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0].message).toContain('CRITICAL');
    expect(report.recommendations[0].message).toContain('2.1/5');
  });

  it('does NOT flag a poor rating when the sample size is below the threshold', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'HIGH', feedbackCount: 2, avgRating: 1.5, resolvedCount: 0, slaMetRate: null }, // below minSampleSize=5
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([]);
    jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();
    expect(report.recommendations).toHaveLength(0);
  });

  it('does NOT flag a risk level whose rating is at or above the threshold', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'MEDIUM', feedbackCount: 20, avgRating: 4.2, resolvedCount: 0, slaMetRate: null },
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([]);
    jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();
    expect(report.recommendations).toHaveLength(0);
  });

  it('flags a risk level with a poor SLA-met rate independently of feedback rating', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'CRITICAL', feedbackCount: 0, avgRating: null, resolvedCount: 10, slaMetRate: 0.4 },
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([]);
    jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0].message).toContain('40%');
    expect(report.recommendations[0].message).toContain('SLA');
  });

  it('respects custom thresholds from config', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService({
      CALIBRATION_MIN_SAMPLE_SIZE: '5',
      CALIBRATION_RATING_THRESHOLD: '4.5', // stricter - even a 4.0 average now gets flagged
      CALIBRATION_SLA_THRESHOLD: '0.7',
    });

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'LOW', feedbackCount: 10, avgRating: 4.0, resolvedCount: 0, slaMetRate: null },
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([]);
    jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();
    expect(report.recommendations).toHaveLength(1);
  });
});

describe('generateReport - prompt version recommendations', () => {
  it('flags a poorly-rated prompt version and references how to act on it', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([
      { promptVersion: 'v1', feedbackCount: 8, avgRating: 2.5 },
    ]);
    jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    const report = await calibrationService.generateReport();
    expect(report.recommendations).toHaveLength(1);
    expect(report.recommendations[0].message).toContain('v1');
    expect(report.recommendations[0].message).toContain('PROMPT_VERSION');
  });
});

describe('generateReport - never auto-applies anything', () => {
  it('only ever calls saveReport, never touches risk-engine or ai-analysis-service state', async () => {
    const { calibrationService, calibrationRepository } = freshCalibrationService(defaultThresholds);

    jest.spyOn(calibrationRepository, 'getRiskLevelStats').mockResolvedValue([
      { level: 'CRITICAL', feedbackCount: 10, avgRating: 1.0, resolvedCount: 10, slaMetRate: 0.1 },
    ]);
    jest.spyOn(calibrationRepository, 'getPromptVersionStats').mockResolvedValue([
      { promptVersion: 'v1', feedbackCount: 10, avgRating: 1.0 },
    ]);
    const saveSpy = jest.spyOn(calibrationRepository, 'saveReport').mockImplementation(async (r) => r);

    await calibrationService.generateReport();

    // The only repository write is saveReport - every recommendation is
    // plain text for a human, not a mutation to any scoring config.
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const [savedArgs] = saveSpy.mock.calls[0];
    expect(typeof savedArgs.recommendations[0].message).toBe('string');
  });
});
