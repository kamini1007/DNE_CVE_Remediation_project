const { runWithConcurrency } = require('../src/services/concurrency');

describe('runWithConcurrency', () => {
  it('runs every item and preserves result order regardless of completion order', async () => {
    const delays = [30, 10, 20, 5];
    const worker = (item) => new Promise((resolve) => setTimeout(() => resolve(item * 2), delays[item]));

    const results = await runWithConcurrency([0, 1, 2, 3], 2, worker);
    expect(results).toEqual([0, 2, 4, 6]);
  });

  it('never runs more than `concurrency` workers at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const worker = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return true;
    };

    await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, worker);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it('handles an empty item list without error', async () => {
    const results = await runWithConcurrency([], 3, jest.fn());
    expect(results).toEqual([]);
  });

  it('handles concurrency higher than the item count', async () => {
    const worker = async (item) => item + 1;
    const results = await runWithConcurrency([1, 2], 10, worker);
    expect(results).toEqual([2, 3]);
  });

  it('propagates a worker rejection rather than swallowing it', async () => {
    const worker = async (item) => {
      if (item === 2) throw new Error('boom');
      return item;
    };
    await expect(runWithConcurrency([1, 2, 3], 2, worker)).rejects.toThrow('boom');
  });
});
