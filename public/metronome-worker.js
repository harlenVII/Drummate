// Web Worker for metronome timing
// Runs in a separate thread to avoid throttling
let timerID = null;
let interval = 25;

self.onmessage = function (e) {
  if (e.data === 'start') {
    if (timerID) return;
    timerID = setInterval(() => {
      self.postMessage('tick');
    }, interval);
  } else if (e.data === 'stop') {
    if (timerID) {
      clearInterval(timerID);
      timerID = null;
    }
  } else if (e.data.interval) {
    interval = e.data.interval;
  }
};
