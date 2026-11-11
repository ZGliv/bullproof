export default function Loading() {
  return (
    <main className="loading-shell" aria-label="Loading market dashboard">
      <div className="loading-nav skeleton" />
      <div className="loading-hero skeleton" />
      <div className="loading-grid">
        <div className="loading-card skeleton" />
        <div className="loading-card skeleton" />
        <div className="loading-card skeleton" />
        <div className="loading-card skeleton" />
      </div>
      <div className="loading-panels">
        <div className="loading-panel skeleton" />
        <div className="loading-panel skeleton" />
      </div>
    </main>
  );
}
