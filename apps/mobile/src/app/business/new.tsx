import { router } from 'expo-router';
import { BusinessForm } from '@/components/business-form';
import { Body, Screen } from '@/components/ui';

export default function NewBusinessScreen() {
  return (
    <Screen>
      <Body muted>
        Your business stays private until an admin verifies it. After registering, add a photo of your shop front and
        submit it for verification.
      </Body>
      <BusinessForm onSaved={(b) => router.replace(`/business/${b.id}`)} />
    </Screen>
  );
}
