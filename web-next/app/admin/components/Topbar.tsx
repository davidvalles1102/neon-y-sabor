'use client'

export default function Topbar({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="admin-topbar">
      <button
        className="topbar__toggle"
        onClick={() => document.getElementById('sidebar')?.classList.toggle('open')}
      >
        ☰
      </button>
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__right">{children}</div>
    </header>
  )
}
