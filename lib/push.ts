import { createClient } from './supabase/client'

type SupabaseClient = ReturnType<typeof createClient>

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

async function getRegistration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function isSubscribed() {
  if (!isPushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

export async function subscribeToPush(
  supabase: SupabaseClient,
  userId: string,
  householdId: string
) {
  if (!isPushSupported()) {
    throw new Error('이 브라우저는 알림을 지원하지 않습니다')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('알림 권한이 거부되었습니다')
  }

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) throw new Error('VAPID 공개키가 설정되지 않았습니다')

  const reg = await getRegistration()
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        household_id: householdId,
        endpoint: json.endpoint,
        subscription: json,
      },
      { onConflict: 'user_id,endpoint' }
    )

  if (error) throw new Error(error.message)
}

export async function unsubscribeFromPush(supabase: SupabaseClient) {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const endpoint = sub.toJSON().endpoint
  await sub.unsubscribe()
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
}
