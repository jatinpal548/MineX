import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { theme } from '@/lib/theme';
import { newId } from '@/lib/ids';
import { useFieldUser } from '@/hooks/useFieldUser';
import {
  Screen,
  AppHeader,
  AppCard,
  AppText,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from '@/components/ui';
import { Icon } from '@/components/Icon';
import { fetchTemplates, OfflineError } from '@/features/inspection/repository';
import { startInspectionOffline } from '@/features/inspection/offlineRepo';
import type { TemplateSummary } from '@/features/inspection/types';

const CATEGORY_ICON: Record<string, Parameters<typeof Icon>[0]['name']> = {
  Safety: 'warning',
  Environmental: 'environment',
  Equipment: 'equipment',
  Compliance: 'documents',
};

export default function TemplatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useFieldUser();

  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const clientRefs = useRef<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await fetchTemplates());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelect = useCallback(
    async (template: TemplateSummary) => {
      if (startingId) return;
      if (!user.mine.mineId) return;
      setStartingId(template.id);
      // stable client_ref so a retry of the same tap doesn't create a duplicate
      let ref = clientRefs.current.get(template.id);
      if (!ref) {
        ref = newId();
        clientRefs.current.set(template.id, ref);
      }
      try {
        const inspectionId = await startInspectionOffline({
          clientRef: ref,
          templateId: template.id,
          templateName: template.name,
          inspectionType: template.category.toLowerCase(),
          mineId: user.mine.mineId,
          departmentId: user.mine.departmentId,
          inspectorId: user.userId ?? '',
        });
        router.replace(`/inspection/${inspectionId}/checklist`);
      } catch (e) {
        setError(
          e instanceof OfflineError
            ? 'You need a connection to start a new inspection. Once started, it works offline.'
            : e instanceof Error
              ? e.message
              : 'Could not start the inspection.',
        );
        setStartingId(null);
      }
    },
    [router, startingId, user.mine.mineId, user.mine.departmentId, user.userId],
  );

  return (
    <Screen scroll contentStyle={{ paddingBottom: insets.bottom + theme.spacing[6] }}>
      <AppHeader title="Start Inspection" subtitle="Choose a template" showBack />

      {!user.loading && !user.mine.mineId ? (
        <EmptyState
          icon="mine"
          title="No mine assigned"
          message="You need a mine role assignment before you can start an inspection. Contact your administrator."
        />
      ) : loading ? (
        <View style={styles.list}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </View>
      ) : error ? (
        <ErrorState title="Couldn't load templates" message={error} onRetry={load} />
      ) : templates.length === 0 ? (
        <EmptyState
          icon="inspection"
          title="No templates available"
          message="No inspection templates are set up yet. Ask your administrator to add one."
        />
      ) : (
        <View style={styles.list}>
          {templates.map((t) => {
            const busy = startingId === t.id;
            return (
              <AppCard
                key={t.id}
                onPress={() => onSelect(t)}
                accessibilityLabel={`Start ${t.name}`}
                style={styles.card}
              >
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Icon
                      name={CATEGORY_ICON[t.category] ?? 'inspection'}
                      size="md"
                      color={theme.color.accent}
                    />
                  </View>
                  <View style={styles.body}>
                    <AppText variant="bodyStrong" numberOfLines={1}>
                      {t.name}
                    </AppText>
                    <AppText variant="caption" tone="secondary" numberOfLines={2}>
                      {t.description ?? `${t.category} inspection`}
                    </AppText>
                    <AppText variant="caption" tone="secondary" style={styles.meta}>
                      {t.category} - {t.itemCount} checks
                    </AppText>
                  </View>
                  {busy ? (
                    <ActivityIndicator color={theme.color.textSecondary} />
                  ) : (
                    <Icon name="chevronRight" size="sm" color={theme.color.textSecondary} />
                  )}
                </View>
              </AppCard>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing[3] },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing[3] },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.status.warning.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  meta: { marginTop: 4 },
});
