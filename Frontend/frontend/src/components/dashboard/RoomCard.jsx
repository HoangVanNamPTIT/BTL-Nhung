import { memo } from "react";
import { motion } from "framer-motion";
import { SegmentedControl, StatusBadge, Toggle } from "../common";
import Sparkline from "./Sparkline";

const RoomCard = memo(
  ({ room, isOnline, onModeChange, onFanChange }) => {
    const fanDisabled = room.mode === "AUTO";

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
              disabled={fanDisabled}
              onChange={onFanChange}
              tooltip={
                fanDisabled ? "Switch to MANUAL to control" : "Toggle fan"
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
      prevProps.room.mode === nextProps.room.mode &&
      prevProps.room.sensor === nextProps.room.sensor &&
      prevProps.room.trend.length === nextProps.room.trend.length &&
      prevProps.isOnline === nextProps.isOnline
    );
  },
);

RoomCard.displayName = "RoomCard";
export default RoomCard;
