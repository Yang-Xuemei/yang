import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  Database, BarChart3, Settings, GitBranch, History,
  GitCompare, FileText, Shield, Menu, X, LogOut, User, ChevronRight
} from 'lucide-react';

const navItems = [
  { path: '/data', label: '数据管理', icon: Database },
  { path: '/health', label: '库存健康', icon: BarChart3 },
  { path: '/scenarios', label: '参数场景', icon: Settings },
  { path: '/rules', label: '业务规则', icon: Shield },
  { path: '/solver', label: '调拨求解', icon: GitBranch },
  { path: '/history', label: '求解历史', icon: History },
  { path: '/compare', label: '结果对比', icon: GitCompare },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen w-full flex bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0`}>
        <div className="h-14 flex items-center px-4 border-b border-gray-100">
          {sidebarOpen && (
            <span className="font-bold text-lg text-blue-700 whitespace-nowrap">库存调拨助手</span>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto p-1 rounded hover:bg-gray-100">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} />
                {sidebarOpen && <span className="whitespace-nowrap">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <User size={18} className="text-gray-400" />
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{user?.name || '用户'}</div>
                <div className="text-xs text-gray-400">{isAdmin ? '管理员' : '普通用户'}</div>
              </div>
            )}
            {sidebarOpen && (
              <button onClick={handleLogout} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="退出登录">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
