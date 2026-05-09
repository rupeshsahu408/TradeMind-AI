/**
 * useNotifications — Phase 7
 *
 * Handles:
 * - Service worker registration
 * - Push subscription creation / retrieval
 * - Subscription saving to backend
 * - Permission prompt management
 */

import { useState, useEffect, useCallback } from 'react';
import { pushApi } from '../lib/api';

type NotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading';

interface UseNotificationsReturn {
  status:     NotificationStatus;
  isEnabled:  boolean;
  isLoading:  boolean;
  enable:     () => Promise<void>;
  disable:    () => Promise<void>;
  sendTest:   () => Promise<{ sent: number } | null>;
}

// Convert base64 VAPID key to Uint8Array (required by PushManager)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

const SW_PATH = '/sw.js';

export function useNotifications(): UseNotificationsReturn {
  const [status, setStatus]   = useState<NotificationStatus>('loading');
  const [isLoading, setLoading] = useState(false);
  const [subscription, setSub]  = useState<PushSubscription | null>(null);

  // Determine initial state
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported');
      return;
    }

    const perm = Notification.permission as NotificationPermission;
    if (perm === 'denied') {
      setStatus('denied');
      return;
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then(reg => {
      return reg.pushManager.getSubscription();
    }).then(sub => {
      if (sub) {
        setSub(sub);
        setStatus('granted');
      } else {
        setStatus(perm === 'granted' ? 'default' : 'default');
      }
    }).catch(() => {
      setStatus('default');
    });
  }, []);

  const enable = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    setLoading(true);
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setStatus('denied');
        return;
      }

      // Register service worker
      const reg = await navigator.serviceWorker.register(SW_PATH);
      await navigator.serviceWorker.ready;

      // Get VAPID public key from backend
      let vapidKey: string;
      try {
        const { publicKey } = await pushApi.vapidKey();
        vapidKey = publicKey;
      } catch {
        console.warn('[Push] Could not fetch VAPID key. Notifications unavailable.');
        return;
      }

      // Create push subscription
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      // Save to backend
      const subJson = sub.toJSON();
      await pushApi.subscribe(subJson);

      setSub(sub);
      setStatus('granted');
      console.log('[Push] Notifications enabled.');
    } catch (err) {
      console.error('[Push] Enable error:', err);
      setStatus('default');
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      if (subscription) {
        await subscription.unsubscribe();
        await pushApi.unsubscribe(subscription.endpoint);
        setSub(null);
        setStatus('default');
        console.log('[Push] Notifications disabled.');
      }
    } catch (err) {
      console.error('[Push] Disable error:', err);
    } finally {
      setLoading(false);
    }
  }, [subscription]);

  const sendTest = useCallback(async () => {
    try {
      return await pushApi.test();
    } catch {
      return null;
    }
  }, []);

  return {
    status,
    isEnabled: status === 'granted' && subscription !== null,
    isLoading,
    enable,
    disable,
    sendTest,
  };
}
