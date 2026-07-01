export function FalsePositiveFixture() {
  return (
    <html lang="en">
      <head>
        <title>Accessible Checkout Benchmark</title>
      </head>
      <body>
        <a href="#content">Skip to content</a>
        <header>
          <h1>Accessible Checkout Benchmark</h1>
          <nav aria-label="Primary">
            <a href="/orders">Orders</a>
            <a href="/support">Support</a>
          </nav>
        </header>
        <main id="content">
          <h2>Payment details</h2>
          <p>Required fields are marked with an asterisk and red border.</p>
          <p>Press Continue to review the order.</p>
          <p>
            Greeting: <span lang="fr">Bonjour, votre recu est pret.</span>
          </p>
          <p className="readable-gradient">Readable text over a high-contrast gradient background.</p>
          <img src="/revenue-chart.png" alt="Revenue increased every quarter." />
          <video controls>
            <track kind="captions" src="/captions.vtt" />
          </video>
          <audio controls aria-describedby="transcript" src="/interview.mp3" />
          <p id="transcript">Transcript available below the player.</p>
          <form>
            <fieldset>
              <legend>Shipping speed</legend>
              <label>
                <input type="radio" name="shipping" />
                Economy
              </label>
            </fieldset>
            <label htmlFor="email">Email *</label>
            <input id="email" name="email" autoComplete="email" />
            <label htmlFor="card">Card number *</label>
            <input id="card" name="cc-number" autoComplete="cc-number" aria-describedby="card-help" />
            <p id="card-help">Enter the card number without spaces.</p>
            <button type="button" onClick={() => showHelp()}>
              Continue
            </button>
            <p role="status">Saved payment method.</p>
          </form>
        </main>
      </body>
    </html>
  );
}

function showHelp() {
  return undefined;
}
