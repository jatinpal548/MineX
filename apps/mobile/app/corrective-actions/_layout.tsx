import { Stack } from 'expo-router';
import { theme } from '@/lib/theme';

export default function CorrectiveActionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.color.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
