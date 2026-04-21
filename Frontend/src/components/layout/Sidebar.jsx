import { Home, Settings, X } from 'lucide-react';
import Button from '../common/Button';

const Sidebar = ({ isOpen, onClose, onAddDevice }) => {
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full bg-white border-r border-gray-200 w-64 transition-transform z-40 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:sticky md:top-16 md:h-[calc(100vh-4rem)]`}
      >
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6 md:hidden">
            <h2 className="font-bold text-lg">Menu</h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X size={20} />
            </button>
          </div>

          <nav className="space-y-2 flex-1">
            <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
              <Home size={20} />
              <span>Dashboard</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
              <Settings size={20} />
              <span>Settings</span>
            </button>
          </nav>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={onAddDevice}
          >
            + Add Device
          </Button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
