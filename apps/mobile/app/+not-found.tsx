import { useRouter } from 'expo-router';
import { Screen, EmptyState } from '@/components/ui';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EmptyState
        icon="search"
        title="Screen not found"
        message="That screen doesn't exist. Head back to your Field home."
        actionLabel="Go to Home"
        onAction={() => router.replace('/home')}
      />
    </Screen>
  );
}
