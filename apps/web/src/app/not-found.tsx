import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-gray-600">The offer or page you are looking for does not exist or is no longer available.</p>
      <Link href="/" className="btn-primary">
        Back to offers
      </Link>
    </div>
  );
}
