import { Stack } from 'expo-router';
import { theme } from '@/lib/theme';
import { InspectionProvider } from '@/features/inspection/InspectionContext';

/**
 * Wraps the whole inspection workflow in one provider so the checklist,
 * observation and review screens share the active draft.
 */
export default function InspectionLayout() {
  return (
    <InspectionProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.background },
          animation: 'slide_from_right',
        }}
      />
    </InspectionProvider>
  );
}
