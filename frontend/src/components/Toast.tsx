import './Toast.css'

/** 下部中央のトースト通知。表示制御（2.2s で消す等）は呼び出し側が行う */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="toast">{message}</div>
}
