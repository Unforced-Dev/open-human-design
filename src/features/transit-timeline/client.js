/** Worker lifetime and a bounded, in-memory cache; independent of presentation. */
export function createTimelineClient() {
  const cache = new Map();
  let active = null;
  function cancel() {
    if (active) {
      active.worker.terminate();
      active.reject(new DOMException('Calculation cancelled', 'AbortError'));
      active = null;
    }
  }
  return {
    cancel,
    dispose() { cancel(); cache.clear(); },
    calculate(request, onProgress) {
      cancel();
      const key = JSON.stringify(request);
      if (cache.has(key)) return Promise.resolve(cache.get(key));
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./timeline.worker.js', import.meta.url), { type: 'module' });
        active = { worker, reject };
        const finish = () => { worker.terminate(); if (active?.worker === worker) active = null; };
        worker.onerror = event => { finish(); reject(new Error(event.message)); };
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') { onProgress?.(data.progress); return; }
          finish();
          if (data.type === 'error') { reject(new Error(data.message)); return; }
          cache.set(key, data.result);
          if (cache.size > 4) cache.delete(cache.keys().next().value);
          resolve(data.result);
        };
        worker.postMessage(request);
      });
    }
  };
}
