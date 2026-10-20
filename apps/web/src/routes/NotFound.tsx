import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm text-accent">
        Back to Today
      </Link>
    </section>
  );
}
