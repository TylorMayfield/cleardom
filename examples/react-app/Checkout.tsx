export function Checkout() {
  return (
    <main>
      <h1>Checkout</h1>
      <h3>Payment</h3>
      <button>
        <CloseIcon />
      </button>
      <a>View receipt</a>
      <label>
        Email
        <input name="email" placeholder="name@example.com" />
      </label>
      <img src="/chart.png" />
      <div onClick={() => console.log("open")}>Open summary</div>
    </main>
  );
}

function CloseIcon() {
  return <svg aria-hidden="true" />;
}
