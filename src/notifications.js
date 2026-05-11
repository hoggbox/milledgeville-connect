import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';

export async function initPushNotifications() {
  // Request permission
  const permission = await PushNotifications.requestPermissions();

  if (permission.receive !== 'granted') {
    console.warn('Push notification permission denied');
    return;
  }

  // Register with APNs/FCM
  await PushNotifications.register();

  // Get the FCM token (use this to send targeted notifications)
  PushNotifications.addListener('registration', async (token) => {
    console.log('Device registered, token:', token.value);

    // Get the actual FCM token via the community plugin
    const { token: fcmToken } = await FCM.getToken();
    console.log('FCM Token:', fcmToken);

    // Send fcmToken to your backend to store it
  });

  // Handle registration errors
  PushNotifications.addListener('registrationError', (error) => {
    console.error('Registration error:', error);
  });

  // Notification received while app is in foreground
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Notification received:', notification);
  });

  // User tapped a notification
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('Notification tapped:', action);
  });
}