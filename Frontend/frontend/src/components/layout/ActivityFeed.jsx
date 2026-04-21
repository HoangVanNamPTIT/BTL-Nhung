import { useEffect, useRef } from 'react';
import { useDevice } from '../../hooks/useDevice';

const ActivityFeed = () => {
  const { activities } = useDevice();
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activities]);

  return (
    <div className="h-64 bg-white border border-gray-200 rounded-lg flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Activity Feed</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No activity yet</p>
        ) : (
          activities.map((activity, idx) => (
            <div
              key={idx}
              className="text-sm text-gray-700 p-2 bg-gray-50 rounded border-l-2 border-blue-500"
            >
              <p>{activity.message}</p>
              <span className="text-xs text-gray-500">
                {new Date(activity.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default ActivityFeed;
