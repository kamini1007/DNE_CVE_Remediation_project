const pool = require('../src/db/pool');
const feedbackRepository = require('../src/repository/feedbackRepository');

jest.mock('../src/db/pool', () => ({ query: jest.fn() }));

afterEach(() => jest.clearAllMocks());

describe('submitFeedback validation', () => {
  it('rejects an unrecognized feedbackType before touching the database', async () => {
    await expect(
      feedbackRepository.submitFeedback({ cveId: 'CVE-2024-1', feedbackType: 'NOT_A_TYPE', rating: 3 })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects a rating outside 1-5', async () => {
    await expect(
      feedbackRepository.submitFeedback({ cveId: 'CVE-2024-1', feedbackType: 'RISK_ACCURACY', rating: 6 })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      feedbackRepository.submitFeedback({ cveId: 'CVE-2024-1', feedbackType: 'RISK_ACCURACY', rating: 0 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a non-integer rating', async () => {
    await expect(
      feedbackRepository.submitFeedback({ cveId: 'CVE-2024-1', feedbackType: 'RISK_ACCURACY', rating: 3.5 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('accepts a valid submission and inserts it', async () => {
    pool.query.mockResolvedValue({ rows: [{ id: 1, cve_id: 'CVE-2024-1', feedback_type: 'RISK_ACCURACY', rating: 4 }] });

    const result = await feedbackRepository.submitFeedback({
      cveId: 'CVE-2024-1',
      feedbackType: 'RISK_ACCURACY',
      rating: 4,
      comment: 'Looked accurate',
      submittedBy: 'analyst@example.com',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(result.rating).toBe(4);
  });
});
