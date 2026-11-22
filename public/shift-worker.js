/**
 * Web Worker dedicado para mantener el pulso de monitoreo de brechas y jornada
 * mientras una jornada está encendida, evitando el throttling agresivo de
 * setInterval en pestañas ocultas o minimizadas.
 */
let timerId = null;

self.onmessage = function (event) {
  const data = event.data || {};
  if (data.type === "START") {
    const intervalMs =
      typeof data.intervalMs === "number" && data.intervalMs >= 5000
        ? data.intervalMs
        : 20000;
    if (timerId !== null) {
      clearInterval(timerId);
    }
    timerId = setInterval(() => {
      self.postMessage({ type: "TICK", ts: Date.now() });
    }, intervalMs);
    self.postMessage({ type: "STARTED", intervalMs });
  } else if (data.type === "STOP") {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    self.postMessage({ type: "STOPPED" });
  }
};
