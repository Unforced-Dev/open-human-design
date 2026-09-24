import { calculateTimeline } from './core.js';
import { snapshot, stateAt, catalog } from './provider.js';

self.onmessage = ({ data }) => {
  try {
    const result = calculateTimeline({
      start: data.start, end: data.end, snapshot, catalog: catalog(),
      states: activations => stateAt(data.natal, activations, data.mode),
      onProgress: progress => self.postMessage({ type: 'progress', progress })
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
