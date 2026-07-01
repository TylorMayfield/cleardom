export default function DashboardPage() {
  return (
    <main>
      <h2>Dashboard</h2>
      <h4>Today</h4>
      <button>
        <SearchIcon />
      </button>
      <img src="/chart.png" />
      <div onClick={() => console.log("open")}>Open panel</div>
    </main>
  );
}

function SearchIcon() {
  return <svg aria-hidden="true" />;
}

