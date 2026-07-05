export function App() {
  return (
    <main>
      <button>
        <Icon />
      </button>
      <img src="/avatar.png" />
      <div onClick={() => openMenu()}>Open filters</div>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" />
    </main>
  );
}

function Icon() {
  return <span aria-hidden="true">x</span>;
}
