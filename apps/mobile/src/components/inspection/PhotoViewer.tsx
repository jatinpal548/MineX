/**
 * Full-screen evidence photo viewer. Swipe between photos, close button,
 * "N of M" counter, and the SIMULATED FIELD EVIDENCE / Queued label preserved.
 */
import { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { AppText } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PressableScale } from '@/components/ui/PressableScale';

export interface ViewerPhoto {
  key: string;
  uri: string;
  label?: string | null;
}

export function PhotoViewer({
  photos,
  initialIndex,
  visible,
  onClose,
}: {
  photos: ViewerPhoto[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');
  const [index, setIndex] = useState(initialIndex);

  const renderItem = ({ item }: ListRenderItemInfo<ViewerPhoto>) => (
    <View style={[styles.page, { width, height }]}>
      <Image source={{ uri: item.uri }} style={styles.image} resizeMode="contain" />
      {item.label ? (
        <View style={[styles.label, { bottom: insets.bottom + theme.spacing[8] }]}>
          <AppText variant="caption" color="#ffffff" style={styles.labelText}>
            {item.label}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <FlatList
          data={photos}
          keyExtractor={(p) => p.key}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, Math.max(0, photos.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        />

        <View style={[styles.topBar, { top: insets.top + theme.spacing[2] }]}>
          <AppText variant="bodyStrong" color="#ffffff">
            {t('evi.viewer', { i: Math.min(index + 1, photos.length), n: photos.length })}
          </AppText>
          <PressableScale
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('action.close')}
            style={styles.closeBtn}
          >
            <Icon name="close" size="md" color="#ffffff" />
          </PressableScale>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  page: { alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute',
    left: theme.spacing[4],
    right: theme.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.radius.sm,
  },
  labelText: { fontWeight: '700', letterSpacing: 0.5 },
});
