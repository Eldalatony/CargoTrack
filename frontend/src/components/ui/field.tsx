/** A labelled form control. The control is passed as the child. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      {label}
      <br />
      {children}
    </label>
  );
}
