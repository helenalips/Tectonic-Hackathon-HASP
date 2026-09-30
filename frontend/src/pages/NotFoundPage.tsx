import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="card mx-auto mt-10 max-w-xl text-center">
      <h1 className="text-heading-s font-bold">We couldn't find that page</h1>
      <p className="mt-2 text-body-s text-textMuted">The link may be out of date.</p>
      <Link to="/" className="btn-primary mt-6">
        Go to your dashboard
      </Link>
    </div>
  );
}
