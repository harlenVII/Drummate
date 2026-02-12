// Web Worker for metronome timing
// Runs in a separate thread to avoid throttling
let timerID = null;
let interval = 25;

self.onmessage = function (e) {
  if (e.data === 'start') {
    // Always clear any existing timer first — after a long sleep the old
    // setInterval may be dead while timerID is still set, which would cause
    // the early-return to silently skip restarting the timer.
    if (timerID) {
      clearInterval(timerID);
      timerID = null;
    }
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
