'use client';

import { useRouter } from 'next/navigation';
import { BusinessForm } from '@/components/business-form';
import { RequireAuth } from '@/components/require-auth';

export default function NewBusinessPage() {
  const router = useRouter();
  return (
    <RequireAuth>
      <div className="card mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">Register your business</h1>
        <p className="text-sm text-gray-600">
          Only you can see it until an admin verifies it. After saving, you will add a photo of the shop front and
          submit it for verification.
        </p>
        <BusinessForm onSaved={(b) => router.push(`/business/${b.id}`)} />
      </div>
    </RequireAuth>
  );
}
