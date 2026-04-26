import api from "../utils/api";

const API_URL = "/firmware";

export const uploadFirmware = async (formData) => {
  const response = await api.post(`${API_URL}/upload`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

export const getAllFirmware = async () => {
  const response = await api.get(API_URL);
  return response.data;
};

export const getLatestFirmware = async (currentVersion) => {
  const response = await api.get(`${API_URL}/latest`, {
    params: { current: currentVersion },
  });
  return response.data;
};

export const triggerOTAUpdate = async (deviceId, version) => {
  const response = await api.post(`${API_URL}/trigger-update`, {
    deviceId,
    version,
  });
  return response.data;
};

export const deleteFirmware = async (id) => {
  const response = await api.delete(`${API_URL}/${id}`);
  return response.data;
};
