export function App() {
  return (
    <main>
      <button aria-label={"Close cart"}>
        <XIcon />
      </button>
      <button>{"Save"}</button>
      <IconButton icon={<XIcon />} />
    </main>
  );
}

function XIcon() {
  return <svg aria-hidden="true" />;
}
