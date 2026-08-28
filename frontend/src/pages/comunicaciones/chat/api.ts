import axios from "axios";

export const chatApi = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
chatApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
