import { memo } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, StatusBadge, Toggle } from "../common";
import Sparkline from "./Sparkline";

// CSS for range slider styling
const sliderStyles = `
  .slider-thumb {
    pointer-events: auto !important;
  }

  .slider-thumb::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: box-shadow 0.2s;
  }

  .slider-thumb::-webkit-slider-thumb:hover {
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .slider-thumb::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: box-shadow 0.2s;
  }

  .slider-thumb::-moz-range-thumb:hover {
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .slider-thumb::-webkit-slider-runnable-track {
    background: transparent;
    height: 8px;
    border-radius: 4px;
  }

  .slider-thumb::-moz-range-track {
    background: transparent;
    border: none;
  }

  .slider-thumb:disabled::-webkit-slider-thumb {
    background: #94a3b8;
    cursor: not-allowed;
  }

  .slider-thumb:disabled::-moz-range-thumb {
    background: #94a3b8;
    cursor: not-allowed;
  }
`;

if (!document.getElementById("slider-styles")) {
  const styleEl = document.createElement("style");
  styleEl.id = "slider-styles";
  styleEl.innerHTML = sliderStyles;
  document.head.appendChild(styleEl);
}

const RoomCard = memo(
  ({ room, isOnline, onModeChange, onFanChange, onWindowChange, onBuzzerChange }) => {
    const controlDisabled = room.mode === "AUTO";

    return (
      <motion.article
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="min-w-0 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm hover:shadow-md transition-shadow"
      >
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
              {room.roomName}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold text-slate-900">{room.value}</p>
              <StatusBadge level={room.level} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-rose-500"}`}
              title={isOnline ? "Online" : "Offline"}
            />
            <span className="text-xs font-medium text-slate-500">
              {isOnline ? "ON" : "OFF"}
            </span>
          </div>
        </header>

        <div className="mb-3 rounded-lg bg-slate-50 p-1.5">
          <Sparkline data={room.trend} level={room.level} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Mode</span>
            <SegmentedControl
              options={[
                { label: "AUTO", value: "AUTO" },
                { label: "MANUAL", value: "MANUAL" },
              ]}
              value={room.mode}
              onChange={onModeChange}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-700">Fan</span>
            <Toggle
              enabled={room.fan}
              disabled={controlDisabled}
              onChange={onFanChange}
              tooltip={
                controlDisabled ? "Switch to MANUAL to control" : "Toggle fan"
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-700">Window</span>
            <div className="flex items-center gap-2 flex-1 ml-2">
              <input
                type="range"
                min="0"
                max="180"
                value={room.window || 0}
                onChange={(e) => onWindowChange(parseInt(e.target.value))}
                disabled={controlDisabled}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed slider-thumb"
                style={{
                  background: controlDisabled
                    ? "#cbd5e1"
                    : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((room.window || 0) / 180) * 100}%, #e2e8f0 ${((room.window || 0) / 180) * 100}%, #e2e8f0 100%)`
                }}
                title={
                  controlDisabled ? "Switch to MANUAL to control" : `Window: ${room.window || 0}°`
                }
              />
              <span className="text-xs font-semibold text-slate-700 min-w-12 text-right">
                {room.window || 0}°
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-700">Buzzer</span>
            <Toggle
              enabled={room.buzzer}
              disabled={controlDisabled}
              onChange={onBuzzerChange}
              tooltip={
                controlDisabled ? "Switch to MANUAL to control" : "Toggle buzzer"
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
            <span className="text-xs font-medium text-slate-700">Sensor</span>
            <span
              className={`text-xs font-semibold ${
                room.sensor === "OK" ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {room.sensor || "OK"}
            </span>
          </div>
        </div>
      </motion.article>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if room data or handlers change meaningfully
    return (
      prevProps.room.id === nextProps.room.id &&
      prevProps.room.value === nextProps.room.value &&
      prevProps.room.level === nextProps.room.level &&
      prevProps.room.fan === nextProps.room.fan &&
      prevProps.room.buzzer === nextProps.room.buzzer &&
      prevProps.room.window === nextProps.room.window &&
      prevProps.room.mode === nextProps.room.mode &&
      prevProps.room.sensor === nextProps.room.sensor &&
      prevProps.room.trend.length === nextProps.room.trend.length &&
      prevProps.isOnline === nextProps.isOnline
    );
  },
);

RoomCard.displayName = "RoomCard";
export default RoomCard;
