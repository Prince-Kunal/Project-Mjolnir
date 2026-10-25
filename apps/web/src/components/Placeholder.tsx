interface Props {
  title: string;
  phase: number;
  children?: React.ReactNode;
}

export function Placeholder({ title, phase, children }: Props) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-[28px] leading-tight md:text-[32px]">{title}</h1>
      <p className="mt-2 text-sm text-muted">Arrives in Phase {phase}.</p>
      {children}
    </section>
  );
}
