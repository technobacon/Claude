export class Input {
  constructor(canvas) {
    this._handlers = {};

    const emit = (x, y) => this._emit('tap', { x, y });

    const scale = (e, touch) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      return {
        x: (touch.clientX - rect.left) * sx,
        y: (touch.clientY - rect.top) * sy,
      };
    };

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const { x, y } = scale(e, e.touches[0]);
      emit(x, y);
    }, { passive: false });

    canvas.addEventListener('mousedown', e => {
      const { x, y } = scale(e, e);
      emit(x, y);
    });
  }

  on(event, handler) {
    if (!this._handlers[event]) this._handlers[event] = [];
    this._handlers[event].push(handler);
  }

  _emit(event, data) {
    (this._handlers[event] ?? []).forEach(h => h(data));
  }
}
