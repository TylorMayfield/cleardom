export function App() {
  return (
    <main>
      <button>
        <Icon />
      </button>
      <div onClick={() => openPanel()}>Open panel</div>
      <input name="phone" />
    </main>
  );
}

function Icon() {
  return <span aria-hidden="true">x</span>;
}
