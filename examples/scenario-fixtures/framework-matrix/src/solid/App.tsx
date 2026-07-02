export function App() {
  return (
    <main>
      <button aria-label="Close cart">
        <Icon />
      </button>
      <div onClick={() => openPanel()}>Open panel</div>
    </main>
  );
}

function Icon() {
  return <span aria-hidden="true">x</span>;
}
