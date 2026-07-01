export default function SettingsPage() {
  return (
    <form>
      <input name="email" placeholder="Email" />
      <fieldset>
        <label>
          <input type="radio" name="plan" /> Basic
        </label>
      </fieldset>
      <button aria-label="Save settings">Save</button>
    </form>
  );
}

