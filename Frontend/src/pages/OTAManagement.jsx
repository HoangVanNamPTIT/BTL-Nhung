import { useState, useEffect, useCallback } from "react";
import { useDeviceStore } from "../stores/useDeviceStore";
import { Navbar, Sidebar } from "../components/layout";
import { Spinner } from "../components/common";
import { 
  getAllFirmware, 
  uploadFirmware, 
  deleteFirmware, 
  editFirmware, 
  getFirmwareUpdateLogs,
  triggerBatchOTAUpdate,
  getUpdateStatus 
} from "../api/firmware";
import api from "../utils/api";
import "../styles/ota.css";

export default function OTAManagement() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [firmwares, setFirmwares] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [firmwareFile, setFirmwareFile] = useState(null);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFirmware, setEditingFirmware] = useState(null);
  const [editVersion, setEditVersion] = useState("");
  const [editReleaseNotes, setEditReleaseNotes] = useState("");

  // Device select modal
  const [showDeviceSelectModal, setShowDeviceSelectModal] = useState(false);
  const [selectedFirmwareForUpdate, setSelectedFirmwareForUpdate] = useState(null);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState("");

  // Progress tracking modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({});
  const [updateSessionId, setUpdateSessionId] = useState(null);
  const [updateVersion, setUpdateVersion] = useState(null);
  const [updateDeviceIds, setUpdateDeviceIds] = useState([]);

  // View logs modal
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsFirmware, setLogsFirmware] = useState(null);
  const [updateLogs, setUpdateLogs] = useState([]);

  // Search & Pagination
  const [searchVersion, setSearchVersion] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10; // 10 items per page

  // Fetch devices from Zustand store
  const storeDevices = useDeviceStore((state) => state.devices);
  const fetchDevices = useDeviceStore((state) => state.fetchDevices);

  useEffect(() => {
    fetchAllData();
  }, []);

  // Update devices when storeDevices changes
  useEffect(() => {
    if (storeDevices && storeDevices.length > 0) {
      console.log("[OTA] Setting devices from store:", storeDevices);
      setDevices(storeDevices);
    }
  }, [storeDevices]);

  // POLLING: Track update status when progress modal is open
  useEffect(() => {
    if (!showProgressModal || !updateVersion || updateDeviceIds.length === 0) {
      return;
    }

    let pollingInterval;
    let isActive = true;

    const pollUpdateStatus = async () => {
      try {
        console.log("[OTA] 🔄 Polling update status for devices:", updateDeviceIds);
        const response = await getUpdateStatus(updateVersion, updateDeviceIds);

        if (!isActive) return;

        console.log("[OTA] 📊 Poll response:", response);

        // Update progress for each device
        const newProgress = { ...updateProgress };
        response.updateStatuses.forEach((status) => {
          const progress = status.status === "success" ? 100 : status.status === "failed" ? 0 : 50;
          newProgress[status.deviceId] = {
            ...newProgress[status.deviceId],
            status: status.status,
            progress,
            error: status.error,
            completedAt: status.completedAt,
          };
          
          if (status.status !== "pending") {
            console.log(
              `[OTA] ✅ Device ${status.deviceName} (${status.macAddress}): ${status.status.toUpperCase()} - Progress: ${progress}%`
            );
          }
        });

        setUpdateProgress(newProgress);
      } catch (error) {
        console.error("[OTA] ❌ Polling error:", error);
      }
    };

    // Initial poll immediately
    pollUpdateStatus();

    // Then poll every 500ms
    pollingInterval = setInterval(pollUpdateStatus, 500);

    return () => {
      isActive = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [showProgressModal, updateVersion, updateDeviceIds]);

  const fetchAllData = async () => {
    try {
      console.log("[OTA] Fetching devices and firmware...");
      await fetchDevices();
      
      const data = await getAllFirmware();
      setFirmwares(data.firmwares || []);
      console.log("[OTA] Data fetched successfully");
      setLoading(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoading(false);
      alert("Lỗi khi tải dữ liệu: " + error.message);
    }
  };

  // ============= FILE UPLOAD =============
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith(".bin")) {
      setFirmwareFile(file);
    } else {
      alert("Vui lòng chọn file .bin");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!version || !firmwareFile) {
      alert("Vui lòng nhập phiên bản và chọn file");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("version", version);
      formData.append("releaseNotes", releaseNotes);
      formData.append("firmwareFile", firmwareFile);

      const data = await uploadFirmware(formData);

      alert("Upload firmware thành công!");
      
      setFirmwares([data.firmware, ...firmwares]);
      setShowUploadModal(false);
      setVersion("");
      setReleaseNotes("");
      setFirmwareFile(null);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Lỗi upload: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // ============= EDIT FIRMWARE =============
  const handleEditClick = (firmware) => {
    setEditingFirmware(firmware);
    setEditVersion(firmware.version);
    setEditReleaseNotes(firmware.releaseNotes || "");
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editVersion) {
      alert("Vui lòng nhập phiên bản");
      return;
    }

    try {
      const data = await editFirmware(editingFirmware._id, {
        version: editVersion,
        releaseNotes: editReleaseNotes,
      });
      
      // Update local state
      setFirmwares(
        firmwares.map((fw) => fw._id === editingFirmware._id ? data.firmware : fw)
      );

      alert("Cập nhật firmware thành công!");
      setShowEditModal(false);
      setEditingFirmware(null);
    } catch (error) {
      console.error("Edit error:", error);
      alert("Lỗi cập nhật: " + error.message);
    }
  };

  // ============= DELETE FIRMWARE =============
  const handleDelete = async (firmwareId) => {
    if (!window.confirm("Bạn chắc chắn muốn xóa firmware này?")) return;

    try {
      await deleteFirmware(firmwareId);
      setFirmwares(firmwares.filter((fw) => fw._id !== firmwareId));
      alert("Xóa firmware thành công!");
    } catch (error) {
      console.error("Delete error:", error);
      alert("Lỗi xóa: " + error.message);
    }
  };

  // ============= VIEW LOGS =============
  const handleViewLogs = async (firmware) => {
    try {
      setLogsFirmware(firmware);
      
      const data = await getFirmwareUpdateLogs(firmware._id);
      setUpdateLogs(data.logs || []);
      setShowLogsModal(true);
    } catch (error) {
      console.error("Logs error:", error);
      alert("Lỗi tải logs: " + error.message);
    }
  };

  // ============= BATCH UPDATE =============
  const handleUpdateClick = (firmware) => {
    setSelectedFirmwareForUpdate(firmware);
    setSelectedDevices([]);
    setDeviceSearchTerm("");
    setShowDeviceSelectModal(true);
  };

  const toggleDeviceSelection = (deviceId) => {
    setSelectedDevices((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const handleBatchUpdate = async () => {
    if (selectedDevices.length === 0) {
      alert("Vui lòng chọn ít nhất 1 thiết bị");
      return;
    }

    try {
      console.log("[OTA] 📤 Sending OTA command...");
      const data = await triggerBatchOTAUpdate(
        selectedFirmwareForUpdate.version,
        selectedDevices
      );
            console.log("[OTA] ✅ API Response:", data);
      console.log(
        `[OTA] sentCount=${data.sentCount}, totalDevices=${data.totalDevices}, failedCount=${data.failedCount}`,
      );      console.log("[OTA] ✅ Command sent successfully. Initializing progress tracking...");
      
      // Initialize progress tracking with device details
      const progressData = {};
      selectedDevices.forEach((deviceId) => {
        const device = devices.find((d) => d.id === deviceId);
        progressData[deviceId] = {
          status: "downloading",
          progress: 50, // 50% when command sent successfully
          deviceName: device?.name,
          macAddress: device?.macAddress,
          version: selectedFirmwareForUpdate.version,
        };
        console.log(
          `[OTA] ${device?.name} (${device?.macAddress}): Status=downloading, Progress=50%`
        );
      });
      
      setUpdateProgress(progressData);
      setUpdateSessionId(data.sessionId);
      setUpdateVersion(selectedFirmwareForUpdate.version); // Set for polling
      setUpdateDeviceIds(selectedDevices); // Set for polling
      setShowDeviceSelectModal(false);
      setShowProgressModal(true);

      console.log(
        `[OTA] ⏳ Starting polling for device confirmation...`
      );
      alert(`✅ Đã gửi lệnh cập nhật tới ${data.sentCount} thiết bị! Chờ xác nhận từ thiết bị...`);
    } catch (error) {
      console.error("[OTA] ❌ Batch update error:", error);
      alert("❌ Lỗi cập nhật: " + error.message);
    }
  };

  // ============= UTILS =============
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString("vi-VN");
  };

  const filteredDevices = devices.filter((device) => {
    if (!device || !device.name) {
      console.warn("[OTA] Invalid device:", device);
      return false;
    }
    // Filter: only ONLINE devices, and match search term
    const isOnline = device.status === "ONLINE";
    const matchesSearch = device.name.toLowerCase().includes(deviceSearchTerm.toLowerCase());
    return isOnline && matchesSearch;
  });

  // Filter firmwares by search version
  const filteredFirmwares = firmwares.filter((fw) =>
    fw.version.toLowerCase().includes(searchVersion.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredFirmwares.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedFirmwares = filteredFirmwares.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Reset to page 1 when search changes
  const handleSearchChange = (value) => {
    setSearchVersion(value);
    setCurrentPage(1);
  };

  if (loading && firmwares.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Navbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />

      <div className="mx-auto flex w-full max-w-[1440px] gap-4 px-4 py-4 lg:px-6">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="min-w-0 flex-1 space-y-6 md:ml-64">
          {/* Header */}
          <header className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Firmware Management
            </p>
            <h2 className="text-3xl font-bold text-slate-900">
              🔧 Firmware Management
            </h2>
            <p className="text-sm text-slate-600">
              Upload, edit and update firmware for all devices
            </p>
          </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Firmware Versions</p>
                <p className="text-3xl font-bold text-gray-800">{firmwares.length}</p>
              </div>
              <div className="text-4xl">📦</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Devices</p>
                <p className="text-3xl font-bold text-gray-800">{devices?.length || 0}</p>
              </div>
              <div className="text-4xl">📱</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Online Devices</p>
                <p className="text-3xl font-bold text-green-600">
                  {devices?.filter((d) => d?.status === "ONLINE").length || 0}
                </p>
              </div>
              <div className="text-4xl">🟢</div>
            </div>
          </div>
        </div>

        {/* STICKY CONTAINER: Upload + Search + Table Header */}
        <div className="sticky z-40 bg-white rounded-lg shadow mb-6" style={{ top: "56px" }}>
          {/* Action Button */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg transition"
            >
              ➕ Upload Firmware
            </button>
          </div>

          {/* Search & Filter Section */}
          <div className="p-4 border-b-2 border-blue-100">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🔍 Tìm kiếm theo Version
                </label>
                <input
                  type="text"
                  placeholder="Nhập version (VD: 1.0.3)..."
                  value={searchVersion}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {searchVersion && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="mt-6 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  Xóa
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Tìm thấy: <span className="font-semibold text-blue-600">{filteredFirmwares.length}</span> kết quả | Trang: <span className="font-semibold text-blue-600">{currentPage}/{totalPages || 1}</span>
            </p>
          </div>

          {/* Table Header - Part of sticky container */}
          <table className="w-full border-collapse">
            <thead className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
              <tr>
                <th className="px-6 py-4 text-left">Version</th>
                <th className="px-6 py-4 text-left">File</th>
                <th className="px-6 py-4 text-left">Dung Lượng</th>
                <th className="px-6 py-4 text-left">Upload Date</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* SCROLLABLE TABLE BODY - Below sticky header */}
        <div className="bg-white rounded-lg shadow overflow-hidden" style={{ maxHeight: "600px", overflowY: "auto" }}>
          <table className="w-full border-collapse">
            <tbody>
              {paginatedFirmwares.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                    {filteredFirmwares.length === 0
                      ? "Chưa có firmware nào được upload"
                      : "Không có kết quả phù hợp"}
                  </td>
                </tr>
              ) : (
                paginatedFirmwares.map((fw) => (
                  <tr key={fw._id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                        v{fw.version}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{fw.original_filename || fw.filename}</td>
                    <td className="px-6 py-4 text-gray-700">
                      {formatFileSize(fw.fileSize)}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-sm">
                      {formatDate(fw.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleUpdateClick(fw)}
                          className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition"
                          title="Cập nhật cho thiết bị"
                        >
                          🚀 Update
                        </button>
                        <button
                          onClick={() => handleViewLogs(fw)}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition"
                          title="Xem nhật ký cập nhật"
                        >
                          📋 Logs
                        </button>
                        <button
                          onClick={() => handleEditClick(fw)}
                          className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition"
                          title="Chỉnh sửa"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(fw._id)}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition"
                          title="Xóa"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="bg-white rounded-lg shadow mt-0" style={{ borderRadius: "0 0 0.5rem 0.5rem" }}>
          <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              Hiển thị <span className="font-semibold">{startIndex + 1}</span> đến{" "}
              <span className="font-semibold">
                {Math.min(startIndex + itemsPerPage, filteredFirmwares.length)}
              </span>{" "}
              / <span className="font-semibold">{filteredFirmwares.length}</span> kết quả
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                ← Trước
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded-lg transition ${
                      currentPage === page
                        ? "bg-blue-500 text-white font-semibold"
                        : "border border-gray-300 hover:bg-gray-100"
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Sau →
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ============= MODALS ============= */}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">📤 Upload Firmware</h2>
            <form onSubmit={handleUpload}>
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">Version *</label>
                <input
                  type="text"
                  placeholder="e.g., 1.0.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2">
                  Firmware File (.bin) *
                </label>
                <input
                  type="file"
                  accept=".bin"
                  onChange={handleFileChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  required
                />
                {firmwareFile && (
                  <p className="text-sm text-gray-600 mt-2">
                    📄 {firmwareFile.name} ({formatFileSize(firmwareFile.size)})
                  </p>
                )}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">Release Notes</label>
                <textarea
                  rows="3"
                  placeholder="Describe the changes..."
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition disabled:opacity-50"
                >
                  {uploading ? "Đang upload..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editingFirmware && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">✏️ Edit Firmware</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-2">Version *</label>
              <input
                type="text"
                value={editVersion}
                onChange={(e) => setEditVersion(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold mb-2">Release Notes</label>
              <textarea
                rows="3"
                value={editReleaseNotes}
                onChange={(e) => setEditReleaseNotes(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Logs Modal */}
      {showLogsModal && logsFirmware && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 w-full max-w-3xl shadow-2xl max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              📋 Logs: Firmware v{logsFirmware.version}
            </h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{updateLogs.filter(l => l.updateStatus === "success").length}</p>
                <p className="text-gray-600 text-sm">Success</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">{updateLogs.filter(l => l.updateStatus === "pending").length}</p>
                <p className="text-gray-600 text-sm">Pending</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{updateLogs.filter(l => l.updateStatus === "failed").length}</p>
                <p className="text-gray-600 text-sm">Failed</p>
              </div>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {updateLogs.length === 0 ? (
                <p className="text-gray-500">No update data</p>
              ) : (
                updateLogs.map((log) => (
                  <div key={log.id} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-gray-800">{log.deviceName}</p>
                        <p className="text-sm text-gray-500">{log.macAddress}</p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded text-sm font-semibold ${
                          log.updateStatus === "success"
                            ? "bg-green-100 text-green-800"
                            : log.updateStatus === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.updateStatus}
                      </span>
                    </div>
                    {log.errorMessage && (
                      <p className="text-sm text-red-600">Error: {log.errorMessage}</p>
                    )}
                    {log.completedAt && (
                      <p className="text-xs text-gray-500">
                        ✓ {formatDate(log.completedAt)}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowLogsModal(false)}
              className="w-full mt-6 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Device Select Modal (Multi-select) */}
      {showDeviceSelectModal && selectedFirmwareForUpdate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl shadow-2xl max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold mb-2">
              🚀 Update: v{selectedFirmwareForUpdate.version}
            </h2>
            <p className="text-gray-600 mb-6">Select devices to update:</p>

            {/* Search */}
            <input
              type="text"
              placeholder="🔍 Search devices..."
              value={deviceSearchTerm}
              onChange={(e) => setDeviceSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
            />

            {/* Device List */}
            <div className="space-y-2 max-h-48 overflow-y-auto mb-6">
              {filteredDevices.length === 0 ? (
                <p className="text-gray-500">No devices found</p>
              ) : (
                filteredDevices.map((device) => (
                  <label
                    key={device?.id || Math.random()}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition ${
                      selectedDevices.includes(device?.id)
                        ? "bg-blue-50 border-blue-500"
                        : "border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDevices.includes(device?.id)}
                      onChange={() => toggleDeviceSelection(device?.id)}
                      className="w-4 h-4 text-blue-600 cursor-pointer"
                    />
                    <div className="ml-3 flex-1">
                      <p className="font-semibold text-gray-800">
                        {device?.name || "Unknown Device"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {device?.macAddress || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        device?.status === "ONLINE"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {device?.status || "UNKNOWN"}
                    </span>
                  </label>
                ))
              )}
            </div>

            {/* Selected Count */}
            <p className="text-sm text-gray-600 mb-4">
              Selected: <strong>{selectedDevices.length}</strong> devices
            </p>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => setShowDeviceSelectModal(false)}
                className="flex-1 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchUpdate}
                disabled={selectedDevices.length === 0}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition disabled:opacity-50"
              >
                ✓ Update ({selectedDevices.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress Tracking Modal */}
      {showProgressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-8 w-full max-w-2xl shadow-2xl max-h-screen overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6">
              ⏳ Update Progress
            </h2>

            <div className="space-y-4 max-h-64 overflow-y-auto">
              {Object.entries(updateProgress).map(([deviceId, progress]) => (
                <div key={deviceId} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <p className="font-semibold text-gray-800">
                        {progress.deviceName || `Device ${deviceId}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {progress.macAddress || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        progress.status === "success"
                          ? "bg-green-100 text-green-800"
                          : progress.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {progress.status === "success"
                        ? "✅ Thành công"
                        : progress.status === "failed"
                        ? "❌ Thất bại"
                        : "⏳ Đang tải..."}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition ${
                        progress.status === "success"
                          ? "bg-green-500"
                          : progress.status === "failed"
                          ? "bg-red-500"
                          : "bg-blue-500"
                      }`}
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-500">{progress.progress}%</p>
                    {progress.error && (
                      <p className="text-xs text-red-600">❌ {progress.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setShowProgressModal(false);
                setUpdateVersion(null);
                setUpdateDeviceIds([]);
              }}
              className="w-full mt-6 px-4 py-2 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
