export function WcagBenchmarkFixture() {
  return (
    <html>
      <head>
      </head>
      <body>
        <main>
          <h1>WCAG Benchmark Fixture</h1>
          <h3>Skipped Heading Level</h3>

          <section aria-label="ClearDOM static findings">
            <button>
              <Icon />
            </button>
            <button>Click here</button>
            <button aria-label="Send invoice">Go</button>
            <a>Receipt</a>
            <label>
              Search
              <input name="search" placeholder="Search" />
            </label>
            <input name="email" placeholder="Email address" />
            <input name="firstName" placeholder="First name" />
            <select name="state">
              <option>Choose a state</option>
            </select>
            <textarea name="notes" />
            <img src="/revenue-chart.png" />
            <div onClick={() => openDialog()}>Open details</div>
            <div className="toast success">Saved changes</div>
            <video controls src="/product-demo.mp4" />
            <video data-live="true" controls src="/live-townhall.mp4" />
            <audio controls src="/interview.mp3" />
            <audio autoPlay src="/loop.mp3" />
            <p>Step 2: Pay. Step 1: Create account.</p>
            <p>This checkout only works in portrait orientation.</p>
            <p className="tiny-text">Fixed tiny text becomes unusable when zoomed.</p>
            <div className="image-text">SALE ENDS TODAY</div>
            <div className="reflow-box">This content forces horizontal scrolling at 320 CSS pixels.</div>
            <button className="low-contrast">Low contrast boundary</button>
            <p className="overlap">Increasing text spacing causes this text to overlap.</p>
            <div className="hover-panel">Tooltip cannot be dismissed or hovered independently.</div>
            <div aria-hidden="true">
              <button>Hidden focus target</button>
            </div>
            <label htmlFor="duplicate-email">Email</label>
            <input id="duplicate-email" />
            <p id="duplicate-email">Duplicate help text</p>
            <button tabIndex={2}>Positive focus order</button>
            <fieldset>
              <label><input type="radio" name="shipping" /> Economy</label>
            </fieldset>
            <input aria-invalid="true" name="cardNumber" />
            <button onPointerDown={() => submitPayment()}>Submit payment</button>
            <p>Required fields are shown in red.</p>
            <p>Press the round button on the right.</p>
            <p>Bonjour, votre reçu est prêt.</p>
            <p>Please re-enter your password for verification.</p>
            <input name="password" placeholder="Password" />
            <input name="confirm-password" placeholder="Confirm password" />
            <p>Help text may be inconsistent across different form fields.</p>
            <input name="coupon" onFocus={() => window.location.assign("/coupon-help")} />
            <select name="country" onChange={() => submit()}>
              <option>Choose a country</option>
            </select>
            <section onKeyDown={(event) => {
              if (event.key === "Tab") event.preventDefault();
            }}>
              <button>Focus trap start</button>
              <button>Focus trap end</button>
            </section>
            <p>Press single-key shortcut S to submit, with no way to disable it.</p>
            <p>Session expires in 3 seconds.</p>
            <p className="moving">Moving content starts automatically.</p>
            <p className="flashing">Rapid flashing region.</p>
            <p>This page has only one path to support content.</p>
            <p>Overlay covers focused control.</p>
            <canvas>Path drawing widget has no single-pointer alternative.</canvas>
            <p>Shake the device to undo. No button alternative is available.</p>
            <p>Drag cards into priority order. No button alternative exists.</p>
            <button className="target-small">?</button>
            <p>Navigation order changes from the header.</p>
            <p>Buttons for the same action use different labels.</p>
            <p>Financial transfer has no review or reversal step.</p>
            <p>Solve 19 x 7 to sign in.</p>
          </section>

          <section aria-label="React Native static findings">
            <Pressable>
              <Icon />
            </Pressable>
          </section>
        </main>
      </body>
    </html>
  );
}

function Icon() {
  return <svg aria-hidden="true" />;
}

function Pressable(props: { children: JSX.Element }) {
  return props.children;
}

function openDialog() {
  return undefined;
}

function submitPayment() {
  return undefined;
}

function submit() {
  return undefined;
}
