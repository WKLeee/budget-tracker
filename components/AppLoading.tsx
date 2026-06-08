export default function AppLoading() {
  return (
    <div
      className="min-h-[calc(100vh-5rem)] flex items-center justify-center bg-white px-4"
      role="status"
      aria-live="polite"
    >
      <div className="relative h-24 w-24">
        <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-600 animate-spin" />
        <div className="absolute inset-4 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200 flex items-center justify-center animate-pulse">
          <span className="text-3xl" aria-hidden="true">
            💰
          </span>
        </div>
      </div>
      <span className="sr-only">로딩 중...</span>
    </div>
  )
}
