/**
 * API Configuration
 *
 * SSR (服务端渲染): 必须使用完整URL，因为服务端没有"当前域名"概念
 * CSR (客户端): 使用相对路径，通过Vite proxy转发到后端
 */

// 服务端渲染使用的完整URL
export const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

// 客户端使用的相对路径（会通过Vite proxy转发）
export const API_PATH = '/api';

/**
 * 根据环境选择正确的API URL
 * @param endpoint API端点，例如 '/posts', '/settings'
 * @param isSSR 是否在服务端渲染环境中
 */
export function getApiUrl(endpoint: string, isSSR: boolean = typeof window === 'undefined'): string {
  endpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${API_BASE_URL}${endpoint}`;

}
