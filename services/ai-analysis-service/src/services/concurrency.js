/**
 * Minimal promise-pool concurrency limiter - runs `items` through `worker`
 * with at most `concurrency` in flight at once, preserving result order.
 * Kept dependency-free since recent p-limit majors are ESM-only, which would
 * complicate this plain CommonJS service.
 */
async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runNext() {
    const current = nextIndex++;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    await runNext();
  }

  const workerCount = Math.min(Math.max(concurrency, 1), items.length) || 0;
  const workers = Array.from({ length: workerCount }, () => runNext());
  await Promise.all(workers);
  return results;
}

module.exports = { runWithConcurrency };
