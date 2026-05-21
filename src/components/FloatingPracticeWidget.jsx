import { useLayoutEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { formatTime } from '../utils/formatTime';

let sessionPos = null; // survives tab-switch remounts, resets on page refresh

function FloatingPracticeWidget({ itemName, elapsedTime, onStop, onNavigate }) {
  const { t } = useLanguage();
  const [pos, setPos] = useState(() => sessionPos);
  const btnRef = useRef(null);
  const dragRef = useRef(null);
  const wasDragged = useRef(false);

  // On first mount with no saved position, center the pill in the gap between
  // the Drummate h1 and the settings avatar button.
  useLayoutEffect(() => {
    if (pos !== null) return;
    const h1 = document.querySelector('h1');
    const settingsBtn = document.querySelector('[aria-label="Open settings"]');
    const pill = btnRef.current;
    if (!h1 || !settingsBtn || !pill) return;

    const h1Rect = h1.getBoundingClientRect();
    const sBtnRect = settingsBtn.getBoundingClientRect();
    sessionPos = {
      x: Math.round((h1Rect.right + sBtnRect.left) / 2 - pill.offsetWidth / 2),
      y: Math.round(h1Rect.top + h1Rect.height / 2 - pill.offsetHeight / 2),
    };
    setPos(sessionPos);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!itemName) return null;

  const handleStopClick = (e) => {
    e.stopPropagation();
    onStop();
  };

  const handlePointerDown = (e) => {
    if (e.target.closest('[data-stop]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
    };
    wasDragged.current = false;
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!wasDragged.current && dx * dx + dy * dy > 16) {
      wasDragged.current = true;
    }
    if (wasDragged.current) {
      const newPos = {
        x: e.clientX - dragRef.current.offsetX,
        y: e.clientY - dragRef.current.offsetY,
      };
      sessionPos = newPos;
      setPos(newPos);
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleClick = () => {
    if (wasDragged.current) {
      wasDragged.current = false;
      return;
    }
    onNavigate();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`fixed ${pos ? '' : 'top-4 left-1/2 -translate-x-1/2'} z-50 h-9 flex items-center gap-3 pl-4 pr-2 rounded-full bg-blue-600 text-white shadow-lg max-w-[280px] hover:bg-blue-700 cursor-grab active:cursor-grabbing select-none`}
      aria-label={itemName}
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
      </span>
      <span className="text-sm font-medium truncate min-w-0">{itemName}</span>
      <span className="text-sm font-mono tabular-nums shrink-0">{formatTime(elapsedTime)}</span>
      <span
        role="button"
        tabIndex={0}
        data-stop
        onClick={handleStopClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStopClick(e);
          }
        }}
        aria-label={t('stopPractice')}
        className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 cursor-pointer"
      >
        <span className="block w-2.5 h-2.5 bg-white rounded-sm" />
      </span>
    </button>
  );
}

export default FloatingPracticeWidget;
