import { router, Stack } from 'expo-router';
import { Body, Button, Card, Screen } from '@/components/ui';

export default function NotFoundScreen() {
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Card>
        <Body>This page does not exist in the app.</Body>
        <Button title="Go to home" onPress={() => router.replace('/')} />
      </Card>
    </Screen>
  );
}
