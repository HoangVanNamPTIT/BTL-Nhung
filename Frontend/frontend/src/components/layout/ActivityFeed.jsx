import { useEffect, useRef } from "react";
import { useDevice } from "../../hooks/useDevice";

const getActivityIcon = (eventType) => {
  const icons = {
    DEVICE_ONLINE: "🟢",
    DEVICE_OFFLINE: "🔴",
    MODE_CHANGED: "⚙️",
    FAN_TOGGLED: "💨",
    DEVICE_CLAIMED: "✅",
    DEVICE_RELEASED: "🔓",
    SOCKET_CONNECTED: "🔗",
    SOCKET_DISCONNECTED: "❌",
    SOCKET_CONNECT_ERROR: "⚠️",
  };
  return icons[eventType] || "📝";
};

const getActivityColor = (eventType) => {
  const colors = {
    DEVICE_ONLINE: "border-green-500 bg-green-50",
    DEVICE_OFFLINE: "border-red-500 bg-red-50",
    MODE_CHANGED: "border-blue-500 bg-blue-50",
    FAN_TOGGLED: "border-cyan-500 bg-cyan-50",
    DEVICE_CLAIMED: "border-emerald-500 bg-emerald-50",
    DEVICE_RELEASED: "border-orange-500 bg-orange-50",
    SOCKET_CONNECTED: "border-purple-500 bg-purple-50",
    SOCKET_DISCONNECTED: "border-red-500 bg-red-50",
    SOCKET_CONNECT_ERROR: "border-yellow-500 bg-yellow-50",
  };
  return colors[eventType] || "border-slate-500 bg-slate-50";
};

const ActivityFeed = () => {
  const { activities } = useDevice();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activities]);

  return (
    <div className="flex h-64 flex-col rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">📋 Activity Feed</h3>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {activities.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No activity yet
          </p>
        ) : (
          activities.map((activity, idx) => (
            <div
              key={idx}
              className={`rounded border-l-2 p-2 text-sm transition-all ${getActivityColor(activity.eventType)}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg leading-none">
                  {getActivityIcon(activity.eventType)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">
                    {activity.deviceName}
                  </p>
                  <p className="text-slate-700 word-break">
                    {activity.message}
                  </p>
                  <span className="text-xs text-slate-500">
                    {new Date(activity.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default ActivityFeed;
