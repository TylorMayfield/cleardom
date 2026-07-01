export function Checkout() {
  return (
    <section>
      <PrimaryAction aria-label="Delete payment method">Save payment method</PrimaryAction>
      <IconOnlyAction icon={<TrashIcon />} />
      <SearchField placeholder="Email" />
      <TextField placeholder="Postal code" />
      <IconButton title="Close cart" icon={<CloseIcon />} />
    </section>
  );
}

function TrashIcon() {
  return <svg aria-hidden="true" />;
}

function CloseIcon() {
  return <svg aria-hidden="true" />;
}

