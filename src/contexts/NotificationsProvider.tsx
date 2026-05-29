import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { newId } from '@/utils/ids';

export interface AppNotification {
  id: string;
  level: 'warning' | 'error';
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (level: 'warning' | 'error', message: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const addNotification = useCallback((level: 'warning' | 'error', message: string) => {
    setNotifications((prev) => [
      { id: newId(), level, message, timestamp: Date.now(), read: false },
      ...prev,
    ]);
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, addNotification, markAllRead, clearAll }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
