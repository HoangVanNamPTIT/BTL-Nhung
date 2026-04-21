import { useState, useEffect } from 'react';
import { Navbar, Sidebar, ActivityFeed } from '../components/layout';
import { useDevice } from '../hooks/useDevice';
import { Spinner } from '../components/common';

const DashboardPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { devices, fetchDevices, isLoading } = useDevice();

  useEffect(() => {
    fetchDevices();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onAddDevice={() => {
            // TODO: Open add device modal
            console.log('Add device');
          }}
        />

        <main className="flex-1 p-4 md:p-6 md:ml-64">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Spinner size="lg" />
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500 text-lg">No devices yet. Add your first device to get started!</p>
              </div>
            ) : (
              <div className="space-y-8">
                {devices.map((device) => (
                  <div key={device.id} className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-xl font-bold mb-4">{device.name}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Room cards will be added in Phase 4 */}
                      <div className="p-4 bg-gray-100 rounded-lg text-center text-gray-500">
                        Room cards coming in Phase 4
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8">
              <ActivityFeed />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
