// Web Worker for Proof-of-Work Hashcash solving
// Offloads SHA-256 hash search from the UI main thread

function countLeadingZeroBits(bytes: Uint8Array): number {
  let zeros = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0) {
      zeros += 8;
    } else {
      zeros += (Math.clz32(byte) - 24);
      break;
    }
  }
  return zeros;
}

self.onmessage = async (e: MessageEvent) => {
  const { nonce, difficultyBits } = e.data;
  const startTime = performance.now();
  const encoder = new TextEncoder();

  let iteration = 0;
  const maxIterations = 10_000_000;

  while (iteration < maxIterations) {
    const solutionStr = iteration.toString();
    const puzzle = `${nonce}:${solutionStr}`;
    const puzzleBytes = encoder.encode(puzzle);

    const hashBuffer = await crypto.subtle.digest('SHA-256', puzzleBytes);
    const hashBytes = new Uint8Array(hashBuffer);

    if (countLeadingZeroBits(hashBytes) >= difficultyBits) {
      const durationMs = performance.now() - startTime;
      self.postMessage({
        type: 'SUCCESS',
        solution: solutionStr,
        iterations: iteration,
        durationMs,
      });
      return;
    }

    if (iteration % 5000 === 0 && iteration > 0) {
      self.postMessage({
        type: 'PROGRESS',
        iterations: iteration,
      });
    }

    iteration++;
  }

  self.postMessage({
    type: 'FAILED',
    iterations: iteration,
  });
};
