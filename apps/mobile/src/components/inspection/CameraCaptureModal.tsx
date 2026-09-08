import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { theme } from '@/lib/theme';
import { AppText, AppButton } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { openSystemSettings } from '@/lib/media/permissions';
import type { PendingImage } from '@/lib/media/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCapture: (image: PendingImage) => void;
}

/**
 * Full-screen camera. Live preview -> shutter -> still preview with Retake / Use
 * photo. Handles permission not-granted and permanently-blocked states. No photo
 * is handed back until the inspector taps "Use photo".
 */
export function CameraCaptureModal({ visible, onClose, onCapture }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<CameraCapturedPicture | null>(null);

  const reset = () => {
    setShot(null);
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const take = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (pic) setShot(pic);
    } catch {
      // stay on the live view; the user can try again
    } finally {
      setBusy(false);
    }
  };

  const usePhoto = () => {
    if (!shot) return;
    onCapture({
      uri: shot.uri,
      width: shot.width,
      height: shot.height,
      mimeType: 'image/jpeg',
      fileSize: null,
      capturedAt: new Date().toISOString(),
      simulated: false,
      source: 'camera',
    });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        {/* ---- permission gate ---- */}
        {!permission ? (
          <SafeAreaView style={styles.center}>
            <ActivityIndicator color={theme.color.textPrimary} />
          </SafeAreaView>
        ) : !permission.granted ? (
          <SafeAreaView style={styles.center}>
            <Icon name="camera" size="xl" color={theme.color.textSecondary} strokeWidth={1.5} />
            <AppText variant="subheading" center style={styles.gap}>
              Camera access needed
            </AppText>
            <AppText variant="body" tone="secondary" center style={styles.permText}>
              MineX Field uses the camera to capture inspection evidence photos.
            </AppText>
            {permission.canAskAgain ? (
              <AppButton
                label="Grant camera access"
                onPress={requestPermission}
                style={styles.gap}
              />
            ) : (
              <AppButton
                label="Open settings"
                variant="secondary"
                onPress={openSystemSettings}
                style={styles.gap}
              />
            )}
            <AppButton label="Cancel" variant="ghost" onPress={close} />
          </SafeAreaView>
        ) : shot ? (
          /* ---- still preview ---- */
          <View style={styles.flex}>
            <Image source={{ uri: shot.uri }} style={styles.flex} resizeMode="contain" />
            <SafeAreaView edges={['bottom']} style={styles.previewBar}>
              <View style={styles.previewBtn}>
                <AppButton
                  label="Retake"
                  variant="secondary"
                  icon="retake"
                  fullWidth
                  onPress={reset}
                />
              </View>
              <View style={styles.previewBtn}>
                <AppButton label="Use photo" icon="completed" fullWidth onPress={usePhoto} />
              </View>
            </SafeAreaView>
          </View>
        ) : (
          /* ---- live camera ---- */
          <View style={styles.flex}>
            <CameraView ref={cameraRef} style={styles.flex} facing={facing} />
            <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
              <IconBtn icon="close" label="Close camera" onPress={close} />
              <IconBtn
                icon="flipCamera"
                label="Flip camera"
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              />
            </SafeAreaView>
            <SafeAreaView edges={['bottom']} style={styles.bottomBar} pointerEvents="box-none">
              <Pressable
                onPress={take}
                accessibilityRole="button"
                accessibilityLabel="Capture photo"
                style={styles.shutterOuter}
              >
                <View style={styles.shutterInner}>
                  {busy ? <ActivityIndicator color={theme.palette.graphite[900]} /> : null}
                </View>
              </Pressable>
            </SafeAreaView>
          </View>
        )}
      </View>
    </Modal>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
}: {
  icon: 'close' | 'flipCamera';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.iconBtn}
    >
      <Icon name={icon} size="md" color="#ffffff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[6],
    backgroundColor: theme.color.background,
    gap: theme.spacing[2],
  },
  gap: { marginTop: theme.spacing[3] },
  permText: { maxWidth: 300 },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing[4],
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: theme.spacing[6],
  },
  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBar: {
    flexDirection: 'row',
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    backgroundColor: theme.color.background,
  },
  previewBtn: { flex: 1 },
});
