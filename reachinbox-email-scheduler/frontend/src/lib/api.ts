import axios from 'axios'

export const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '') ?? ''

export const api = axios.create({
  ...(apiBaseUrl ? { baseURL: apiBaseUrl } : {}),
  withCredentials: true,
})

export const googleAuthUrl = apiBaseUrl
  ? new URL('/api/auth/google', apiBaseUrl).toString()
  : '/api/auth/google'
